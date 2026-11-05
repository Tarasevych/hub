> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./RUNBOOK-AGENTEN-0.4.uk.md) · **🇳🇱 Nederlands** ([origineel](./RUNBOOK-AGENTEN-0.4.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Runbook: veilige agenten 0.4 (extensie 0.4.0, toestemmingen per gebruiker, auditfixes)

Branch `veilig-agenten-0.4`. Dit document beschrijft wat er verandert, hoe je het op de VM zet en hoe je controleert dat
het werkt. De uitrol van de deur zelf (ondertekende pakketten, geen root-pad) staat in `RUNBOOK-VEILIGE-UITROL.md`.

## 1. Wat er verandert

- **Toestemmingen (grants) per gebruiker en per apparaat.** Zonder geldige toestemming wordt elke opdracht geweigerd
  (`NO_GRANT`). Sets: **Спостерігач / Waarnemer** (alleen lezen, 30 dagen), **Помічник / Helper** (ook openen en klikken,
  elke actie met akkoord, 7 dagen), **Разово / Eenmalig** (bijna alles, 1 uur). Losse toestemmingen met duur en domeinen.
- **'Altijd'** (zonder akkoord per actie) kan alleen na een nieuwe bevestiging van de aanmelding (step-up), verloopt altijd
  (standaard 30 dagen, maximaal 90 — ook in de database afgedwongen), staat in het logboek en heeft op de site een stopknop.
- **Destructieve acties** (klikken/typen, schermafbeelding, debugger, schrijven, uitvoeren, Docker) vragen een verse
  goedkeuring (5 minuten geldig), behalve met een geldige 'altijd'-toestemming.
- **Стоп / Stop**: trekt in één keer alle toestemmingen in, wijst wachtende opdrachten af, laat de debugger los en sluit de
  verbindingen. Koppelingen (tokens) blijven; opnieuw toestaan kan meteen.
- **Blokkeren** van een account (beheer) trekt in één transactie agenttokens, toestemmingen, MCP-OAuth-tokens (Claude) en
  `tvh_`-tokens in en sluit daarna de verbindingen (code 4403). Deblokkeren geeft geen tokens terug: opnieuw koppelen.
- **Extensie 0.4.0**: token nooit meer in de WebSocket-URL (eenmalig ticket, 60 s), elke opdracht ondertekend (HMAC, 120 s),
  accountclaim `<meta name="mjn-account">` (ander account op het tabblad = weigeren, gele badge), zijpaneel met Стоп,
  diagnose alleen na expliciet aanzetten in de opties (buffer ≤ 200, oudere items versleuteld 90 dagen op de server).
  Koppelen gebeurt in de extensie zelf (externally_connectable vanaf mcp.tarasevych.com); het token komt nooit in de pagina.
- **Pc-agent 0.3.0**: nooit een shell, geen `-e/--eval/-c/-m` e.d., alleen ondertekende opdrachten, eenmalig ws-ticket.
- **MCP-console (audit C2)**: bord, tokens en logboek per gebruiker in de database (RLS); serverzaken alleen voor de
  eigenaar; rechten alleen-lezen uit `/etc/mijn-ruimte/mcp-rechten.json`; archief en back-ups downloaden alleen na step-up
  via een eenmalige downloadId (5 minuten). Geen klad/plaatsen/deur-bijwerken meer via de site.
- **Overige auditfixes**: H2 ('altijd'-modus keurt riskante hulpmiddelen niet meer vanzelf goed), H4 (step-up voor
  toestemming aan Claude, riskant op 'altijd' en riskant goedkeuren), M2 (mail versturen/inplannen vraagt `mail.write`),
  M3 (resultaat alleen van de agent die de opdracht kreeg), M4 (connector controleert de gebruiker bij elke aanroep,
  agenttokens verlopen na 30 dagen).

## 2. Migraties

`0017_ai_instellingen_grants`, `0018_agent_tokens_verharding`, `0019_mcp_console_per_gebruiker`,
`0020_browser_diagnose_archief`, `0021_opdrachttypes_devtools`, daarna opnieuw `rechten.sql`. `installeer-app.sh` doet dit
zelf (back-up vóór de migratie). Bestaande agents krijgen 30 dagen alleen-lezen; bestaande tokens krijgen een vervaldatum.

## 3. Op de VM (via SSH, als root)

```bash
# 0. Back-up en pakket: zie RUNBOOK-VEILIGE-UITROL.md (ondertekend pakket) of de gewone installatie:
sudo /srv/mijn-ruimte/deploy/installeer-app.sh installeren /pad/naar/bron

# 1. Rechten van de MCP-deur (root-bestand; de site leest het alleen):
sudo install -m 0644 -o root -g root /dev/stdin /etc/mijn-ruimte/mcp-rechten.json <<'JSON'
{ "read": true, "uitrol": false }
JSON

# 2. Optioneel: eigen sleutels i.p.v. TOTP_ENCRYPTION_KEY_V1 (32 bytes, base64) in /etc/mijn-ruimte/geheimen.env
#    AGENT_SLEUTEL_V1=...        (verzegelt de opdrachtsleutels van agents)
#    AI_ARCHIEF_SLEUTEL_V1=...   (versleutelt het diagnose-archief)
#    Let op: na het wisselen van AGENT_SLEUTEL_V1 moeten alle agents opnieuw koppelen.

# 3. Overgang: oude agents (token als eerste bericht) toestaan tot alles 0.4/0.3.0 is. Daarna uitzetten:
#    AGENT_WS_TOKEN_AUTH_LEGACY=0   in /etc/mijn-ruimte/geheimen.env
sudo systemctl restart mijn-ruimte
journalctl -u mijn-ruimte -n 50 --no-pager
```

## 4. Op de pc

1. Extensie ondertekenen met de sleutel op `T:\mijn-ruimte\geheim` (nooit op de server):
   `node scripts/onderteken-extensie.mjs T:\mijn-ruimte\geheim\extensie.pem` → `extension/signed/*.crx` + `crx-info.json`,
   daarna `node scripts/bouw-extensie.mjs` en dat pakket uitrollen.
2. Extensie bijwerken naar 0.4.0. De oude koppeling wordt bewust vergeten; de extensie opent zelf de koppelpagina.
   Koppel opnieuw op mcp.tarasevych.com → Agenten → Browserextensie → **Koppelen**.
3. Pc-agent bijwerken naar 0.3.0 en opnieuw koppelen (nieuwe koppelcode, 5 minuten geldig). Zet in `--allow` alleen
   programma's die u echt nodig hebt; `node`, `python`, shells en dergelijke zonder vaste argumenten niet.
4. Kies per apparaat een set (standaard **Waarnemer**) en druk op **Тест**.

## 5. Controleren

- Op de site: Agenten → browser → toestand *Actief*, **Тест** geslaagd, **Стоп** zet alles in één klik uit.
- Een tabblad met een ander account: badge geel, opdrachten geweigerd.
- `curl -i -H "Upgrade: websocket" -H "Connection: Upgrade" "https://<site>/agent/ws?token=x"` → 404 (token in de URL wordt geweigerd).
- Eenheidstests: `node scripts/eenheidstests.mjs ai-grants-contract`, `mcp-console-c2`, `stapop-h4`, `mcp-connector`,
  `browser-keten`, `browser-extensie`, `extensie-toestand`, `uitrol-deur`.

## 6. Terugdraaien

Vorige release activeren (`installeer-app.sh terugdraaien`). De migraties 0017–0021 voegen alleen tabellen en kolommen toe; een
oudere release negeert ze. Extensie 0.4.0 heeft de 0.4-server nodig (ws-ticket, ondertekende opdrachten): na het
terugdraaien de 0.3-extensie opnieuw installeren en koppelen. Pc-agent 0.3.0 valt bij een oude server terug op de oude
aanmelding, maar weigert dan niet-ondertekende opdrachten (tenzij `HUB_AGENT_ALLOW_UNSIGNED=1`).
