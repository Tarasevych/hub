#!/usr/bin/env bash
# opa-ophalen.sh <doelbestand> — haalt de vastgezette OPA-versie (versie.env) op en controleert de SHA-256. Als root, door
# installeer-app.sh (opa_inrichten). Schrijft eerst naar een tijdelijk bestand; alleen bij een exacte hashovereenkomst wordt het
# doelbestand (root:root 0755) geplaatst. Nooit «latest», nooit een andere bron dan de officiële releasepagina.
# OPA_BRON is alleen voor tests (bijv. file:///…); standaard de releasepagina van open-policy-agent op GitHub.
set -euo pipefail
umask 022
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
doel="${1:?doelbestand ontbreekt}"
# shellcheck source=/dev/null
. "$HIER/versie.env"
[[ "${OPA_VERSIE:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "[opa] ongeldige OPA_VERSIE" >&2; exit 1; }
case "$(uname -m)" in
  x86_64|amd64) arch=amd64; verwacht="$OPA_SHA256_AMD64" ;;
  aarch64|arm64) arch=arm64; verwacht="$OPA_SHA256_ARM64" ;;
  *) echo "[opa] architectuur $(uname -m) niet ondersteund" >&2; exit 1 ;;
esac
[[ "$verwacht" =~ ^[0-9a-f]{64}$ ]] || { echo "[opa] ongeldige SHA-256 in versie.env" >&2; exit 1; }
if [ -x "$doel" ] && [ "$(sha256sum "$doel" | cut -d' ' -f1)" = "$verwacht" ]; then echo "[opa] versie $OPA_VERSIE al aanwezig"; exit 0; fi
bron="${OPA_BRON:-https://github.com/open-policy-agent/opa/releases/download}/v${OPA_VERSIE}/opa_linux_${arch}_static"
tmp="$(mktemp "${TMPDIR:-/tmp}/opa.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
curl -fsSL --proto '=https,file' --max-time 300 -o "$tmp" "$bron" || { echo "[opa] downloaden mislukt: $bron" >&2; exit 1; }
echtig="$(sha256sum "$tmp" | cut -d' ' -f1)"
if [ "$echtig" != "$verwacht" ]; then echo "[opa] SHA-256 KLOPT NIET (verwacht $verwacht, kreeg $echtig) — niets geïnstalleerd" >&2; exit 1; fi
install -d -m 0755 "$(dirname "$doel")"
install -m 0755 "$tmp" "$doel.nieuw"
mv -f -- "$doel.nieuw" "$doel"
echo "[opa] versie $OPA_VERSIE geïnstalleerd ($arch, SHA-256 gecontroleerd)"
