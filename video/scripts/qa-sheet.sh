#!/bin/sh
# Contact sheets of a render at 2 fps (EDL §10 QA): 6x6 tiles per sheet, as many sheets as needed.
#   scripts/qa-sheet.sh out/file.mp4 out/qa/name [tileWidth=320]
# writes out/qa/name_1.jpg, name_2.jpg, ... (tile k covers seconds 18(k-1) .. 18k)
set -e
IN=$1; OUT=$2; TW=${3:-320}
ffmpeg -y -v error -i "$IN" -vf "fps=2,scale=${TW}:-2,tile=6x6:padding=4:color=white" -start_number 1 "${OUT}_%d.jpg"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
echo "duration $D -> $(ls ${OUT}_*.jpg | tr '\n' ' ')"
