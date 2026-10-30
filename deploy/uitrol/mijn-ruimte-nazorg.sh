#!/bin/bash
# mijn-ruimte-nazorg — dode-mansschakelaar na een uitrol (root, elke minuut via mijn-ruimte-nazorg.timer).
#
# Probleem: de installer zet bij een mislukte gezondheidscontrole zelf de vorige release terug, maar een release die pas ná die controle
# faalt (bijvoorbeeld bij het eerste echte verkeer, na een kwartier) laat de site liggen — en de eigenaar kan dan niets meer via de site
# doen, want de site ís kapot. Deze schakelaar loopt los van de app:
#   - installeer-app.sh zet na een geslaagde activering het bestand /var/lib/mijn-ruimte-uitrol/nazorg
#     (regel: <einde-epoch> <release> <vorige-release>, standaard 30 minuten), en haalt het weg zodra er een nieuwe installatie begint;
#   - zolang het bestand geldig is, controleert deze dienst elke minuut /__gezondheid; faalt dat NAZORG_FOUTEN keer (standaard 3) achter
#     elkaar, dan draait hij zelf terug naar de vorige release (`mijn-ruimte-installeer terugdraaien`) en schrijft een gebeurtenis;
#   - 22.10.2026 (zone A, na release 20261021-221718 met witte admin-pagina's bij «HTTP 200»): ÉÉN keer in het venster, NAZORG_ROOK_NA
#     seconden (standaard 120) na de activering, de rendercontrole van de DRAAIENDE dienst (`mijn-ruimte-installeer rook-controle --live`:
#     echte browser, publieke pagina's + publieke bundels, geen aanmelding). Uitkomst «kapot» (code 1) telt als storing → zelfde terugdraai;
#     «niet uitgevoerd» (code 2: geen browser…) doet niets. Nooit twee keer (markering nazorg-rook);
#   - 22.10.2026: verzoek vanaf de site («Діагностика» → «Перевірити рендеринг»): de app zet een LEEG verzoekbestand in de goedkeur-inbox
#     (ROOK_VERZOEK); root leest alleen of het bestaat, verwijdert het en start `rook-controle` (stand met testeigenaar; hoogstens één keer
#     per 10 minuten). Een handmatige controle draait NOOIT terug — ze schrijft rook-controle.json en een gebeurtenis ROOK_KAPOT;
#   - na afloop van het venster (of na een terugdraaiing) doet hij niets meer.
# Databasemigraties worden NIET teruggedraaid (het schema blijft nieuw; migraties moeten achterwaarts compatibel zijn, zie de voorcontrole).
set -u
DIR="${MIJN_RUIMTE_NAZORG_DIR:-/var/lib/mijn-ruimte-uitrol}"   # (tests wijzigen dit; de systemd-dienst heeft een schone omgeving)
INSTALLEER="${MIJN_RUIMTE_NAZORG_INSTALLEER:-/usr/local/sbin/mijn-ruimte-installeer}"
MARK="$DIR/nazorg"; TEL="$DIR/nazorg-fouten"; ROOK_MARK="$DIR/nazorg-rook"; ROOK_STEMPEL="$DIR/rook-laatst"
STATUS="${MIJN_RUIMTE_STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}"
ROOK_VERZOEK="${MIJN_RUIMTE_ROOK_VERZOEK:-/srv/mijn-ruimte/goedkeur-inbox/rook-verzoek}"
PORT="${PORT:-8080}"; URL="http://127.0.0.1:${PORT}/__gezondheid"
MAX="${NAZORG_FOUTEN:-3}"
ROOK_NA="${NAZORG_ROOK_NA:-120}"          # seconden na de activering vóór de live rendercontrole
ROOK_TUSSEN="${NAZORG_ROOK_TUSSEN:-600}"  # minimale tussentijd voor handmatige verzoeken
mkdir -p "$DIR" 2>/dev/null || true

# ---- A. handmatig verzoek vanaf de site (alleen het bestaan van het bestand telt; inhoud wordt nooit gelezen) ----
if [ -e "$ROOK_VERZOEK" ] && [ ! -L "$ROOK_VERZOEK" ]; then
  rm -f -- "$ROOK_VERZOEK"
  nu="$(date +%s)"; laatst="$(cat "$ROOK_STEMPEL" 2>/dev/null || echo 0)"; [[ "$laatst" =~ ^[0-9]+$ ]] || laatst=0
  if [ $((nu - laatst)) -ge "$ROOK_TUSSEN" ]; then
    echo "$nu" > "$ROOK_STEMPEL"
    logger -t mijn-ruimte-nazorg "rendercontrole op verzoek van de site"
    MIJN_RUIMTE_UITROL_MODUS=nazorg "$INSTALLEER" rook-controle >> "$STATUS/nazorg.log" 2>&1 || true
  else
    logger -t mijn-ruimte-nazorg "rendercontrole-verzoek genegeerd (minder dan $ROOK_TUSSEN s na de vorige)"
  fi
fi

# ---- B. bewaking in het venster ----
[ -f "$MARK" ] || exit 0
read -r tot release vorige < "$MARK" || exit 0
[[ "$tot" =~ ^[0-9]+$ ]] || { rm -f "$MARK" "$TEL" "$ROOK_MARK"; exit 0; }
if [ "$(date +%s)" -gt "$tot" ]; then rm -f "$MARK" "$TEL" "$ROOK_MARK"; exit 0; fi
reden=gezondheid
if curl -fsS --max-time 4 "$URL" 2>/dev/null | grep -q '"ok":true'; then
  rm -f "$TEL"
  # Eén keer per venster, ROOK_NA s na de activering: rendert de draaiende release ook echt (publieke pagina's, echte browser)?
  begin="$(stat -c %Y "$MARK" 2>/dev/null || echo 0)"
  if [ ! -f "$ROOK_MARK" ] && [ $(( $(date +%s) - begin )) -ge "$ROOK_NA" ]; then
    : > "$ROOK_MARK"
    MIJN_RUIMTE_UITROL_MODUS=nazorg "$INSTALLEER" rook-controle --live >> "$STATUS/nazorg.log" 2>&1
    rc=$?
    if [ "$rc" -eq 1 ]; then
      logger -t mijn-ruimte-nazorg "rendercontrole: release $release rendert niet (live) — terugdraaien"
      reden=rook; n="$MAX"
    else
      [ "$rc" -eq 0 ] && logger -t mijn-ruimte-nazorg "rendercontrole: release $release in orde (live)" || logger -t mijn-ruimte-nazorg "rendercontrole niet uitgevoerd (code $rc)"
      exit 0
    fi
  else
    exit 0
  fi
else
  n=$(( $(cat "$TEL" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$TEL"
  logger -t mijn-ruimte-nazorg "gezondheidscontrole mislukt ($n/$MAX) voor release $release"
  [ "$n" -ge "$MAX" ] || exit 0
fi
release="$(basename "$release")"
rm -f "$MARK" "$TEL" "$ROOK_MARK"   # nooit twee keer terugdraaien
uitkomst=ok
if [ -n "$vorige" ] && [ -d "$vorige" ]; then
  MIJN_RUIMTE_UITROL_MODUS=nazorg "$INSTALLEER" terugdraaien "$(basename "$vorige")" >> "$STATUS/nazorg.log" 2>&1 || uitkomst=mislukt
else
  uitkomst=geen-vorige
fi
logger -t mijn-ruimte-nazorg "automatisch terugdraaien van $release naar $(basename "${vorige:-?}") ($reden): $uitkomst"
python3 - "$STATUS/gebeurtenissen.jsonl" "$release" "$(basename "${vorige:-?}")" "$uitkomst" "$reden" "$STATUS/rook-controle.json" <<'PY' || true
import json, sys, datetime, secrets, os, tempfile, fcntl
pad, release, vorige, uitkomst, reden, rookpad = sys.argv[1:7]
nu = datetime.datetime.now(datetime.timezone.utc)
if reden == "rook":
    try: s = json.load(open(rookpad, encoding="utf-8")).get("samenvatting", {})
    except Exception: s = {}
    waarom_uk = f"Сторінки випуску {release} не рендеряться у браузері ({str(s.get('uk', '')).rstrip('.')[:300]})"
    waarom_nl = f"Pagina's van release {release} renderen niet in de browser ({str(s.get('nl', '')).rstrip('.')[:300]})"
else:
    waarom_uk = f"Сайт перестав відповідати після випуску {release}"
    waarom_nl = f"De site reageerde na release {release} niet meer"
if uitkomst == "ok":
    uk = f"{waarom_uk}: автоматично повернуто {vorige} (нагляд після розгортання). Міграції бази не відкочуються."
    nl = f"{waarom_nl}: automatisch teruggezet naar {vorige} (nazorg na uitrol). Databasemigraties worden niet teruggedraaid."
    niveau = "warn"
else:
    uk = f"{waarom_uk}, а автоматичний відкат не вдався ({uitkomst}). Потрібен SSH: sudo mijn-ruimte-installeer terugdraaien"
    nl = f"{waarom_nl} en automatisch terugdraaien lukte niet ({uitkomst}). SSH nodig: sudo mijn-ruimte-installeer terugdraaien"
    niveau = "error"
regel = {"id": nu.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": nu.isoformat(), "bron": "uitrol", "code": "NAZORG_TERUGGEDRAAID" if uitkomst == "ok" else "NAZORG_MISLUKT",
         "niveau": niveau, "uk": uk, "nl": nl, "tag": release, "herkomst": "nazorg", "release": release, "reden": reden}
with open(pad, "a", encoding="utf-8") as f:
    fcntl.flock(f, fcntl.LOCK_EX); f.write(json.dumps(regel, ensure_ascii=False) + "\n")
PY
exit 0
