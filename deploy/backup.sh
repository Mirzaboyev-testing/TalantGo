#!/bin/sh
# Daily database backup after 03:00 Tashkent. A dump replaces nothing until pg_restore can read it.
set -u
KEEP=7
DIR=/backups
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') backup: $*"; }

while true; do
  today=$(TZ=Asia/Tashkent date +%Y%m%d)
  hour=$(TZ=Asia/Tashkent date +%H)
  target="$DIR/careerflow-$today.dump"
  if [ ! -f "$target" ] && [ "${hour#0}" -ge 3 ] 2>/dev/null; then
    if pg_dump -Fc -Z 6 -f "$target.tmp" && pg_restore --list "$target.tmp" > /dev/null && mv "$target.tmp" "$target"; then
      ls -1t "$DIR"/careerflow-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
      log "ok: $(du -k "$target" | cut -f1) KB"
    else
      rm -f "$target.tmp"
      log "FAILED, retrying in an hour"
      sleep 3600
      continue
    fi
  fi
  sleep 300
done
