#!/usr/bin/env bash
# apparaat-inrichten.sh — deze server als APPARAAT van de eigenaar op de site, zonder koppelcode overtypen (zone G, 22.10.2026).
# Geïnstalleerd als /usr/local/sbin/mijn-ruimte-apparaat; aangeroepen door `mijn-ruimte-installeer terminal-inrichten` en (stil,
# alleen als het nog niet is ingericht) aan het einde van `mijn-ruimte-installeer installeren`.
#
#   mijn-ruimte-installeer terminal-inrichten [--gebruiker beheer] [--naam "Мій сервер"] [--allow git,systemctl,…]
#                                             [--root DIR]... [--readonly-root DIR]... [--server https://mcp.<domein>] [--opnieuw]
#   mijn-ruimte-installeer terminal-inrichten --status | --uit
#
# Wat er gebeurt (als root, op de console — de site kan dit nooit zelf):
#   1. koppelcode: dist-server/apparaat-koppelcode.mjs als de DIENSTgebruiker (systemd-run, geheimen van de dienst, zoals migrate.mjs):
#      dezelfde eenmalige code als op mcp.* → Пристрої, ruimte «technisch», 5 minuten, alleen de hash in de database;
#   2. de code gaat via stdin (nooit als argument, nooit in een logboek) naar `agent.mjs pair --code -` als de GEWONE gebruiker (beheer):
#      roots = thuismap (schrijven) + /srv/mijn-ruimte en /var/log (alleen lezen); allow = vaste lijst (shared/terminal-opdrachten.ts
#      STANDAARD_ALLOW_SERVER) of --allow; daarna `terminal-config on --opdrachten --geen-container`;
#   3. systemd-unit mijn-ruimte-apparaat.service uit het sjabloon deploy/mijn-ruimte-apparaat.service: User=beheer, NoNewPrivileges,
#      ProtectSystem=strict, ReadWritePaths alleen de schrijfbare roots + ~/.hub-agent.
# Grens: de agent kan NIETS wat beheer zelf niet mag; geen sudo (ook niet met `sudo` op de allow-lijst: NoNewPrivileges). Commando's
# die iets wijzigen vragen op de site een bevestiging; alles wordt opgenomen (app.terminal_opdrachten).
# Waarom niet volledig zonder console: de koppeling bindt het apparaat aan het account van de eigenaar; dat mag alleen iemand die root
# op deze machine heeft — dezelfde reden waarom passkey-goedkeuringen door root worden nagecontroleerd. Eén opdracht is de grens.
set -euo pipefail

APP_ROOT="${MIJN_RUIMTE_APP_ROOT:-/srv/mijn-ruimte}"
HUIDIG="$APP_ROOT/current"
GEHEIMEN="${MIJN_RUIMTE_GEHEIMEN:-/etc/mijn-ruimte/geheimen.env}"
MIGRATIE_ENV="${MIJN_RUIMTE_MIGRATIE_ENV:-/etc/mijn-ruimte/migratie.env}"
DIENST_GEBRUIKER="${MIJN_RUIMTE_GEBRUIKER:-mijnruimte}"
SYSTEMD_DIR="${MIJN_RUIMTE_SYSTEMD_DIR:-/etc/systemd/system}"
AGENT_DIR="${MIJN_RUIMTE_AGENT_DIR:-/usr/local/lib/mijn-ruimte/agent}"
NODE="${NODE:-/usr/bin/node}"
UNIT=mijn-ruimte-apparaat.service
STANDAARD_ALLOW="systemctl,journalctl,git,node,npm,ls,cat,tail,head,df,free,uptime,hostname,whoami,id,date,stat,wc,du,ps,uname,pwd,grep,find,nproc,ip,ss,tar,sha256sum,podman,mijn-ruimte-installeer"

melding() { echo "[apparaat] $*"; }
waarschuwing() { echo "[apparaat] LET OP: $*" >&2; }
fout() { echo "[apparaat] FOUT: $*" >&2; exit 1; }
vereis_root() { [ "$(id -u)" -eq 0 ] || [ "${MIJN_RUIMTE_APPARAAT_TEST:-}" = 1 ] || fout "voer dit uit als root (sudo mijn-ruimte-installeer terminal-inrichten)"; }

gebruiker=beheer naam="" server="" allow="$STANDAARD_ALLOW" opnieuw=0 modus=inrichten bron=""
roots=() ro=()
while [ $# -gt 0 ]; do
  case "$1" in
    --gebruiker) gebruiker="${2:?}"; shift 2 ;;
    --naam) naam="${2:?}"; shift 2 ;;
    --allow) allow="${2:?}"; shift 2 ;;
    --root) roots+=("${2:?}"); shift 2 ;;
    --readonly-root) ro+=("${2:?}"); shift 2 ;;
    --server) server="${2:?}"; shift 2 ;;
    --opnieuw) opnieuw=1; shift ;;
    --status) modus=status; shift ;;
    --uit) modus=uit; shift ;;
    --bij-installeren) modus=bij-installeren; bron="${2:?}"; shift 2 ;;
    *) fout "onbekende optie: $1 (zie de kop van dit script)" ;;
  esac
done
[ -n "${MIJN_RUIMTE_APPARAAT_GEBRUIKER:-}" ] && [ "$gebruiker" = beheer ] && gebruiker="$MIJN_RUIMTE_APPARAAT_GEBRUIKER"
[[ "$gebruiker" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || fout "--gebruiker: ongeldige naam"

status() {
  local home; home="$(getent passwd "$gebruiker" 2>/dev/null | cut -d: -f6 || true)"
  echo "apparaat-agent: gebruiker $gebruiker, unit $UNIT"
  if [ -s "$SYSTEMD_DIR/$UNIT" ]; then systemctl --no-pager --lines=3 status "$UNIT" 2>/dev/null | head -8 || echo "$UNIT: niet actief"; else echo "$UNIT: niet ingericht (sudo mijn-ruimte-installeer terminal-inrichten)"; fi
  if [ -n "$home" ] && [ -s "$home/.hub-agent/config.json" ]; then
    "$NODE" -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(`gekoppeld aan ${c.server} (agent ${c.agentId||"?"})\nmappen: ${(c.roots||[]).map(r=>r+((c.readonlyRoots||[]).includes(r)?" (alleen lezen)":"")).join(", ")}\ntoegestaan: ${(c.allow||[]).join(", ")||"(niets)"}\nterminal: ${JSON.stringify(c.terminal||{enabled:false})}`)' "$home/.hub-agent/config.json" 2>/dev/null || echo "config onleesbaar"
  else echo "niet gekoppeld"; fi
}

uit() {
  vereis_root
  if [ -s "$SYSTEMD_DIR/$UNIT" ]; then systemctl disable --now "$UNIT" >/dev/null 2>&1 || true; melding "$UNIT gestopt en uitgeschakeld (de koppeling blijft; verwijderen: mcp.* → Пристрої)"; else melding "$UNIT was niet ingericht"; fi
}

koppelcode() {
  # Als de dienstgebruiker, met de geheimen van de dienst; de code is de enige regel op stdout. Foutuitvoer in een mktemp-bestand
  # (root schrijft nooit naar een voorspelbaar pad in /tmp). Ook als systemd-run de exitcode niet doorgeeft, telt het vaste woord
  # EIGENAAR_NIET_AANGEMELD in de foutuitvoer (server/apparaat-koppelcode.ts), net als bij migreren.
  local uit rc=0 foutlog reden
  foutlog="$(mktemp)" || { echo "FOUT mktemp"; return 1; }
  uit="$(systemd-run --quiet --wait --pipe --collect --unit="mijn-ruimte-apparaat-code-$$" \
    -p User="$DIENST_GEBRUIKER" -p Group="$DIENST_GEBRUIKER" -p EnvironmentFile="$GEHEIMEN" -p EnvironmentFile=-"$MIGRATIE_ENV" -p WorkingDirectory="$HUIDIG" \
    -p NoNewPrivileges=yes -p ProtectSystem=strict -p PrivateTmp=yes \
    "$NODE" "$HUIDIG/dist-server/apparaat-koppelcode.mjs" --ruimte technisch 2>"$foutlog")" || rc=$?
  reden="$(tail -n 3 "$foutlog" 2>/dev/null | tr '\n' ' ')"; rm -f -- "$foutlog"
  if [ "$rc" -eq 3 ] || [[ "$reden" == *EIGENAAR_NIET_AANGEMELD* ]]; then echo "EIGENAAR_NIET_AANGEMELD"; return 3; fi
  [ "$rc" -eq 0 ] || { echo "FOUT ${reden:-code $rc}"; return 1; }
  uit="$(printf '%s' "$uit" | tr -d '\r' | tail -n 1 | tr -d '[:space:]')"
  [[ "$uit" =~ ^[A-Z0-9]{8}$ ]] || { echo "FOUT onverwachte uitvoer"; return 1; }
  echo "$uit"
}

inrichten() {
  vereis_root
  id "$gebruiker" >/dev/null 2>&1 || fout "gebruiker $gebruiker bestaat niet (maak een gewone gebruiker, bv. adduser beheer, of kies --gebruiker)"
  [ "$gebruiker" != "$DIENST_GEBRUIKER" ] || fout "de dienstgebruiker $DIENST_GEBRUIKER mag geen apparaat-agent zijn"
  local uid home; uid="$(id -u "$gebruiker")"; home="$(getent passwd "$gebruiker" | cut -d: -f6)"
  [ "$uid" -ge 1000 ] || fout "$gebruiker is een systeemgebruiker of root: kies een gewone gebruiker"
  [ -d "$home" ] || fout "thuismap van $gebruiker ontbreekt"
  [[ "$allow" =~ ^[A-Za-z0-9._+-]+(,[A-Za-z0-9._+-]+)*$ ]] || fout "--allow: komma-lijst van programmanamen"
  case ",$allow," in *,bash,*|*,sh,*|*,zsh,*|*,sudo,*|*,su,*|*,env,*|*,xargs,*) fout "--allow: shells, sudo, su, env en xargs kunnen nooit (de agent weigert ze ook)" ;; esac
  [ ${#roots[@]} -gt 0 ] || roots=("$home")
  if [ ${#ro[@]} -eq 0 ]; then for r in "$APP_ROOT" /var/log; do [ -d "$r" ] && ro+=("$r"); done; fi
  local r schrijf=() args=()
  # Paden komen in de unit (sed-sjabloon, ReadWritePaths=): alleen veilige tekens, geen spaties, geen & of | (sed), geen ..
  local pad_re='^/[A-Za-z0-9._/@+-]*$'
  for r in "$home" "$NODE" "$AGENT_DIR"; do [[ "$r" =~ $pad_re && "$r" != *..* ]] || fout "pad met ongeldige tekens (alleen letters, cijfers, . _ / @ + -): $r"; done
  for r in "${roots[@]}" "${ro[@]}"; do
    [[ "$r" = /* && "$r" != *..* ]] || fout "map moet absoluut zijn zonder ..: $r"
    [[ "$r" =~ $pad_re ]] || fout "map met ongeldige tekens (alleen letters, cijfers, . _ / @ + -; geen spaties): $r"
    [ -d "$r" ] || fout "map bestaat niet: $r"
    case "$(readlink -f "$r")" in /|/root|/root/*|/etc|/etc/*|/boot*|/proc*|/sys*|/dev*|/usr|/usr/*|/var/lib/mijn-ruimte*) fout "map niet toegestaan als agent-root: $r" ;; esac
  done
  for r in "${roots[@]}"; do schrijf+=("$(readlink -f "$r")"); args+=(--root "$r"); done
  for r in "${ro[@]}"; do args+=(--readonly-root "$r"); done
  args+=(--allow "$allow")
  naam="${naam:-$(hostname -s) · сервер ($gebruiker)}"
  [[ "$naam" =~ ^[^$'\n'$'\r'|]{1,120}$ ]] || fout "--naam: max 60 tekens zonder | of regeleinden"
  if [ -z "$server" ]; then
    local domeinnaam
    domeinnaam="$(sed -n "s/^export const PUBLIC_DOMAIN = '\([a-z0-9.-]*\)';.*/\1/p" "$HUIDIG/backend/deployment-identity.ts" 2>/dev/null | head -1)"
    [ -n "$domeinnaam" ] || fout "domein van de site niet gevonden; geef --server https://mcp.<uw-domein>"
    server="https://mcp.$domeinnaam"
  fi
  [[ "$server" =~ ^https://[a-z0-9.-]+$ ]] || fout "--server: https://<host> zonder pad"
  [ -x "$NODE" ] || fout "Node niet gevonden op $NODE"
  [ -s "$HUIDIG/deploy/agent/agent.mjs" ] || fout "geen actieve release met deploy/agent/agent.mjs"
  [ -s "$HUIDIG/dist-server/apparaat-koppelcode.mjs" ] || fout "deze release heeft dist-server/apparaat-koppelcode.mjs nog niet: installeer eerst een release ≥ 22.10.2026"
  [ -s "$HUIDIG/deploy/mijn-ruimte-apparaat.service" ] || fout "sjabloon deploy/mijn-ruimte-apparaat.service ontbreekt in de release"
  if [ -s "$home/.hub-agent/config.json" ] && [ "$opnieuw" -ne 1 ] && [ -s "$SYSTEMD_DIR/$UNIT" ]; then
    melding "al ingericht voor $gebruiker ($UNIT). Opnieuw koppelen: --opnieuw; stand: --status"
    systemctl try-restart "$UNIT" >/dev/null 2>&1 || true
    return 0
  fi

  install -d -o root -g root -m 0755 "$AGENT_DIR"
  install -m 0644 -o root -g root "$HUIDIG/deploy/agent/agent.mjs" "$AGENT_DIR/agent.mjs"
  install -d -o "$gebruiker" -g "$(id -gn "$gebruiker")" -m 0700 "$home/.hub-agent"

  melding "koppelcode aanvragen voor de eigenaar (technische ruimte, 5 minuten)…"
  local code rc=0
  code="$(koppelcode)" || rc=$?
  if [ "$rc" -eq 3 ]; then fout "de eigenaar is nog nooit aangemeld op de site: meld u één keer aan (id.*) en voer dit dan opnieuw uit"; fi
  [ "$rc" -eq 0 ] || fout "koppelcode mislukt: ${code#FOUT }"

  # De code gaat via stdin naar de agent (nooit als argument: niet in ps, niet in het journaal).
  printf '%s\n' "$code" | runuser -u "$gebruiker" -- env HOME="$home" HUB_AGENT_CONFIG="$home/.hub-agent/config.json" \
    "$NODE" "$AGENT_DIR/agent.mjs" pair --server "$server" --code - --name "$naam" "${args[@]}" >/dev/null \
    || fout "koppelen mislukt (is https://mcp.* bereikbaar vanaf deze server? Zie journalctl -u mijn-ruimte)"
  (cd / && runuser -u "$gebruiker" -- env HOME="$home" HUB_AGENT_CONFIG="$home/.hub-agent/config.json" \
    "$NODE" "$AGENT_DIR/agent.mjs" terminal-config on --opdrachten --geen-container >/dev/null) || fout "terminal-config mislukt"

  # Unit uit het sjabloon; waarden zonder | en regeleinden (sed-scheidingsteken).
  local sjabloon="$HUIDIG/deploy/mijn-ruimte-apparaat.service" tmp
  tmp="$(mktemp "$SYSTEMD_DIR/.$UNIT.XXXXXX")"
  sed -e "s|@GEBRUIKER@|$gebruiker|g" -e "s|@HOME@|$home|g" -e "s|@NODE@|$NODE|g" -e "s|@AGENT_DIR@|$AGENT_DIR|g" -e "s|@SCHRIJF@|$home/.hub-agent ${schrijf[*]}|g" "$sjabloon" > "$tmp"
  grep -q '@[A-Z_]*@' "$tmp" && { rm -f "$tmp"; fout "sjabloon onvolledig ingevuld"; }
  chmod 0644 "$tmp"; mv -f "$tmp" "$SYSTEMD_DIR/$UNIT"
  # Oude koppeling van dezelfde gebruiker via beheer-koppelen: dezelfde installatie (pairingId) is net opnieuw gekoppeld, dus die unit
  # zou met een ingetrokken token blijven herstarten.
  if systemctl list-unit-files --no-legend "mijn-ruimte-agent-$gebruiker.service" 2>/dev/null | grep -q .; then
    systemctl disable --now "mijn-ruimte-agent-$gebruiker.service" >/dev/null 2>&1 || true
    melding "oude unit mijn-ruimte-agent-$gebruiker.service (beheer-koppelen) uitgeschakeld: vervangen door $UNIT"
  fi
  systemctl daemon-reload
  systemctl enable --now "$UNIT" >/dev/null
  systemctl restart "$UNIT"
  melding "«$naam» gekoppeld als apparaat van de eigenaar (technische ruimte) en gestart: $UNIT als $gebruiker, zonder sudo"
  melding "mappen: ${roots[*]} (schrijven); ${ro[*]:-—} (alleen lezen) · toegestaan: $allow"
  melding "op de site: technisch profiel → ⋯ → «Термінал» opent nu meteen op deze server; wijzigende opdrachten vragen een bevestiging"
}

bij_installeren() {
  # Stil en nooit fataal: alleen als er nog niets is ingericht en de gebruiker bestaat.
  if [ -s "$SYSTEMD_DIR/$UNIT" ]; then systemctl try-restart "$UNIT" >/dev/null 2>&1 || true; melding "$UNIT herstart met de nieuwe agent"; return 0; fi
  id "$gebruiker" >/dev/null 2>&1 || { melding "server als apparaat: overgeslagen (gebruiker $gebruiker bestaat niet; later: sudo mijn-ruimte-installeer terminal-inrichten --gebruiker <naam>)"; return 0; }
  if ! ( inrichten ); then waarschuwing "server als apparaat niet ingericht; later handmatig: sudo mijn-ruimte-installeer terminal-inrichten"; fi
  return 0
}

case "$modus" in
  status) status ;;
  uit) uit ;;
  bij-installeren) [ -d "$bron" ] || fout "releasemap ontbreekt: $bron"; bij_installeren ;;
  *) inrichten ;;
esac
