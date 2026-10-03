#!/usr/bin/env bash
# luks-tpm-ontgrendelen.sh — LUKS-root van mijn-ruimte-webserver automatisch laten ontgrendelen via de
# virtuele TPM (Hyper-V gen2) met clevis (tpm2-pin, PCR 7) + clevis-initramfs. Als root uitvoeren.
#
# Waarom clevis en niet systemd-cryptenroll: Ubuntu 24.04 bouwt de initramfs met initramfs-tools; diens
# cryptroot kent `tpm2-device=` niet. systemd-cryptenroll zou een overstap naar dracut vereisen (andere
# initramfs-generator voor een LUKS+LVM-root = groter risico bij kernelupdates). clevis-initramfs haakt in
# initramfs-tools in, probeert de TPM terwijl de gewone wachtwoordprompt gewoon blijft staan (terugval).
#
# Stappen:
#   tpm         controleert of /dev/tpmrm0 er is (na stap1-admin.ps1 op de host)
#   installeren pakketten (clevis, clevis-tpm2, clevis-luks, clevis-initramfs, tpm2-tools) + PCR-controle
#   binden      INTERACTIEF (vraagt één keer de bestaande LUKS-wachtwoordzin): kopie van de LUKS-header,
#               NIEUW keyslot met TPM2-sleutel; het wachtwoordslot blijft. Daarna initramfs + controleren.
#   initramfs   update-initramfs -u -k all en controle dat clevis/tpm2 erin zitten
#   controleren keyslots, clevis-binding en een proefontgrendeling van het TPM-slot (zonder iets te tonen)
# Nooit: het wachtwoordslot verwijderen, of zelf herstarten.
set -euo pipefail
APPARAAT="${LUKS_APPARAAT:-/dev/sda3}"
PCRS="${TPM_PCRS:-7}"
stap="${1:?stap ontbreekt (tpm|installeren|binden|initramfs|controleren)}"
[ "$(id -u)" -eq 0 ] || { echo "als root uitvoeren (sudo)" >&2; exit 1; }
cryptsetup isLuks --type luks2 "$APPARAAT" || { echo "$APPARAAT is geen LUKS2-apparaat" >&2; exit 1; }

slots() { cryptsetup luksDump "$APPARAAT" | awk '/^Keyslots:/{k=1;next} /^[A-Z]/{k=0} k && /^  [0-9]+: luks2/{sub(":","",$1); print $1}'; }
clevis_slot() { clevis luks list -d "$APPARAAT" 2>/dev/null | awk -F: '/tpm2/{print $1; exit}'; }
pcr_bank() {
  if tpm2_pcrread "sha256:${PCRS}" 2>/dev/null | grep -q '0x'; then echo sha256; else echo sha1; fi
}

doe_tpm() {
  if [ -e /dev/tpmrm0 ]; then echo "TPM aanwezig: $(ls -l /dev/tpmrm0)"; else echo "GEEN TPM (/dev/tpmrm0 ontbreekt): eerst stap1-admin.ps1 op de host" >&2; exit 1; fi
  if command -v tpm2_getcap >/dev/null; then
    tpm2_getcap properties-fixed 2>/dev/null | grep -A1 -E 'TPM2_PT_(FAMILY_INDICATOR|MANUFACTURER)' | grep -E 'raw|value' | head -4 || true
  fi
  mokutil --sb-state 2>/dev/null || true
}
doe_installeren() {
  doe_tpm
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq clevis clevis-tpm2 clevis-luks clevis-initramfs tpm2-tools >/dev/null
  dpkg -l clevis clevis-tpm2 clevis-luks clevis-initramfs tpm2-tools | awk '/^ii/{print $2, $3}'
  grep -E '^CONFIG_TCG_(TPM|CRB|TIS)=' "/boot/config-$(uname -r)" || true
  local bank; bank=$(pcr_bank)
  echo "PCR-bank: $bank"; tpm2_pcrread "$bank:${PCRS}"
  echo "proef: kleine waarde versleutelen en ontsleutelen met de TPM (PCR ${PCRS})"
  local t; t=$(echo proef | clevis encrypt tpm2 "{\"pcr_bank\":\"$bank\",\"pcr_ids\":\"$PCRS\"}" | clevis decrypt)
  [ "$t" = proef ] && echo "TPM-proef OK" || { echo "TPM-proef MISLUKT" >&2; exit 1; }
}
doe_initramfs() {
  update-initramfs -u -k all
  local img="/boot/initrd.img-$(uname -r)"
  lsinitramfs "$img" | grep -E 'clevis-luks-askpass|bin/clevis-decrypt-tpm2|tpm2_unseal|tss2' | sed 's/^/  /' | head -8
  lsinitramfs "$img" | grep -q 'clevis-decrypt-tpm2' && echo "initramfs bevat clevis-tpm2: OK" || { echo "clevis ontbreekt in de initramfs" >&2; exit 1; }
}
doe_controleren() {
  echo "== keyslots"; cryptsetup luksDump "$APPARAAT" | sed -n '/^Keyslots:/,/^Digests:/p' | grep -E '^  [0-9]+: |Priority|^Tokens|clevis|Keyslot:' 
  echo "== clevis"; clevis luks list -d "$APPARAAT"
  local s; s=$(clevis_slot)
  [ -n "$s" ] || { echo "geen clevis-tpm2-binding gevonden" >&2; exit 1; }
  [ "$(slots | wc -l)" -ge 2 ] || { echo "minder dan 2 keyslots: wachtwoordslot ontbreekt?" >&2; exit 1; }
  if clevis luks pass -d "$APPARAAT" -s "$s" | cryptsetup open --test-passphrase --key-slot "$s" --key-file - "$APPARAAT"; then
    echo "proefontgrendeling via TPM (slot $s): OK"
  else
    echo "proefontgrendeling via TPM (slot $s): MISLUKT" >&2; exit 1
  fi
  echo "overige slots (wachtwoord): $(slots | grep -vx "$s" | tr '\n' ' ')"
}
doe_binden() {
  [ -t 0 ] || { echo "binden is interactief: start met ssh -t of op de VM-console" >&2; exit 1; }
  doe_tpm
  command -v clevis >/dev/null || { echo "eerst: $0 installeren" >&2; exit 1; }
  if [ -n "$(clevis_slot)" ]; then echo "er is al een clevis-tpm2-binding (slot $(clevis_slot)); niets gedaan"; doe_controleren; exit 0; fi
  local voor; voor=$(slots | tr '\n' ' ')
  echo "keyslots vooraf: $voor"
  local kop="/root/luks-header-$(basename "$APPARAAT")-$(date +%Y%m%d-%H%M%S).img"
  ( umask 077; cryptsetup luksHeaderBackup "$APPARAAT" --header-backup-file "$kop" )
  echo "LUKS-header bewaard: $kop (0600, op de versleutelde root)"
  local bank; bank=$(pcr_bank)
  echo "Nu één keer de BESTAANDE LUKS-wachtwoordzin typen (wordt niet getoond):"
  clevis luks bind -d "$APPARAAT" tpm2 "{\"pcr_bank\":\"$bank\",\"pcr_ids\":\"$PCRS\"}"
  local na; na=$(slots | tr '\n' ' ')
  echo "keyslots na: $na"
  for s in $voor; do slots | grep -qx "$s" || { echo "FOUT: slot $s is verdwenen!" >&2; exit 1; }; done
  doe_initramfs
  doe_controleren
  echo "Klaar. NIET zelf herstarten: herstart pas samen met Pavlo aan de VM-console (terugval = wachtwoordzin)."
}

case "$stap" in
  tpm) doe_tpm ;;
  installeren) doe_installeren ;;
  binden) doe_binden ;;
  initramfs) doe_initramfs ;;
  controleren) doe_controleren ;;
  *) echo "onbekende stap: $stap" >&2; exit 2 ;;
esac
