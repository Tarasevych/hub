> 🌐 **Taal / Мова:** [Українська](ПЛЮЩ-ЕТАП-0-АУДИТ-ДІЙСНОГО-СТАНУ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md) · [Hoofdarchitectuurmanifest «Klimop»](ARCHITECTUURMANIFEST-KLIMOP.nl.md)

# Fase 0 van het ecosysteem «Klimop» — Volledige bewijsaudit van de feitelijke staat van «Mijn Ruimte» (`KLIMOP-002`)

- **Uitvoeringsdatum:** 20.11.2026
- **Coördinatietaak:** `KLIMOP-002` (vervolg na samenvoeging van `KLIMOP-001` in samenvoegingsverzoek nr. 183, samenvoegingsvastlegging `92f2c35d3ab272b43bf154524f702dd992128159`)
- **Geverifieerde actieve productie-uitgave (`https://hub.tarasevych.com/api/version`):** `20261120-141041` (`ba289fa919c66765b6fc5565d340976994261c05`)
- **Herhaalbaar controlescript (uitsluitend lezen):** `node scripts/klimop-etappe0-audit.mjs` (`--json`)
- **Normatieve grondslag:** secties `§3.3`, `§36 (Fase 0)`, `§42`, `§43`, `§44 (doc. nr. 1)` en `§45 (stap 1)` van het [Hoofdarchitectuurmanifest «Klimop»](ARCHITECTUURMANIFEST-KLIMOP.nl.md)
- **Bevoegdheidsgrens:** deze audit is uitgevoerd zonder enige wijziging aan de draaiende productie-infrastructuur, zonder uitschakeling van de bestaande server of `PostgreSQL 18.6` en zonder geheime waarden in de opslagplaats vast te leggen.

---

## 1. Doel en methodiek van Fase 0

Het Hoofdarchitectuurmanifest «Klimop» (§3.3, §43 punt 13) verbiedt uitdrukkelijk om de aanwezigheid van een bestand in de opslagplaats gelijk te stellen aan werking in productie en verbiedt om de ombouw te starten zonder exacte vaststelling van de feitelijke toestand.

Tijdens Fase 0 zijn twee onafhankelijke bewijslagen gecontroleerd:
1. **Actief openbaar versie-eindpunt (`GET https://hub.tarasevych.com/api/version`):** bevestigd dat uitgave `20261120-141041` met herkomstvastlegging `ba289fa919c66765b6fc5565d340976994261c05` (`commitStatus: "git"`) daadwerkelijk draait.
2. **Volledige programmatische inspectie van de codebasis (`scripts/klimop-etappe0-audit.mjs`):** telling en verificatie van alle server- en gedeelde modules, 187 databasemigratiebestanden, rij-isolatiebeleid (`RLS`), het register van 30 gevoelige tabellen in de sleutelkluis (`shared/sleutelkluis.ts`), de netwerktunnelconfiguratie (`deploy/cloudflared-config.yml`), 34 `systemd`-eenheden, het handtekeningmechanisme voor uitgaven (`deploy/uitrol/mijn-ruimte-uitrol.sh`) en alle 14 AI-agentintegraties.

---

## 2. Exacte kwantitatieve kerncijfers van het huidige systeem

| Systeemdimensie | Geverifieerde waarde | Canonieke bron in de opslagplaats |
|---|---|---|
| Platform van het serverknooppunt | 1 virtuele machine `Ubuntu 26.04.1 LTS`, `Node.js 26.13.0 LTS`, `PostgreSQL 18.6`, `Caddy 2.11.7`, `OPA 1.22.0`, `age 1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2` | `AGENTENREGELS.nl.md` (§1, B-009), `deploy/*.service` |
| Serverkern van het platform (`server/`) | **30** TypeScript-bestanden | `server/start.ts`, `server/platform/*` |
| Domeingerichte serverdiensten (`backend/`) | **331** TypeScript/ESM-modules | `backend/*.ts` |
| Gedeelde contracten en cryptografische modellen (`shared/`) | **224** modules (inclusief de nieuwe kern `shared/klimop/kern.ts`) | `shared/**/*.ts` |
| Clientdomeinen van de gebruikersinterface (`src/`) | **67** submappen | `src/*` |
| `systemd`-diensten en tijdschema's (`deploy/`) | **34** eenheden (`.service` en `.timer`) | `deploy/**/*.service`, `deploy/**/*.timer` |
| `PostgreSQL`-databasemigraties | **187** SQL-bestanden (`0001_basis.sql` .. `0306_verdeelde_opslag_knopen.sql` + `rechten.sql`, waarvan **186** genummerd) | `migrations/*.sql` |
| Migraties met rij-isolatie (`RLS`) | **86** bestanden met `ENABLE ROW LEVEL SECURITY`, **10** bestanden met `FORCE ROW LEVEL SECURITY` | `migrations/*.sql`, `server/platform/rls-audit.ts` |
| Subdomeinen op de Cloudflare-tunnelrand | **11** subdomeinen (`hub`, `id`, `mail`, `cloud`, `ai`, `github`, `huis`, `api`, `admin`, `dashboard`, `mcp`) | `deploy/cloudflared-config.yml` |
| Canonieke subdomeinen van de webtoepassing | **10** diensten (`hub`, `ai`, `mail`, `cloud`, `github`, `huis`, `id`, `api`, `admin`, `mcp`) met Nederlandse tabbladpaden | `public/canonical-service.js` |
| Register van gevoelige tabellen (`SLEUTELKLUIS_REGISTER`) | **30** items in totaal: **11** versleuteld onder de eigen `DEK` van de gebruiker (`dek1.`), **19** gemarkeerd als `nog-niet` met gedocumenteerde reden | `shared/sleutelkluis.ts`, `backend/sleutelkluis.ts` |
| Toegestane servergeheimnamen | **17** namen op de witte lijst (uitsluitend uit `/etc/mijn-ruimte/geheimen.env`, `DATABASE_URL` afgeschermd van app-code) | `server/platform/geheimen.ts` |
| Canonieke AI-agentintegraties | **14** afzonderlijke agenten, **14** tweetalige adapters, **12** gedeelde vaardigheden (204 v2-hulpmiddelsleutels) | `orchestratie/beleid.json`, `shared/connector-v2/agenten.ts`, `scripts/vaardigheden/catalogus.json` |

---

## 3. Feitelijke status van alle 11 functionele dienstrichtingen (§3 van het manifest)

Alle 11 functionele richtingen uit §3 van het Hoofdarchitectuurmanifest «Klimop» zijn aanwezig in de codebasis en worden bediend door het huidige centrale knooppunt:

| Nr. | Dienstrichting (§3 manifest) | Subdomein | Kernmodules | Huidige architectuurstatus |
|---|---|---|---|---|
| 1 | Hoofdwerkruimte | `hub.tarasevych.com` | `server/start.ts`, `backend/zoek/bronnen.ts`, `src/overzicht`, `src/notities` | Draait centraal op één VM; gezamenlijke zoekindex in `PostgreSQL`. |
| 2 | Elektronische post | `mail.tarasevych.com` | `backend/mail-imap.ts`, `backend/vertaal-adapters.ts`, `src/mail` | Draait centraal; IMAP-wachtwoorden en externe afbeeldingen (`0296`) onder `DEK`, maar hoofdprojectie `mail_items_v1` nog niet eind-tot-eind versleuteld wegens SQL-zoekfilters. |
| 3 | Accounts en identiteit | `id.tarasevych.com` | `backend/toegangslaag.ts`, `backend/sleutelkluis.ts`, `src/identiteit` | WebAuthn Passkey (met `PRF`-uitbreiding), `TOTP`, Telegram-aanmelding, aanmeldblokkade in `app.login_lockouts`; identiteit gekoppeld aan centrale gebruikerstabel. |
| 4 | Cloudopslag | `cloud.tarasevych.com` | `server/platform/opslag.ts`, `backend/cloud-platform.ts`, `shared/verdeelde-opslag.ts` | Lokale bestanden onder `/srv/data/uploads` (tot `384 MiB` per schrijfactie, aparte bomen `cloud/` en `cloud-technisch/`) + Drive/OneDrive/Dropbox/S3/WebDAV + Shamir-sleutelkernen (`0306`). |
| 5 | Agenda en gebeurtenissen | `hub.*` / `cloud.*` | `backend/agenda-caldav.ts`, `backend/google-suite-agenda-sync.ts`, `src/agenda` | `CalDAV`-geheimen onder `DEK`; gebeurtenissen `google_suite_calendar_events_v1` op tijdvenster bevraagd in centrale DB. |
| 6 | AI-ruimte | `ai.tarasevych.com` | `backend/geheugen-stroom.ts`, `backend/geheugen-taken.ts`, `src/ai-ecosysteem` | Geheugenstroomknopen (`0280`) en agent-botsleutels (`0281`) onder `DEK`; doorlopende taakoverdracht tussen 14 agenten (`0284`) met `FORCE RLS`. |
| 7 | Model Context Protocol-poort | `mcp.tarasevych.com` | `backend/connector-v2.ts`, `backend/mcp-protocol-2026.ts`, `shared/connector-v2/agenten.ts` | 14 gescheiden korte agentadressen, levende rol- en profielcontrole bij elke aanroep, browserextensie `0.4+` en pc-agent `0.3.0` zonder opdrachtregel. |
| 8 | Ontwikkelhulpmiddelen | `github.tarasevych.com` | `backend/github-koppeling-opslag.ts`, `backend/uitrol-github-ontvangen.ts`, `src/github` | GitHub-tokens onder `DEK`, strikte `TRACE-001`-herkomstverificatie op exacte `SHA-256`. |
| 9 | Slimme woning | `huis.tarasevych.com` | `backend/huis-vnext.ts`, `backend/verbinding-adapters/mqtt.ts`, `src/huis` | Beheer van kamers, apparaten, energie en Home Assistant / MQTT; vraagt een gedeelde woningsleutel voor woningleden (`app.huis_leden`). |
| 10 | Programmatische verbinders | `api.tarasevych.com` | `backend/api-platform-kluis.ts`, `shared/integraties-catalogus.ts`, `src/verbindingen` | Integratieregister, verbindingsafstemming en serverkluis `owner_vault_v1`. |
| 11 | Beheer en diagnostiek | `admin.*` / `dashboard.*` | `deploy/uitrol/mijn-ruimte-uitrol.sh`, `backend/uitrol-sleutels.ts`, `src/uitrol` | Ondertekende uitrolpakketten (`SSHSIG` of `Passkey`), 3-factoren-vertrouwen (`0304`), cumulatieve wachtrij (`0303`), `age`-reservekopieën. |

---

## 4. Audit van cryptografie, sleutels, opslag en beheerdersrechten

### 4.1. Wat reeds sterk beveiligd is

1. **Sleutelkluis met twee gescheiden ruimtes (`backend/sleutelkluis.ts`):** de persoonlijke (`prive`) en technische (`technisch`) ruimte hebben **twee onafhankelijke 32-byte gegevenssleutels `DEK`** (`AES-256-GCM`) die nooit onversleuteld in de database staan en geen omslag onder een serversleutel hebben. Elke `omslag1.`-verpakking is via `AAD` gebonden aan gebruiker, ruimte, omslagsoort en houder; een genulde sleutelbuffer wordt geweigerd (`weigerNulSleutel`).
2. **Sleutelontgrendeling in de browser via `Passkey PRF`:** de langlevende `KEK = HKDF(PRF)` wordt op het apparaat van de gebruiker berekend en niet naar de server gezonden; de herstelcode heeft `100 bit` entropie (20 tekens zonder `O/0/I/1`) onder `scrypt` (`N = 65536, r = 8, p = 1, 64 MiB`).
3. **Beveiligde uitrolketen (`deploy/uitrol/mijn-ruimte-uitrol.sh`):** kopie naar een afgeschermde root-map `0700` tegen tussentijdse vervanging (`TOCTOU`), verificatie via `ssh-keygen -Y verify` in naamruimte `mijn-ruimte-uitrol` of WebAuthn-passkey, verplichte `TRACE-001`-controle op GitHub en verbod op terugrollen naar oudere pakketten via de uitrolinbox.
4. **Shamir-drempelkern (`shared/verdeelde-opslag.ts`, migratie `0306`):** eindig-veld-rekenkunde over $\mathrm{GF}(256)$, geheimdeling $k$-van-$n$ en spreidingscontrole op rechtsgebied (`landCode`) en aanbieder (`aanbieder`).

### 4.2. Vijf vastgestelde enkele punten van uitval (SPOF) en kloven ten opzichte van «Klimop»

Conform §43 van het manifest (verbod om serverversleuteling of lokale kopieën voor te stellen als gedistribueerd ecosysteem) legt de audit vijf structurele beperkingen bloot:

1. **`SPOF-1` — Eén rekenmachine en één database (`Wortels` en `Bladeren`):** alle 34 `systemd`-eenheden, de serverkern op poort `8080` en de enige `PostgreSQL 18.6`-instantie draaien op één virtuele machine van de eigenaar. Uitval van deze VM stopt gelijktijdig alle 11 diensten.
2. **`SPOF-2` — Eén inkomende tunnel en één domeinnaam (`Stengels`):** alle 11 subdomeinen lopen via één `cloudflared`-tunnel met TLS-beëindiging bij Cloudflare en gecentraliseerde DNS `tarasevych.com`. Directe onderling geauthenticeerde kanalen tussen knooppunten en alternatieve routes ontbreken nog.
3. **`SPOF-3` — Geopende `DEK` in servergeheugen tijdens sessie en 19 `nog-niet`-tabellen (`Opslag` en `Versleuteling`):** tijdens een actieve browsersessie of geldig agenttoken houdt de server de geopende `DEK` in het werkgeheugen, en 19 tabellen in `SLEUTELKLUIS_REGISTER` (waaronder `mail_items_v1`, projecties en grote bestanden in `/srv/data/uploads`) wachten nog op eind-tot-eind clientversleuteling en uitwistolerante herstelcodering (Reed-Solomon).
4. **`SPOF-4` — Eénpersoonsgoedkeuring van regels en uitgaven (`Gedeeld bestuur` en `Zaden`):** ondertekening van `regels.lock.json` en vrijgave van uitrolpakketten rusten op sleutels van één eigenaar (`eigenaar`). `FROST`-drempelhandtekeningen ($t$-van-$n$), verifieerbare geheimdeling met toezeggingen (Feldman/Pedersen) en een volledig onafhankelijk reproductiepakket («Zaden», §1.7, §22) zijn nog niet ingevoerd.
5. **`SPOF-5` — Ontbrekende cryptografische dwangbeschermingsmodus (`Bescherming van de mens`, §17):** een afzonderlijke dwangingang, veilige beperkte weergave en verplichte tijdsloten met meerzijdige bevestiging voor gevaarlijke beheerhandelingen ontbreken nog.

---

## 5. Toetsing van Fase 0 aan de 15 vragen (§42) en gereedheid voor Fase 1

- **Is het draaiende productieplatform tijdens Fase 0 geraakt?** Nee — geen enkel actief proces, database, `systemd`-dienst of geheim is gewijzigd.
- **Zijn alle diensten, migraties, sleutels en beperkingen aantoonbaar in kaart gebracht?** Ja — alle 11 diensten, 187 migratiebestanden, 30 sleutelkluisregels en 5 enkele punten van uitval zijn vastgelegd en herhaalbaar controleerbaar via [`scripts/klimop-etappe0-audit.mjs`](../../scripts/klimop-etappe0-audit.mjs).
- **Volgende stap (direct meegenomen in `KLIMOP-002`):** overgang naar **Fase 1** — vastlegging van de architectuurkernspecificatie «Klimop», vergelijking van bewezen standaardtechnologieën, het register van 25 verplichte documenten, het gefaseerde uitgaveplan voor Fasen 2–12 ([`KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md`](KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md)) en de geïsoleerde kernmodule [`shared/klimop/kern.ts`](../../shared/klimop/kern.ts).
