#!/bin/sh
# Synthesises a minimal 120 bpm percussion bed (kick, clap, hats, bass, riser) on the film's
# 15-frame beat grid. Parametrised per cut:
#   D      total seconds              START  first downbeat (kick + bass start)
#   END    last bar ends              HIT    outro hit (the full stop)
#   OUT    output wav
#   D=51.0 START=4.0 END=47.0 HIT=47.0 OUT=public/audio/bed-master.wav sh scripts/make-bed.sh
set -e
D=${D:-51.0}; START=${START:-4.0}; END=${END:-47.0}; HIT=${HIT:-47.0}; OUT=${OUT:-public/audio/bed.wav}
RS=$(echo "$START - 0.65" | bc -l)
FADE=$(echo "$D - 0.9" | bc -l)
TAIL=$(echo "$HIT + 1.6" | bc -l)
K='sin(2*PI*(46*T+(150/30)*(1-exp(-30*T))))*exp(-7*T)'
kick_main=$(echo "$K" | sed "s/T/mod(max(0,t-$START),0.5)/g")
kick_end=$(echo "$K" | sed "s/T/max(0,t-$HIT)/g")
ffmpeg -y -v error \
  -f lavfi -i "aevalsrc=exprs='between(t,$START,$END-0.01)*${kick_main} + gte(t,$HIT)*1.1*${kick_end}':s=48000:d=$D" \
  -f lavfi -i "aevalsrc=exprs='between(t,$START+0.25,$END-0.1)*(2*random(0)-1)*exp(-80*mod(t-$START-0.25,0.5))*(0.8+0.2*sin(2*PI*t))':s=48000:d=$D" \
  -f lavfi -i "aevalsrc=exprs='between(t,$START+0.5,$END-0.1)*(2*random(1)-1)*(exp(-26*mod(t-$START-0.5,1.0))+0.5*exp(-26*max(0,mod(t-$START-0.5,1.0)-0.012)))':s=48000:d=$D" \
  -f lavfi -i "aevalsrc=exprs='between(t,$RS,$START)*(2*random(2)-1)*pow(max(0,t-$RS)/0.65,2.2) + between(t,$START,$START+0.7)*(2*random(3)-1)*0.6*exp(-6*max(0,t-$START)) + between(t,$HIT,$TAIL)*(2*random(4)-1)*0.35*exp(-3.2*max(0,t-$HIT))':s=48000:d=$D" \
  -f lavfi -i "aevalsrc=exprs='between(t,$START,$END-0.01)*sin(2*PI*(if(lt(mod(t-$START,4),2),55,if(lt(mod(t-$START,4),3),49,41.2)))*t)*(1-exp(-40*mod(t-$START,0.5)))*exp(-3.2*mod(t-$START,0.5))':s=48000:d=$D" \
  -filter_complex "\
[0]volume=0.95,lowpass=f=4000[k];\
[1]highpass=f=7500,volume=0.32[h];\
[2]bandpass=f=1600:w=1200,volume=0.6[c];\
[3]highpass=f=900,lowpass=f=9000,volume=0.42[r];\
[4]lowpass=f=180,volume=0.5[b];\
[k][h][c][r][b]amix=inputs=5:normalize=0,aformat=channel_layouts=stereo,alimiter=limit=0.89,afade=t=out:st=$FADE:d=0.9[out]" \
  -map "[out]" -ar 48000 "$OUT"
echo "bed $OUT: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s"
