#!/usr/bin/env bash
# Genera assets sintéticos para fake-media de Chromium (Fase 3 stress test).
#
# Requiere: ffmpeg instalado.
#   macOS: brew install ffmpeg
#   Linux: apt install ffmpeg
#
# Output:
#   tests/stress/assets/fake-cam-640x480.y4m   (video sintético 60s, testsrc)
#   tests/stress/assets/fake-mic.wav           (tono 440Hz 60s, mono 48kHz)
#
# Refs:
#   Chromium fake capture: https://source.chromium.org/chromium/chromium/src/+/main:media/capture/video/fake_video_capture_device.cc
#   Y4M format: https://wiki.multimedia.cx/index.php/YUV4MPEG2

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="${SCRIPT_DIR}/../../assets"
mkdir -p "${ASSETS_DIR}"

VIDEO_OUT="${ASSETS_DIR}/fake-cam-640x480.y4m"
AUDIO_OUT="${ASSETS_DIR}/fake-mic.wav"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg no encontrado. Instalá: brew install ffmpeg (o apt install ffmpeg)" >&2
  exit 1
fi

echo "[fake-assets] generando video Y4M en ${VIDEO_OUT}..."
ffmpeg -y -hide_banner -loglevel warning \
  -f lavfi -i "testsrc=size=640x480:rate=30:duration=60" \
  -pix_fmt yuv420p "${VIDEO_OUT}"

echo "[fake-assets] generando audio WAV en ${AUDIO_OUT}..."
ffmpeg -y -hide_banner -loglevel warning \
  -f lavfi -i "sine=frequency=440:duration=60" \
  -ac 1 -ar 48000 "${AUDIO_OUT}"

ls -lh "${VIDEO_OUT}" "${AUDIO_OUT}"
echo "[fake-assets] listo ✓"
