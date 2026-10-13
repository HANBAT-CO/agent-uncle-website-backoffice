#!/bin/sh
# Renders every deliverable to out/ (same filenames as v2 round 1).
# CPU is shared with other work: Remotion renders with CONC (default 4) tabs, ffmpeg encodes with 4 threads.
set -e
cd "$(dirname "$0")/.."
CONC=${CONC:-4}
R="--concurrency=$CONC --timeout=90000 --log=error"
TMP=out/.tmp; mkdir -p $TMP
npx remotion render Promo16x9 $TMP/master.mp4 --codec=h264 --crf=18 $R
sh scripts/master-audio.sh $TMP/master.mp4 out/agent-uncle-promo-16x9.mp4
ffmpeg -y -v error -i out/agent-uncle-promo-16x9.mp4 -threads 4 -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p -c:a libopus -b:a 160k out/agent-uncle-promo-16x9.webm
npx remotion still Promo16x9 out/agent-uncle-promo-poster.jpg --frame=$(node --no-warnings scripts/total.mjs) --image-format=jpeg --jpeg-quality=90 --log=error
npx remotion render Promo9x16 $TMP/social.mp4 --codec=h264 --crf=18 $R
sh scripts/master-audio.sh $TMP/social.mp4 out/agent-uncle-promo-9x16.mp4
npx remotion render HeroLoop out/agent-uncle-hero-loop.mp4 --codec=h264 --crf=18 --muted $R
ffmpeg -y -v error -i out/agent-uncle-hero-loop.mp4 -threads 4 -an -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p out/agent-uncle-hero-loop.webm
rm -rf $TMP
echo DONE
