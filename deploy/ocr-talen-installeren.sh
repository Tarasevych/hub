#!/usr/bin/env bash
# OCR voor de zoekindex op de EIGEN server (BYOS): programma + taalbestanden. Aangeroepen als
#   sudo /usr/local/sbin/mijn-ruimte-installeer ocr-talen [--talen ukr+nld+eng+rus] [--map /srv/mijn-ruimte/ocr/tessdata] [--zonder-apt] [--controleer]
#
# Wat dit doet (en niets meer):
#   1. apt: tesseract-ocr (de OCR-engine, Apache-2.0) en poppler-utils (pdftoppm: PDF-pagina → afbeelding). Zonder apt
#      of met --zonder-apt wordt dit overgeslagen; de server valt dan terug op tesseract.js (WASM, in node_modules) en
#      op de ingesloten afbeeldingen uit de PDF (pdfjs) — trager, maar zonder systeempakketten.
#   2. Taalbestanden (tessdata_fast 4.1.0, Apache-2.0) uit het officiële tesseract-ocr-project op GitHub, vastgepind op
#      de tag 4.1.0 en gecontroleerd met SHA-256 (lijst hieronder). Een bestand dat niet klopt wordt verwijderd en
#      gemeld. Bestemming: --map (standaard /srv/mijn-ruimte/ocr/tessdata = ZOEK_OCR_TALEN_MAP), leesbaar voor de dienst.
#   Ze zitten NIET in de release-tar (±29 MB voor 9 talen) en worden alleen gedownload als ze ontbreken of niet kloppen.
# Geen root-shell-scripts van derden, geen `curl | bash`: alleen apt en losse bestanden met bekende hash.
set -euo pipefail

TALEN='ukr+nld+eng+rus'
MAP='/srv/mijn-ruimte/ocr/tessdata'
MET_APT=1
ALLEEN_CONTROLE=0
BRON_BASIS='https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0'
DIENST_GEBRUIKER="${MIJN_RUIMTE_GEBRUIKER:-mijnruimte}"

# SHA-256 van tessdata_fast tag 4.1.0 (berekend 22.10.2026 op de bestanden van die tag; de tag is onveranderlijk).
declare -A SHA=(
  [bul]=aebc9b0fcc8cfaf8a9f38a02bb7b85052bd850744696a2c11cf0081820e5b21e
  [deu]=19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d
  [eng]=7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2
  [fra]=ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca
  [nld]=ced0e5e046a84c908a6aa7accbef9a232c4a5d9a8276691b81c6ee64d02963f6
  [pol]=c4476cdbc0e33d898d32345122b7be1cbf85ace15f920f06c7714756e1ef79b2
  [ron]=9adfde6b51ba4b97efd10ea37c3070fd3fc2bad7815e81f5c3c198cd96216cc9
  [rus]=e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225
  [ukr]=d59e53e2bded32f4445f124b4b00240fcac7e8044c003ab822ccb94f0b3db59b
)

melding() { printf '  %s\n' "$*"; }
fout() { printf 'FOUT: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --talen) TALEN="${2:?}"; shift 2 ;;
    --map) MAP="${2:?}"; shift 2 ;;
    --zonder-apt) MET_APT=0; shift ;;
    --controleer) ALLEEN_CONTROLE=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) fout "onbekende optie: $1" ;;
  esac
done
[ "$(id -u)" -eq 0 ] || fout "als root uitvoeren (sudo mijn-ruimte-installeer ocr-talen)"
[[ "$MAP" == /* ]] || fout "--map moet een absoluut pad zijn"

# 1. Pakketten
if [ "$ALLEEN_CONTROLE" -eq 0 ] && [ "$MET_APT" -eq 1 ] && command -v apt-get >/dev/null 2>&1; then
  nodig=()
  command -v tesseract >/dev/null 2>&1 || nodig+=(tesseract-ocr)
  command -v pdftoppm >/dev/null 2>&1 || nodig+=(poppler-utils)
  if [ ${#nodig[@]} -gt 0 ]; then
    melding "pakketten installeren: ${nodig[*]}"
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${nodig[@]}" >/dev/null || melding "apt-get install ${nodig[*]} mislukt: de server gebruikt tesseract.js (WASM) als terugval"
  fi
fi
if command -v tesseract >/dev/null 2>&1; then melding "tesseract: $(tesseract --version 2>&1 | head -1)"; else melding "tesseract: niet gevonden (terugval: tesseract.js in node_modules)"; fi
if command -v pdftoppm >/dev/null 2>&1; then melding "pdftoppm: aanwezig"; else melding "pdftoppm: niet gevonden (terugval: ingesloten afbeeldingen via pdfjs)"; fi

# 2. Taalbestanden
install -d -m 0755 "$MAP"
IFS='+, ' read -r -a lijst <<< "$TALEN"
mis=0
for taal in "${lijst[@]}"; do
  [[ "$taal" =~ ^[a-z_]{3,12}$ ]] || { melding "taal «$taal» overgeslagen (ongeldige code)"; continue; }
  doel="$MAP/$taal.traineddata"
  verwacht="${SHA[$taal]:-}"
  if [ -z "$verwacht" ]; then melding "taal «$taal»: geen bekende SHA-256 in dit script — niet gedownload (voeg hem toe aan deploy/ocr-talen-installeren.sh na eigen controle)"; mis=1; continue; fi
  if [ -s "$doel" ] && [ "$(sha256sum "$doel" | cut -d' ' -f1)" = "$verwacht" ]; then melding "$taal: aanwezig en gecontroleerd"; continue; fi
  if [ "$ALLEEN_CONTROLE" -eq 1 ]; then melding "$taal: ONTBREEKT of klopt niet"; mis=1; continue; fi
  tmp="$(mktemp "$MAP/.$taal.XXXXXX")"
  if curl -fsSL --proto '=https' --tlsv1.2 --max-time 300 -o "$tmp" "$BRON_BASIS/$taal.traineddata"; then
    echt="$(sha256sum "$tmp" | cut -d' ' -f1)"
    if [ "$echt" = "$verwacht" ]; then chmod 0644 "$tmp"; mv -f "$tmp" "$doel"; melding "$taal: gedownload en gecontroleerd ($(du -h "$doel" | cut -f1))"
    else rm -f "$tmp"; melding "$taal: SHA-256 klopt NIET (verwacht $verwacht, kreeg $echt) — verwijderd"; mis=1; fi
  else rm -f "$tmp"; melding "$taal: download mislukt ($BRON_BASIS/$taal.traineddata)"; mis=1; fi
done
chmod 0755 "$MAP"; chown -R root:root "$MAP" 2>/dev/null || true
id "$DIENST_GEBRUIKER" >/dev/null 2>&1 && melding "map $MAP is leesbaar voor $DIENST_GEBRUIKER (0755/0644)"
melding "zet in /etc/mijn-ruimte/geheimen.env (optioneel): ZOEK_OCR_TALEN=$TALEN  ZOEK_OCR_TALEN_MAP=$MAP  — en herstart de dienst"
[ "$mis" -eq 0 ] || exit 2
