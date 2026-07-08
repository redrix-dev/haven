//! haven-voice — native LiveKit voice sidecar for Haven on Linux.
//!
//! Adapted from LiveKit's `local_audio` example (proven on this hardware).
//! Joins a room with a SERVER-MINTED token (from Haven's `voice-token` function
//! — never the API secret), captures the mic, plays remote participants, and
//! runs libwebrtc echo cancellation. Driven by the Tauri app over stdio:
//!
//!   stdin  (one command per line):  mute | unmute | leave
//!   stdout (one event per line):    connected | ready | disconnected | error <msg>
//!
//! Config via env:  LIVEKIT_URL, LIVEKIT_TOKEN.
//!
//! Test standalone (no Tauri):
//!   LIVEKIT_URL=wss://... LIVEKIT_TOKEN=<join jwt> cargo run

mod audio_capture;
mod audio_mixer;
mod audio_playback;
mod db_meter;

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
use std::io::Write;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{mpsc, Mutex};

const SAMPLE_RATE: u32 = 48_000;
const SAMPLES_PER_10MS: usize = (SAMPLE_RATE / 100) as usize;

/// Emit one event line to the parent (Tauri) and flush immediately.
fn emit(line: &str) {
    println!("{line}");
    let _ = std::io::stdout().flush();
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
            emit(&format!("error connect_failed: {e}"));
            return Err(e.into());
        }
    };
    emit("connected");

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

    // mic capture → APM (forward stream) → livekit
    let input_device = host
        .default_input_device()
        .ok_or_else(|| anyhow!("no default input device"))?;
    let in_supported = input_device.default_input_config()?;
    let in_channels = in_supported.channels() as u32;
    let in_config = StreamConfig {
        channels: in_supported.channels(),
        sample_rate: SampleRate(SAMPLE_RATE),
        buffer_size: cpal::BufferSize::Default,
    };
    let (mic_tx, mut mic_rx) = mpsc::unbounded_channel::<Vec<i16>>();
    let _capture = AudioCapture::new(
        input_device,
        in_config,
        in_supported.sample_format(),
        mic_tx,
        None,
        0, // capture channel 0
        in_channels,
    )
    .await?;

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
    let (ref_tx, mut ref_rx) = mpsc::unbounded_channel::<Vec<i16>>();
    let (db_tx, _db_rx) = mpsc::unbounded_channel::<f32>();
    let mixer = AudioMixer::with_reference_audio(SAMPLE_RATE, 1, 1.0, db_tx, ref_tx);

    let output_device = host
        .default_output_device()
        .ok_or_else(|| anyhow!("no default output device"))?;
    let out_supported = output_device.default_output_config()?;
    let out_config = StreamConfig {
        channels: 1,
        sample_rate: SampleRate(SAMPLE_RATE),
        buffer_size: cpal::BufferSize::Default,
    };
    let _playback = AudioPlayback::new(
        output_device,
        out_config,
        out_supported.sample_format(),
        mixer.clone(),
    )
    .await?;

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

    // ── remote audio tracks → mixer ────────────────────────────────────────
    {
        let room = room.clone();
        let mixer = mixer.clone();
        tokio::spawn(async move {
            let mut events = room.subscribe();
            while let Some(event) = events.recv().await {
                // Only the audio-critical event for now; participant roster is
                // driven by the existing Supabase presence channel on the UI side.
                if let RoomEvent::TrackSubscribed { track, .. } = event {
                    if let RemoteTrack::Audio(audio_track) = track {
                        let mut stream =
                            NativeAudioStream::new(audio_track.rtc_track(), SAMPLE_RATE as i32, 1);
                        let mixer = mixer.clone();
                        tokio::spawn(async move {
                            while let Some(frame) = stream.next().await {
                                mixer.add_audio_data(frame.data.as_ref());
                            }
                        });
                    }
                }
            }
        });
    }

    emit("ready");

    // ── stdin control loop (mute / unmute / leave) ─────────────────────────
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    loop {
        tokio::select! {
            line = lines.next_line() => match line {
                Ok(Some(cmd)) => match cmd.trim() {
                    "mute" => track.mute(),
                    "unmute" => track.unmute(),
                    "leave" => break,
                    "" => {}
                    other => eprintln!("haven-voice: unknown command {other:?}"),
                },
                // stdin closed → parent process gone → exit.
                _ => break,
            },
            _ = tokio::signal::ctrl_c() => break,
        }
    }

    let _ = room.close().await;
    emit("disconnected");
    Ok(())
}
