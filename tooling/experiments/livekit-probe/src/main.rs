//! Slice-0 de-risk probe for native LiveKit voice on Linux.
//!
//! Goal: prove the `livekit` Rust SDK (and its libwebrtc dependency) builds,
//! links, and can actually CONNECT to a LiveKit room on the Arch box — the one
//! unknown that blocks the whole native-voice plan. No audio yet; that's slice 1.
//!
//! Run:
//!   export LIVEKIT_URL="wss://<your-livekit-host>"
//!   export LIVEKIT_TOKEN="<a join token for any room>"
//!   cargo run
//!
//! Get a token the easy way from the repo root (uses your existing infra):
//!   - hit the `voice-token` edge function with a Supabase JWT + a real
//!     voice channel's { communityId, channelId }, OR
//!   - `lk token create --api-key <k> --api-secret <s> --join --room probe \
//!        --identity probe --valid-for 1h`  (LiveKit CLI)
//!
//! Success = it prints "CONNECTED to room ..." and then streams RoomEvents
//! (e.g. ParticipantConnected) for ~60s without crashing. That means the
//! native stack works here and we proceed to slice 1 (audio I/O).

use std::time::Duration;

use livekit::{Room, RoomOptions};

#[tokio::main]
async fn main() {
    let url = std::env::var("LIVEKIT_URL")
        .expect("set LIVEKIT_URL (wss://...) — the serverUrl from voice-token");
    let token = std::env::var("LIVEKIT_TOKEN")
        .expect("set LIVEKIT_TOKEN — a room join JWT");

    println!("connecting to {url} ...");

    let (room, mut events) = match Room::connect(&url, &token, RoomOptions::default()).await {
        Ok(pair) => pair,
        Err(err) => {
            eprintln!("FAILED to connect: {err}");
            std::process::exit(1);
        }
    };

    println!(
        "CONNECTED to room '{}' as '{}'. Local participants see you now.",
        room.name(),
        room.local_participant().identity()
    );
    println!("streaming RoomEvents for 60s (Ctrl-C to stop early)...\n");

    let pump = async {
        while let Some(event) = events.recv().await {
            // {:?} is enough to confirm the event pipeline is alive end-to-end.
            println!("event: {event:?}");
        }
    };

    tokio::select! {
        _ = pump => println!("\nevent stream ended"),
        _ = tokio::time::sleep(Duration::from_secs(60)) => println!("\n60s elapsed — probe done"),
    }

    let _ = room.close().await;
    println!("disconnected cleanly. slice 0 = PASS if you saw CONNECTED above.");
}
