#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/obi-ism-reader/tmp/landmark-sequence"
STILLS="$ROOT/stills"
OUT="$ROOT/obi-ism-nigeria-landmark-tour.mp4"
WORK="$ROOT/rendered"
mkdir -p "$WORK"

# Each generated still becomes an eight-second editorial move rather than a static hold.
render_scene() {
  local input="$1"
  local output="$2"
  local direction="$3"
  local zoom_expression

  case "$direction" in
    in) zoom_expression="min(zoom+0.00055,1.14)" ;;
    out) zoom_expression="if(eq(on,1),1.14,max(zoom-0.00055,1.0))" ;;
    *) zoom_expression="min(zoom+0.00042,1.10)" ;;
  esac

  ffmpeg -hide_banner -loglevel error -y \
    -loop 1 -i "$input" -t 8 \
    -vf "scale=1600:900,zoompan=z='${zoom_expression}':x='iw/2-(iw/zoom/2)+sin(on/22)*55':y='ih/2-(ih/zoom/2)+cos(on/31)*24':d=240:s=1280x720:fps=30,format=yuv420p" \
    -an -c:v libx264 -preset medium -crf 20 -movflags +faststart "$output"
}

render_scene "$STILLS/02-abuja.jpg" "$WORK/02-abuja.mp4" in
render_scene "$STILLS/03-zuma.jpg" "$WORK/03-zuma.mp4" out
render_scene "$STILLS/04-kano.jpg" "$WORK/04-kano.mp4" in
render_scene "$STILLS/05-olumo.jpg" "$WORK/05-olumo.mp4" out
render_scene "$STILLS/05-south-eastern.jpg" "$WORK/06-idanre.mp4" in
render_scene "$STILLS/07-obudu.jpg" "$WORK/07-obudu.mp4" out
render_scene "$STILLS/06-calabar.jpg" "$WORK/08-calabar.mp4" in

# Normalize the authentic Lagos motion clip and join it with the landmark journey.
ffmpeg -hide_banner -loglevel error -y \
  -i "$ROOT/01-lagos.mp4" -t 8 \
  -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,format=yuv420p" \
  -an -c:v libx264 -preset medium -crf 20 -movflags +faststart "$WORK/01-lagos.mp4"

cat > "$WORK/inputs.txt" <<LIST
file '$WORK/01-lagos.mp4'
file '$WORK/02-abuja.mp4'
file '$WORK/03-zuma.mp4'
file '$WORK/04-kano.mp4'
file '$WORK/05-olumo.mp4'
file '$WORK/06-idanre.mp4'
file '$WORK/07-obudu.mp4'
file '$WORK/08-calabar.mp4'
LIST

ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$WORK/inputs.txt" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart -an "$OUT"

ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "$OUT"
