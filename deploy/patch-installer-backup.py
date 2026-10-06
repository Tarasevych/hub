#!/usr/bin/env python3
"""Keep deploy shell scripts executable so systemd does not fail with 203/EXEC."""
from pathlib import Path

paths = [
    Path("/srv/mijn-ruimte/current/deploy/installeer-app.sh"),
    Path("/srv/mijn-ruimte/mcp-staging/overlay/deploy/installeer-app.sh"),
]
old_chmod = "  chmod -R u=rwX,g=rX,o= \"$doel\"\n"
new_chmod = old_chmod + "  find \"$doel/deploy\" -type f -name '*.sh' -exec chmod 750 {} +\n"
old_start = "    melding \"back-up vóór migratie…\"\n    systemctl start mijn-ruimte-backup.service"
new_start = "    melding \"back-up vóór migratie…\"\n    chmod 750 /srv/mijn-ruimte/current/deploy/backup-maken.sh 2>/dev/null || true\n    systemctl start mijn-ruimte-backup.service"
old_py = "  python3 \"$doel/deploy/patch-owner-plum.py\" \"$doel/src/App.tsx\"\n"
new_py = old_py + "  if [ -f \"$doel/deploy/patch-backup-copy.py\" ]; then python3 \"$doel/deploy/patch-backup-copy.py\" \"$doel\" || fout \"patch-backup-copy mislukt\"; fi\n"
for path in paths:
    if not path.is_file():
        print("installer-skip")
        continue
    text = path.read_text()
    changed = False
    if "find \"$doel/deploy\" -type f -name '*.sh'" not in text and old_chmod in text:
        text = text.replace(old_chmod, new_chmod, 1)
        changed = True
    if "backup-maken.sh 2>/dev/null || true" not in text and old_start in text:
        text = text.replace(old_start, new_start, 1)
        changed = True
    if "patch-backup-copy.py" not in text and old_py in text:
        text = text.replace(old_py, new_py, 1)
        changed = True
    if changed:
        path.write_text(text)
        path.chmod(0o750)
        print("installer-patched")
    else:
        print("installer-already")
