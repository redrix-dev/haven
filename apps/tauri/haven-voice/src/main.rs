//! haven-voice — native LiveKit voice sidecar for Haven on Linux.
//!
//! Adapted from LiveKit's `local_audio` example (proven on this hardware).
//! Joins a room with a SERVER-MINTED token (from Haven's `voice-token` function
//! — never the API secret), captures the mic, plays remote participants, and
//! runs libwebrtc echo cancellation. Driven by the Tauri app over stdio using a
//! newline-delimited JSON protocol (one JSON object per line — see protocol.rs):
//!
//!   stdin  (commands):  {"type":"mute"} | {"type":"unmute"} | {"type":"leave"} | …
//!   stdout (events):    {"type":"connected"} | {"type":"ready"} |
//!                       {"type":"disconnected"} | {"type":"error","message":…}
//!
//! Config via env:  LIVEKIT_URL, LIVEKIT_TOKEN.
//!
//! Test standalone (no Tauri):
//!   LIVEKIT_URL=wss://... LIVEKIT_TOKEN=<join jwt> cargo run
//!   then type JSON commands on stdin, e.g. {"type":"mute"}

mod audio_capture;
mod audio_mixer;
mod audio_playback;
mod db_meter;
mod protocol;

use anyhow::{anyhow, Result};
use audio_capture::AudioCapture;
use audio_mixer::AudioMixer;
use audio_playback::AudioPlayback;
use cpal::traits::{DeviceTrait, HostTrait};
use cpal::{SampleRate, StreamConfig};
use futures_util::StreamExt;
use livekit::{
    options::TrackPublishOptions,
    track::{LocalAudioTrack, LocalTrack, RemoteTrack, TrackSource},
    webrtc::{
        audio_frame::AudioFrame,
        audio_source::native::NativeAudioSource,
        audio_stream::native::NativeAudioStream,
        native::apm::AudioProcessingModule,
        prelude::{AudioSourceOptions, RtcAudioSource},
    },
    Room, RoomEvent, RoomOptions,
};
use protocol::{Command, DeviceInfo, Event};
use std::collections::HashMap;
use std::io::Write;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{mpsc, Mutex};

const SAMPLE_RATE: u32 = 48_000;
const SAMPLES_PER_10MS: usize = (SAMPLE_RATE / 100) as usize;

/// Emit one event to the parent (Tauri) as a JSON line and flush immediately.
fn emit(event: &Event) {
    match serde_json::to_string(event) {
        Ok(line) => {
            println!("{line}");
            let _ = std::io::stdout().flush();
        }
        Err(e) => eprintln!("haven-voice: failed to serialize event {event:?}: {e}"),
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();

    let url = std::env::var("LIVEKIT_URL").map_err(|_| anyhow!("LIVEKIT_URL not set"))?;
    let token = std::env::var("LIVEKIT_TOKEN").map_err(|_| anyhow!("LIVEKIT_TOKEN not set"))?;

    let mut opts = RoomOptions::default();
    opts.auto_subscribe = true;
    let room = match Room::connect(&url, &token, opts).await {
        Ok((room, _rx)) => Arc::new(room),
        Err(e) => {
            emit(&Event::Error { message: format!("connect_failed: {e}") });
            return Err(e.into());
        }
    };
    emit(&Event::Connected);

    // ── shared echo-cancellation processor (APM) ───────────────────────────
    // args: echo_cancellation, auto_gain_control, high_pass_filter, noise_suppression
    let apm = Arc::new(Mutex::new(AudioProcessingModule::new(true, true, false, true)));
    let _ = apm.lock().await.set_stream_delay_ms(50);

    // ── publish the microphone ─────────────────────────────────────────────
    // AEC/NS/AGC are off on the source because we run the APM ourselves below.
    let source = NativeAudioSource::new(
        AudioSourceOptions {
            echo_cancellation: false,
            noise_suppression: false,
            auto_gain_control: false,
        },
        SAMPLE_RATE,
        1,
        1000,
    );
    let track =
        LocalAudioTrack::create_audio_track("microphone", RtcAudioSource::Native(source.clone()));
    room.local_participant()
        .publish_track(
            LocalTrack::Audio(track.clone()),
            TrackPublishOptions { source: TrackSource::Microphone, ..Default::default() },
        )
        .await?;

    let host = cpal::default_host();

    // The mpsc channels and the mixer are STABLE for the whole session; only the
    // cpal capture/playback streams below are torn down and rebuilt when the user
    // picks a different device (see the SetInputDevice/SetOutputDevice handlers).
    let (mic_tx, mut mic_rx) = mpsc::unbounded_channel::<Vec<i16>>();
    let (ref_tx, mut ref_rx) = mpsc::unbounded_channel::<Vec<i16>>();
    let (db_tx, _db_rx) = mpsc::unbounded_channel::<f32>();
    let mixer = AudioMixer::with_reference_audio(SAMPLE_RATE, 1, 1.0, db_tx, ref_tx);

    // mic capture → APM (forward stream) → livekit. Held in an Option so a device
    // switch can drop the old stream (freeing the device) before opening the new.
    let input_device = resolve_input_device(&host, None)?;
    let mut capture = Some(build_capture(input_device, mic_tx.clone()).await?);

    {
        let apm = apm.clone();
        let source = source.clone();
        tokio::spawn(async move {
            let mut buf: Vec<i16> = Vec::new();
            while let Some(data) = mic_rx.recv().await {
                buf.extend_from_slice(&data);
                while buf.len() >= SAMPLES_PER_10MS {
                    let mut chunk: Vec<i16> = buf.drain(..SAMPLES_PER_10MS).collect();
                    let _ = apm.lock().await.process_stream(&mut chunk, SAMPLE_RATE as i32, 1);
                    let frame = AudioFrame {
                        data: chunk.into(),
                        sample_rate: SAMPLE_RATE,
                        num_channels: 1,
                        samples_per_channel: SAMPLES_PER_10MS as u32,
                    };
                    let _ = source.capture_frame(&frame).await;
                }
            }
        });
    }

    // ── playback: mixer (feeds reference audio to AEC) + output stream ──────
    let output_device = resolve_output_device(&host, None)?;
    let mut playback = Some(build_playback(output_device, mixer.clone()).await?);

    // reference audio (what we play) → APM (reverse stream) for echo cancellation
    {
        let apm = apm.clone();
        tokio::spawn(async move {
            let mut buf: Vec<i16> = Vec::new();
            while let Some(data) = ref_rx.recv().await {
                buf.extend_from_slice(&data);
                while buf.len() >= SAMPLES_PER_10MS {
                    let mut chunk: Vec<i16> = buf.drain(..SAMPLES_PER_10MS).collect();
                    let _ = apm
                        .lock()
                        .await
                        .process_reverse_stream(&mut chunk, SAMPLE_RATE as i32, 1);
                }
            }
        });
    }

    // Per-participant playback gain (LiveKit identity → 0.0..=1.0), applied
    // before the mixer. Absent == full volume. Shared with the stdin loop so
    // slider moves take effect live. The identity equals the Haven user id (the
    // token mints it that way), so it matches the UI's memberVolumes keys.
    let member_gains: Arc<std::sync::Mutex<HashMap<String, f32>>> =
        Arc::new(std::sync::Mutex::new(HashMap::new()));

    // ── remote audio tracks → mixer ────────────────────────────────────────
    {
        let room = room.clone();
        let mixer = mixer.clone();
        let member_gains = member_gains.clone();
        tokio::spawn(async move {
            let mut events = room.subscribe();
            while let Some(event) = events.recv().await {
                // Only the audio-critical event; the participant roster is driven
                // by the existing Supabase presence channel on the UI side.
                if let RoomEvent::TrackSubscribed { track, participant, .. } = event {
                    if let RemoteTrack::Audio(audio_track) = track {
                        let mut stream =
                            NativeAudioStream::new(audio_track.rtc_track(), SAMPLE_RATE as i32, 1);
                        let mixer = mixer.clone();
                        let member_gains = member_gains.clone();
                        let identity = participant.identity().to_string();
                        tokio::spawn(async move {
                            while let Some(frame) = stream.next().await {
                                let samples = frame.data.as_ref();
                                let gain = member_gains
                                    .lock()
                                    .unwrap()
                                    .get(&identity)
                                    .copied()
                                    .unwrap_or(1.0);
                                if gain >= 0.999 {
                                    mixer.add_audio_data(samples);
                                } else {
                                    let scaled: Vec<i16> = samples
                                        .iter()
                                        .map(|&s| (s as f32 * gain) as i16)
                                        .collect();
                                    mixer.add_audio_data(&scaled);
                                }
                            }
                        });
                    }
                }
            }
        });
    }

    emit(&Event::Ready);

    // ── stdin control loop (JSON commands, one per line) ───────────────────
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    loop {
        tokio::select! {
            line = lines.next_line() => match line {
                Ok(Some(cmd)) => {
                    let trimmed = cmd.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<Command>(trimmed) {
                        Ok(Command::Mute) => track.mute(),
                        Ok(Command::Unmute) => track.unmute(),
                        Ok(Command::Leave) => break,
                        Ok(Command::EnumerateDevices) => {
                            let (inputs, outputs) = enumerate_devices(&host);
                            emit(&Event::Devices { inputs, outputs });
                        }
                        Ok(Command::SetInputDevice { id }) => {
                            match resolve_input_device(&host, Some(id.as_str())) {
                                Ok(device) => {
                                    // Drop the old stream first so the device is
                                    // free to reopen (some backends are exclusive).
                                    drop(capture.take());
                                    match build_capture(device, mic_tx.clone()).await {
                                        Ok(c) => capture = Some(c),
                                        Err(e) => emit(&Event::Error {
                                            message: format!("input_device_failed: {e}"),
                                        }),
                                    }
                                }
                                Err(e) => emit(&Event::Error {
                                    message: format!("input_device_error: {e}"),
                                }),
                            }
                        }
                        Ok(Command::SetOutputDevice { id }) => {
                            match resolve_output_device(&host, Some(id.as_str())) {
                                Ok(device) => {
                                    drop(playback.take());
                                    match build_playback(device, mixer.clone()).await {
                                        Ok(p) => playback = Some(p),
                                        Err(e) => emit(&Event::Error {
                                            message: format!("output_device_failed: {e}"),
                                        }),
                                    }
                                }
                                Err(e) => emit(&Event::Error {
                                    message: format!("output_device_error: {e}"),
                                }),
                            }
                        }
                        Ok(Command::SetMasterVolume { value }) => mixer.set_volume(value),
                        Ok(Command::SetMemberVolume { identity, value }) => {
                            member_gains
                                .lock()
                                .unwrap()
                                .insert(identity, value.clamp(0.0, 1.0));
                        }
                        Err(e) => eprintln!("haven-voice: bad command {trimmed:?}: {e}"),
                    }
                }
                // stdin closed → parent process gone → exit.
                _ => break,
            },
            _ = tokio::signal::ctrl_c() => break,
        }
    }

    let _ = room.close().await;
    emit(&Event::Disconnected);
    Ok(())
}

/// Resolve an input device by cpal name, or the system default when `id` is None.
fn resolve_input_device(host: &cpal::Host, id: Option<&str>) -> Result<cpal::Device> {
    match id {
        Some(name) => host
            .input_devices()?
            .find(|d| d.name().ok().as_deref() == Some(name))
            .ok_or_else(|| anyhow!("input device {name:?} not found")),
        None => host
            .default_input_device()
            .ok_or_else(|| anyhow!("no default input device")),
    }
}

/// Resolve an output device by cpal name, or the system default when `id` is None.
fn resolve_output_device(host: &cpal::Host, id: Option<&str>) -> Result<cpal::Device> {
    match id {
        Some(name) => host
            .output_devices()?
            .find(|d| d.name().ok().as_deref() == Some(name))
            .ok_or_else(|| anyhow!("output device {name:?} not found")),
        None => host
            .default_output_device()
            .ok_or_else(|| anyhow!("no default output device")),
    }
}

/// List selectable input/output devices. `id` == cpal device name (see
/// `DeviceInfo`); devices whose name can't be read are skipped.
fn enumerate_devices(host: &cpal::Host) -> (Vec<DeviceInfo>, Vec<DeviceInfo>) {
    fn to_infos<I: Iterator<Item = cpal::Device>>(devices: I) -> Vec<DeviceInfo> {
        devices
            .filter_map(|d| d.name().ok())
            .map(|name| DeviceInfo { id: name.clone(), label: name })
            .collect()
    }
    let inputs = host.input_devices().map(to_infos).unwrap_or_default();
    let outputs = host.output_devices().map(to_infos).unwrap_or_default();
    (inputs, outputs)
}

/// Build a mic-capture stream on `device`, downmixing to mono i16 into `mic_tx`.
/// Rebuilt on device switch; the `mic_tx` end stays wired to the APM pipeline.
async fn build_capture(
    device: cpal::Device,
    mic_tx: mpsc::UnboundedSender<Vec<i16>>,
) -> Result<AudioCapture> {
    let supported = device.default_input_config()?;
    let channels = supported.channels() as u32;
    let config = StreamConfig {
        channels: supported.channels(),
        sample_rate: SampleRate(SAMPLE_RATE),
        buffer_size: cpal::BufferSize::Default,
    };
    AudioCapture::new(
        device,
        config,
        supported.sample_format(),
        mic_tx,
        None,
        0, // capture channel 0 (voice is mono — LiveKit downmixes anyway)
        channels,
    )
    .await
}

/// Build a playback stream on `device`, pulling mixed mono i16 from `mixer`.
/// Rebuilt on device switch; the `mixer` (and its AEC reference tap) is stable.
async fn build_playback(device: cpal::Device, mixer: AudioMixer) -> Result<AudioPlayback> {
    let supported = device.default_output_config()?;
    let config = StreamConfig {
        channels: 1,
        sample_rate: SampleRate(SAMPLE_RATE),
        buffer_size: cpal::BufferSize::Default,
    };
    AudioPlayback::new(device, config, supported.sample_format(), mixer).await
}
