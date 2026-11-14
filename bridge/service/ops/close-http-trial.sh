#!/usr/bin/env bash
set -euo pipefail
umask 077
python3 /opt/rikaz-adms/ops/close-http-trial.py "$1"
nginx -t
systemctl reload nginx
docker compose -f /opt/rikaz-adms/compose.yml up -d --no-deps --force-recreate --wait --wait-timeout 90 bridge
systemctl disable --now rikaz-adms-http-trial-close.timer
/usr/local/sbin/rikaz-adms-backup
