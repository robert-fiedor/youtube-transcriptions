#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TRANSCRIPTS_DIR = ROOT / "transcripts"
DATA_DIR = ROOT / "data"
MANIFEST_PATH = DATA_DIR / "transcripts.json"


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    transcripts = []
    for json_path in sorted(TRANSCRIPTS_DIR.glob("*/*.json")):
        item = build_item(json_path)
        if item:
            transcripts.append(item)

    payload = {
        "generated_by": "scripts/build_manifest.py",
        "count": len(transcripts),
        "transcripts": transcripts,
    }
    MANIFEST_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {MANIFEST_PATH} with {len(transcripts)} transcripts")
    return 0


def build_item(json_path: Path) -> dict | None:
    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None

    metadata = payload.get("metadata") or {}
    text = payload.get("text") or ""
    segments = payload.get("segments") or []
    transcript_dir = json_path.parent
    stem = json_path.stem
    txt_path = transcript_dir / f"{stem}.txt"
    srt_path = transcript_dir / f"{stem}.srt"
    vtt_path = transcript_dir / f"{stem}.vtt"

    duration = metadata.get("duration")
    if not duration and segments:
        duration = segments[-1].get("end")

    return {
        "id": transcript_dir.name,
        "video_id": metadata.get("id") or stem,
        "title": metadata.get("title") or stem,
        "uploader": metadata.get("uploader"),
        "source_url": metadata.get("webpage_url"),
        "duration_seconds": duration,
        "duration_label": format_duration(duration),
        "word_count": count_words(text),
        "segment_count": len(segments),
        "excerpt": excerpt(text),
        "txt_path": relative_url(txt_path),
        "json_path": relative_url(json_path),
        "srt_path": relative_url(srt_path),
        "vtt_path": relative_url(vtt_path),
    }


def relative_url(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def count_words(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text))


def excerpt(text: str, limit: int = 260) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rsplit(" ", 1)[0] + "..."


def format_duration(value: float | int | None) -> str | None:
    if value is None:
        return None
    seconds = int(round(float(value)))
    hours, seconds = divmod(seconds, 3600)
    minutes, seconds = divmod(seconds, 60)
    if hours:
        return f"{hours}:{minutes:02}:{seconds:02}"
    return f"{minutes}:{seconds:02}"


if __name__ == "__main__":
    raise SystemExit(main())
