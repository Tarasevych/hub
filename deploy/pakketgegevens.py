#!/usr/bin/env python3
# Pakketgegevens voor het uitvoeringslogboek (deploy/installeer-app.sh → pakketgegevens_melden), 29.10.2026.
# Gebruik: pakketgegevens.py <release-map> [UITROL_GEB_EXTRA-json]  → één JSON-regel op stdout.
# Leest AUTEUR, AGENT en PAKKET-BRON-COMMIT (alleen veilige tekens, begrensd); sha256/grootte uit het bewaarde archief.
import datetime
import json
import os
import re
import sys


def lees(doel, naam, maximum):
    try:
        with open(os.path.join(doel, naam), encoding="utf-8", errors="replace") as f:
            r = f.read(maximum).splitlines()
            return r[0].strip() if r else ""
    except FileNotFoundError:
        return ""
    except OSError as fout:
        print(f"[pakketgegevens] bestand {naam} niet gelezen: {fout}", file=sys.stderr)
        return ""


def gegevens(doel, extra=""):
    auteur = re.sub(r"[^\w .@'-]", "", lees(doel, "AUTEUR", 200))[:120]
    agent = lees(doel, "AGENT", 40)
    agent = agent if re.fullmatch(r"[a-z0-9][a-z0-9-]{0,31}", agent) else ""
    bc = re.sub(r"[\x00-\x1f\\\"]", " ", lees(doel, "PAKKET-BRON-COMMIT", 200))
    if not (re.fullmatch(r"[0-9a-f]{40}", bc) or re.fullmatch(r"zonder-git:.{5,190}", bc)):
        bc = ""
    d = {"auteur": auteur, "agent": agent, "bron_commit": bc,
         "geinstalleerd_op": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
    if extra:
        try:
            e = json.loads(extra)
            if not isinstance(e, dict):
                raise ValueError("UITROL_GEB_EXTRA moet een JSON-object zijn")
            if re.fullmatch(r"[0-9a-f]{64}", str(e.get("pakket_sha256", ""))):
                d["sha256"] = e["pakket_sha256"]
            bytes_waarde = e.get("pakket_bytes")
            if isinstance(bytes_waarde, int) and not isinstance(bytes_waarde, bool) and bytes_waarde > 0:
                d["bytes"] = bytes_waarde
        except (json.JSONDecodeError, TypeError, ValueError) as fout:
            print(f"[pakketgegevens] ongeldige UITROL_GEB_EXTRA-json overgeslagen: {fout}", file=sys.stderr)
    return d


if __name__ == "__main__":
    print(json.dumps(gegevens(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ""), ensure_ascii=False))
