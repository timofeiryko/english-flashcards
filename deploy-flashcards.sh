#!/bin/sh
set -eu
APP=/opt/english-flashcards
test ! -e "$APP"
install -d -m 755 "$APP"
tar -xzf /tmp/english-flashcards-release.tar.gz -C "$APP"
python3 -m venv "$APP/.venv"
"$APP/.venv/bin/pip" install -q -r "$APP/requirements.txt"
id english-flashcards >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin english-flashcards
cat > /etc/systemd/system/english-flashcards.service <<'UNIT'
[Unit]
Description=Academic English flashcards
After=network.target
[Service]
User=english-flashcards
Group=english-flashcards
WorkingDirectory=/opt/english-flashcards
ExecStart=/opt/english-flashcards/.venv/bin/python /opt/english-flashcards/server.py
Environment=PORT=8842
Environment=COOKIE_SECURE=1
Environment=COOKIE_PATH=/english/
Environment=DATABASE_PATH=/var/lib/english-flashcards/progress.sqlite3
StateDirectory=english-flashcards
StateDirectoryMode=0700
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
MemoryMax=128M
Restart=on-failure
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now english-flashcards
python3 - <<'PY'
from pathlib import Path
import shutil, time
p=Path('/etc/nginx/sites-enabled/tryko.site').resolve()
shutil.copy2(p,str(p)+'.before-english-'+str(int(time.time())))
s=p.read_text()
assert 'location /english' not in s
marker='    location / {\n'
assert s.count(marker)==1
s=s.replace(marker,'''    location = /english { return 302 /english/; }
    location ^~ /english/ {
        proxy_pass http://127.0.0.1:8842/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

'''+marker)
p.write_text(s)
PY
nginx -t
systemctl reload nginx
systemctl is-active english-flashcards
