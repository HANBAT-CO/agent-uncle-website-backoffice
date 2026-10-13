#!/bin/sh
# True-peak limiter for the final mix (critic round 2: the master hit -0.6 dBTP).
# The mix is upsampled 4x so the limiter sees inter-sample peaks, limited at -1.5 dBFS
# (0.84), then resampled to 48 kHz and re-encoded; the video stream is copied untouched.
#   scripts/master-audio.sh in.mp4 out.mp4      (AAC 256k)
#   scripts/master-audio.sh in.webm out.webm    (Opus 160k)
set -e
IN=$1; OUT=$2
case "$OUT" in
  *.webm) ACODEC="-c:a libopus -b:a 160k" ;;
  *) ACODEC="-c:a aac -b:a 256k -movflags +faststart" ;;
esac
ffmpeg -y -v error -i "$IN" -map 0:v -map 0:a -c:v copy \
  -af "aresample=192000,alimiter=limit=0.84:attack=2:release=60:level=false,aresample=48000" \
  $ACODEC "$OUT"
ffmpeg -nostats -i "$OUT" -map 0:a -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tr -s ' '
