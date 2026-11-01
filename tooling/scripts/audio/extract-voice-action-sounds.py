"""Derive action cues from Haven's original tones (macOS: python3 <this file>)."""
import array
from pathlib import Path
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[3]
AUDIO = ROOT / "packages/shared/src/assets/audio/voice"

with tempfile.TemporaryDirectory() as temporary:
    for source, outputs in [
        ("haven-connected", [("haven-unmuted", .334), ("haven-deafened", .174)]),
        ("haven-disconnected", [("haven-muted", .334), ("haven-undeafened", .174)]),
    ]:
        decoded = Path(temporary) / (source + ".wav")
        subprocess.run(["afconvert", str(AUDIO / (source + ".mp3")), str(decoded), "-f", "WAVE", "-d", "LEI16"], check=True)
        with wave.open(str(decoded)) as original:
            rate, channels = original.getframerate(), original.getnchannels()
            raw = original.readframes(original.getnframes())
        for name, start in outputs:
            samples = array.array("h", raw[int(start * rate) * channels * 2:])
            frames = len(samples) // channels
            # Five-ms fades eliminate discontinuities at the cut; pitch is unchanged.
            fade = int(.005 * rate)
            for frame in range(frames):
                gain = min(1, frame / fade, (frames - frame - 1) / fade)
                for channel in range(channels):
                    index = frame * channels + channel
                    samples[index] = round(samples[index] * gain)
            with wave.open(str(AUDIO / (name + ".wav")), "wb") as output:
                output.setnchannels(channels)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(samples.tobytes())
            print(f"{name}: {frames / rate:.3f}s from {source} at {start:.3f}s")
