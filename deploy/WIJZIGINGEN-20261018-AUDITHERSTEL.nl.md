> 🌐 **Taal / Мова:** [Українська](ЗМІНИ-20261018-ВИПРАВЛЕННЯ-АУДИТУ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

## Punt 3 — «Вийти всюди» en sessie-intrekking beëindigen ook het technisch profiel (migratie 0060)
- **Was:** `revoke-all`, `revoke-others`, `emergency-revoke` en `items/:id/revoke` beëindigden sessies maar lieten `app.tech_activaties` staan; na opnieuw aanmelden in hetzelfde tabblad (zelfde `tab_hash`) was het technisch profiel weer actief zonder stap-op, in open modus tot 366 dagen.
- **Nu:** elke activering onthoudt de ankersessie (`sessie_id`) en de tab-overlay (`tab_sessie_id`). `backend/tech-profiel.ts` → `beeindigenBijIntrekken(userId, reden, doel)`: `revoke-all`/`emergency` → alles; `revoke-others` → alles behalve de aanroepende sessie; `items/:id/revoke` (session/tab) → alleen die sessie/tab. Rijen van vóór 0060 (zonder `sessie_id`) tellen bij elke intrekking als «alle». Daarnaast controleert `actieveActivatie(userId, tab, sessie)` dat de activering bij de HUIDIGE sessie hoort (zelfde `sessie_id`, of oude rij begonnen ná het begin van de sessie) — dus na opnieuw aanmelden is niets actief en vraagt `/api/owner/tech/activeren` opnieuw stap-op (403 `STEP_UP_REQUIRED`).
- **Sessielijst (Обліковий запис → Сесії):** elke aanmelding draagt een badge «Користувацький» of «Користувацький + технічний» (modus, sinds, tot); knop «Завершити технічний профіль» (alleen de activering, route `POST /api/owner/identity/security/items/:id/tech-beeindigen`, kind sessie|tab, geen stap-op nodig) naast «Завершити сесію (обидва)»; «Вийти всюди» vraagt bevestiging en toont hoeveel aanmeldingen en technische profielen eindigen. Antwoorden van de revoke-routes bevatten `tech` (aantal beëindigde activeringen); overzicht geeft `tech` per item en `techLos` (oude rijen zonder sessie).
- **Logboek:** `owner.tech.beeindigd` met reden `revoke` / `revoke-all` / `revoke-others` / `emergency` / `handmatig` (+ `sessie`/`tabSessie`).
- **Test:** `tests/eenheid/tech-sessies.test.ts` (18 controles) reproduceert eerst het lek (activering zonder sessie blijft zichtbaar) en bewijst daarna via de echte routes: revoke-all / items/:id/revoke / emergency / revoke-others / tech-beeindigen / tab-intrekking / opnieuw aanmelden → 403 zonder stap-op / logboekredenen. `tech-profiel` blijft 36/36.
- Bestanden: `migrations/0060_tech_activatie_sessie.sql`, `backend/tech-profiel.ts`, `backend/tech-routes.ts`, `backend/index.ts` (4 revoke-routes, overzicht, nieuwe route), `src/SecuritySessionsPanel.tsx`, `src/sessies/sessies.css`, `src/UnifiedServiceApp.tsx` (type + mapping).

## Punt 5 — «Старий Google-обліковий запис не повинен створювати другого власника» (uitvoerder E)

**Verdict: artefact van de testomgeving, géén codefout — maar nu met harde vangrails in de code.**

Bewijs. De test `aanmelden` «eigenaar zonder identiteit koppelt eenmalig…» faalde als `false member/new` uitsluitend wanneer de
test-DB al een eigenaarsrij had: de fixture voegde blind een tweede `role=owner`-rij toe, de unieke index `records_een_eigenaar`
(`WHERE tbl='users' AND data->>'role'='owner'`) weigerde die (`db.add` → null, `eigenaarId` undefined) en de asserties vielen om.
Reproductie: eigenaarsrij invoegen → 17/18; geen eigenaarsrij → 18/18 (zowel op dit pakket als op het basispakket). De index is
juist de productiegarantie dat er nooit twee eigenaars kunnen bestaan. De code-route zelf (`ensureUser`: geen identiteit, geen
`users.sub`-treffer, e-mail = OWNER_EMAIL zonder Google-identiteit → `eigenaar-eerste-koppeling`) koppelt correct en behoudt de rol.

Tweede artefact, dezelfde oorzaak: de test demoteerde via `verouderdeEigenarenIntrekken` élke andere eigenaar (ander adres) tot
`member` en liet zo in de gedeelde test-DB negen `member`-dubbels van `eigenaar@test.invalid` achter → `tech-profiel` «niet aan
jezelf» kreeg `GEBRUIKER_NIET_GEVONDEN` (LIMIT 2 → twee treffers). Fixture nu: bestaande eigenaar tijdelijk parkeren en herstellen.

Codewijzigingen (vangrails, los van het artefact):
- `backend/account-koppeling.ts`: nieuw besluit `geweigerd/eigenaar-identiteit-vast` — een ander Google-subject met OWNER_EMAIL
  krijgt **nooit** een tweede account (vroeger een apart «new»-account).
- `backend/index.ts` `ensureUser`: weigering → `OWNER_IDENTITY_MISMATCH` (hash-keten `owner.aanmelden.geweigerd`, systeemlog
  `owner_sign_in_refused_identity_mismatch`, melding aan de eigenaar); eigenaar zonder eigenaarsrol → rol hersteld met
  `owner.rol.hersteld` (keten) + `owner_role_restored`. Reden-code in `OWNER_OAUTH_REASON_CODES`; uitleg uk/nl in
  `OwnerIdentityCallback.tsx` en `bevestig-toegang.tsx`.
- `backend/tech-profiel.ts` `doelGebruiker`: gepensioneerde accounts tellen niet mee; twee actieve accounts met één adres →
  `EMAIL_NIET_UNIEK` (409) in plaats van misleidend 404 (tekst in `TechLaag.tsx`).
- Tests: `aanmelden` 23/23 (nieuw: index-garantie, weigering zonder tweede account + log + melding, rolherstel; fixture parkeert
  de bestaande eigenaar), `tech-profiel` 36/36 zonder app-rol (controle «app-rol kan niet schrijven» wordt OVERGESLAGEN zonder
  `DATABASE_URL_APP`) en 37/37 met app-rol. Volgorde tech-profiel → aanmelden → tech-profiel blijft groen (geen vervuiling meer).

Productie controleren (alleen lezen, geen PII): `sudo -u postgres psql -d mijnruimte -v eigenaar='<OWNER_EMAIL>' -f deploy/CONTROLE-EIGENAAR-IDENTITEIT.sql`.
Verwacht: A=1, A2=1, B=1 rij (owner/approved), C=1 (of 0 op een nog nooit via Google aangemelde eigenaar), D=t, E=0 rijen.
Afwijking → `deploy/herstel-eigenaar.sql` (één transactie, standaard ROLLBACK; na controle COMMIT). Beide scripts lokaal getest.

## Punt 7 — Eén bron van waarheid voor de uitrolstand (migratie 0062, `backend/uitrol-bron.ts`)
Probleem (audit §3.2/§6): vier bronnen (status.json, gebeurtenissen.jsonl, `app.uitrol_runs`, `app.uitrol_voorstellen`) plus releasemap/VORIGE liepen uiteen;
`status.json.versie` was bij SSH de **mapnaam** en bij passkey de **pakketversie**; terugdraaien via dashboard (opdracht) of bewaker (nazorg) schreef niets.
- `huidigeStand()` leest alle bronnen (status.json, gebeurtenissen, runs, voorstellen, `current`, `VORIGE`, `/api/version`, nazorg-markering via diagnose.json, GitHub-tag en back-uptimer uit `opdracht-status.json`),
  normaliseert (**versie = altijd UITROL-VERSIE; release = mapnaam apart**), kiest de hoofdbron (standaard `runs`; anders de eerste bruikbare: runs → releasemap → versie → status),
  bewaart de samengevoegde stand in `app.uitrol_stand` en geeft `afwijkingen[]` (bron, veld, waarde, verwacht, uk/nl, ernst). Vastgelopen «bezig» in status.json (> 90 min zonder lopende run) is een error-afwijking, niet stil.
- Consumenten: `/api/owner/uitrol/overzicht` (`actieveVersie` + `stand`), de zijkant «Стан системи» (versie uit de hoofdbron + knop naar de kaart bij afwijkingen), MCP `get_live_release` (`liveRelease` in `mcp-console.ts`: dezelfde waarden + de releasebestanden ter controle).
- Installer (`noteer_ssh`): schrijft nu ook in de modi **opdracht** en **nazorg** een `TERUG_OK`-gebeurtenis met die herkomst en status.json met `versie` = pakketversie, `release` = mapnaam, `methode` = modus; `uitrol-runs.ts` maakt daar runs van (`methode` opdracht/nazorg; CONTROLE uitgebreid in 0062). `mijn-ruimte-uitrol-diagnose.sh` zet een `nazorg`-blok in diagnose.json.
- UI: «Джерела статусу» onder Діагностика (`src/uitrol/Bronnen.tsx`): SVG-kaart (15 knopen = echte modules, 27 pijlen = echte gegevensstromen), lijst (standaard op < 700 px) en tabel; klik → waarde/tijd/pad/verbindingen; ★ hoofdbron;
  instellen: hoofdbron (met waarschuwing buiten `runs`) en interval (5–300 s, alleen bij zichtbaar tabblad); afwijkingen geel/rood met uitleg welke bron voorgaat. Routes: `POST /api/owner/uitrol/bron`, `POST /api/owner/uitrol/bron/instellen` (eigenaar, admin-service, audit `owner.uitrol.bron.ingesteld`).
- Tests: `uitrol-bron` 24/24 (oud SSH-formaat herkend, afwijking releasemap↔runs, installer SSH/opdracht/nazorg, runs uit TERUG_OK, vastgelopen bezig, instellingen, MCP = pagina = overzicht, nazorg-blok, kaartstructuur); `server-beheer` 99/99 (assertie aangepast: versie = pakket, release = map); `uitrol-runs` 41/41; browser 22/22 (uk/nl, licht/donker, 1280 en 390 px).

## Punt 1 — Geen eigenaarssessie voor een AI; «агент від імені власника» alleen met passkey (migratie 0059, uitvoerder A)
- **Weg:** `issue_session_token`, `exchange_session`, `auto_session` (uit `OWNER_TOOLS`, `shared/ai-ruimte.ts`, `shared/ai-toegang.ts`, `shared/ai-beleid/catalog.ts`, `src/mcp-catalog.ts`); `backend/agent-session.ts` en `agent-session-route.ts` verwijderd. Een aanroep geeft `TOOL_VERWIJDERD` en komt in het journaal (`agent.sessie_tool.geweigerd`).
- **Sessiecontrole** (`backend/index.ts` `ownerFindSession`): een rij met `authMethod: 'agent-token'` of `verwijderdOp` geldt nooit — ook niet als het id «gerepareerd» wordt (de PoC uit de audit).
- **Migratie 0059:** tabel `app.agent_namens_sessies` (agent, ruimte, omvang, 15 min … 8 u via CONTROLE, teller, intrekken; alleen systeemrol) en markeert bestaande spooksessies met `verwijderdOp`/`verwijderdReden='AUDIT_K1'` (niet gewist).
- **Namens-sessie** (`backend/agent-namens.ts`, routes `/api/owner/agent-namens/{lijst,aanmaken,intrekken,spoken/opruimen}`): alleen de eigenaar op admin.*, aanmaken/opruimen alleen na **passkey**-step-up (TOTP/Google tellen niet), bevestiging na één actie verbruikt. Geen cookie of token: de agent gebruikt zijn bestaande koppeling; `callSite` (`backend/site-dispatch.ts`) laat de alleen-lezen beheerroutes uit de omvang toe zolang er voor DEZE agent en ruimte een actieve toestemming is. Nieuw hulpmiddel `get_admin_view` (technisch, alleen lezen; v2-naam `tonen_beheer_namens_*_beheer` — bestaande koppelingen zien het pas na «Змінити → перепід'єднати»).
- **Twee hekken** (`AGENT_VERBODEN`): account, rollen, aanmeldmethoden/passkeys, namens-sessies, grants, goedkeuren, AI-beleid, geheimen/vault/contour, connector-rechten, technisch profiel, agenttokens, serveropdrachten → `AGENT_NIET_TOEGESTAAN` in `callSite` én in `ownerRequireSession` voor gedelegeerde verzoeken.
- **Journaal:** elke regel in zo'n verzoek krijgt `details.actorType='agent'`, `details.agent` en «від імені» (`ctx_namens` = id van de namens-sessie); acties `agent.namens.{aangemaakt,ingetrokken,geweigerd,spoken_opgeruimd}`.
- **UI:** «Доступ ШІ» → blok «Агенти від імені власника»: actieve toestemmingen (agent, ruimte, resttijd, aantal acties, «Відкликати»), beëindigde, en «Примарні сесії (знешкоджено)» met «Очистити назавжди» (passkey).
- **Tests:** `agent-namens` 44/44 (reproductie K1 met controle-sessie, 0059, TOOL_VERWIJDERD, passkey/TOTP/niet-eigenaar, omvang/agent/ruimte, beide hekken, echte route 200, journaal, intrekken, verlopen, opruimen). Aangepast: `site-tools` 27/27, `mcp-connector` 71/71 (één hulpmiddel meer). Ongewijzigd groen: `ai-beleid`, `ai-ruimte`, `ai-toegang`, `mcp-console-c2`, `connector-v2`, `routes`, `beheer-journaal`.
- **Op de server na installatie:** `SELECT count(*) FROM app.records WHERE tbl='owner_service_sessions_v1' AND data->>'authMethod'='agent-token' AND data->>'verwijderdOp' IS NULL` moet 0 zijn.

## Punten 2, 6 en 10 — installatie sterft nooit stil, echte oorzaak, voortgang, commit verplicht (migratie 0063, uitvoerder B)
**Was (gereproduceerd):** `meta()` in `deploy/uitrol/mijn-ruimte-uitrol.sh` deed `head` op een ontbrekend AUTEUR-bestand onder `set -euo pipefail` → het
script stierf (rc 1) vóór `weiger GEEN_AUTEUR`; status bleef «bezig CONTROLE», geen gebeurtenis, voorstel later «verlopen GEEN_UITKOMST». De oorzaak van een
mislukte installatie was de LAATSTE regel met een breed woord («ts», tikfout «mislykt») → meestal «bouwen mislukt (journalctl …)». De balk stond tijdens de hele
installatie op 42 %. De app sloot na 30 min af terwijl systemd 45 min toestaat. BRON-COMMIT «unknown» werd overal geaccepteerd.
- **Root-script:** `meta()` geeft leeg bij een ontbrekend bestand → nette weigering. `trap` op EXIT/ERR/TERM/INT/HUP: elke andere afloop schrijft `mislukt AFGEBROKEN`
  (regel + afsluitcode) of `mislukt ONDERBROKEN` (SIGTERM/timeout; de installer wordt mee gestopt) in status.json, stappen.jsonl en gebeurtenissen.jsonl, en haalt het
  pakket uit de inbox. Testhaak `UITROL_TEST_BREEK` (als root gewist).
- **Oorzaak:** eerste regel met `error|ERR!|[installeer] FOUT:|psql …ERROR|FATAL|Traceback|fatal:` vanaf het begin van het lopende onderdeel, + 2 regels ervoor en 3
  erna → `reden` + `context[]` in status.json en de gebeurtenis; tekst noemt de stap («складання»/«bouwen»). App: kolommen `reden`, `context` in `app.uitrol_runs`
  (0063); UI-blok «Причина / Oorzaak» met context en «Що робити» (`src/uitrol/Oorzaak.tsx`) in de live-kaart en de details.
- **Voortgang:** `voortgang <id> <pct>` in `deploy/installeer-app.sh` (kopie 45, npm 55, bouwen 70, backup 75, migraties 80, activeren 90, gezondheid 95,
  nabewaken 98); root zet elke regel als stap «installeren» met dat percentage (`installeer_stappen`). `subVanRegel` en de begintijden kennen de nieuwe regels.
- **Wachttijden:** `shared/uitrol-tijden.ts` — systemd 45 min, GOEDGEKEURD_WACHT 50 min, RUN_STIL 60 min (was 30/90); getest tegen de service-bestanden.
- **Vertalingen:** `shared/uitrol-codes.ts` — titel + «wat nu» voor elke code uit root, GitOps, nazorg, installer en de passkey-hulp; `codeTekst` gebruikt ze.
  Test `uitrol-codes` leest de scripts: een nieuwe `weiger X` zonder vertaling laat de test falen.
- **Regel 3 (BRON-COMMIT):** 40-hex git-commit of uitdrukkelijk `zonder-git:<reden>` (≥ 5 tekens), anders `GEEN_BRON_COMMIT` — in de browser (`tar-lezen`),
  de voorcontrole (controle «commit»: fout of waarschuwing) en root. `maak-voorstelpakket.sh`/`maak-uitrolpakket.sh`/`.ps1`: weigeren buiten git, behalve met
  `--zonder-git "reden"` / `-ZonderGit`. Het archief zelf is leidend: na de voorcontrole wordt `bron_commit` van het voorstel uit het pakket gezet (0063 staat
  `zonder-git:` toe in de CONTROLE). Eén weergave overal (`CommitTekst`, `shared/bron-commit.ts`): commit, «зібрано поза git: причина» of «коміт невідомий».
  `/api/version` geeft `commitStatus` en `zonderGitReden`. `installeer-app.sh` maakt van een niet-hex BRON-COMMIT geen nep-commit meer (`tr -cd 0-9a-f`).
- **Regels voor iedereen die pakketten bouwt:** `deploy/REGELS-UITROLPAKKET.nl.md` (uk + nl).
- **Tests:** `uitrol-deur` 93/93 (+21: zonder AUTEUR/AGENT/SAMENVATTING, 4× ongeldige BRON-COMMIT, zonder-git, interne fout → AFGEBROKEN, SIGTERM → ONDERBROKEN,
  voortgang 42→98, `error TS6133` als reden), `uitrol-codes` 14/14 (nieuw), `uitrol-tijden` 7/7 (nieuw), `uitrol-pakket-maken` 5/5 (nieuw), `uitrol-voorcontrole`
  29/29 (+6), `tar-lezen` 18/18 (+3), `release-info` 7/7 (+4), `uitrol-runs` 46/46 (+5), `uitrol-goedkeuring` 181/182 (fixtures met BRON-COMMIT; de ene fout
  «db: mijnruimte_app» bestond al), `server-beheer` 99/99, `uitrol-nazorg` 10/10, `uitrol-bron` 24/24, `uitrol-herstel` 31/31. Browser (Chromium, uk/nl, licht/donker,
  390/1280 px): Oorzaak + CommitTekst zonder overloop.
- **Niet bewezen:** het echte root-script onder systemd (timeout → ONDERBROKEN), `maak-uitrolpakket.ps1 -ZonderGit` (geen PowerShell hier).
- **Let op:** dit pakket wordt nog door de LIVE release gecontroleerd en geïnstalleerd (oude regels: BRON-COMMIT niet verplicht). Geef het toch al een geldige
  BRON-COMMIT (buiten git: `zonder-git:<reden>`), zodat de site na de installatie de juiste commit toont. Vanaf dan weigert de server elk pakket zonder.

## 4. Releases worden bewaard en zijn te downloaden; publicatie op GitHub vanuit de site (migratie 0061)
- **Oorzaak (bewezen):** het archiefblok in `deploy/uitrol/mijn-ruimte-uitrol.sh` zocht `$BRON/../<naam>` of `/tmp/<naam>`; de gecontroleerde kopie heet
  `$WERK/pakket.tar.gz` en de inbox is dan al leeg → nooit een archief, en omdat de GitHub-stap op dat archief wachtte ook nooit een release (laatste tag 08.10.2026).
  De JSON-body werd met tekstvervanging gebouwd (`"body":"${SAMENVATTING}"`): een aanhalingsteken of nieuwe regel brak hem. Repository vast `Tarasevych/hub`,
  token in `/etc/mijn-ruimte/github-token` (nergens beschreven). Een downloadknop bestond niet.
- **Nu, op de server:** root bewaart vóór de OK-gebeurtenis exact de gecontroleerde kopie als `/srv/mijn-ruimte/pakketten/mijn-ruimte-<versie>.tar.gz` (+ `.sha256`;
  map root:mijnruimte 0770, bestanden 0640; nooit fataal) en zet `pakket_pad`, `pakket_sha256`, `pakket_bytes` in die gebeurtenis. Een SSH-installatie
  (`installeer-app.sh installeren <map>`) bewaart het archief naast de map (`<map>.tar.gz`) of pakt de bronmap in, en geeft dezelfde velden aan `SSH_OK`.
  Geen GitHub-code en geen token meer in het root-script. De app-unit kreeg `ReadWritePaths=-/srv/mijn-ruimte/pakketten` (de installer maakt de map vóór de herstart).
- **In de app:** `backend/uitrol-runs.ts` koppelt het archief aan de run (`app.uitrol_runs.pakket_*`; de parser accepteert alleen `/…/mijn-ruimte-<versie>.tar.gz`
  en een 64-hex sha256). De API geeft alleen «bewaard / sha256 / grootte», nooit het serverpad.
  - «Завантажити цей випуск» (detail van een run in «Історія» en «Журнал»): `POST /api/owner/uitrol/pakket/:runId/link` (eigenaar + sterke bevestiging
    passkey/TOTP/herstelcode, 20/uur) → eenmalige link (5 min, account + run) → `POST /api/owner/uitrol/pakket/:runId` streamt het bestand
    (allowlist in `server/start.ts`, `X-Pakket-Sha256`). De browser controleert de sha256 na het downloaden. Beide in het journaal (`owner.uitrol.pakket.gedownload`).
    Runs van vóór deze reparatie: uitleg «архів не збережено (до виправлення 18.10.2026)» in plaats van een knop.
  - «Налаштування → Архіви випусків і GitHub»: welke token (kluisdoel **`github-uitrol`** — technisch, alleen releases, fine-grained `Contents: write` op één repo —
    heeft voorrang op de persoonlijke **`github`**; alleen naam + aanwezig, nooit de waarde), knop «Під'єднати GitHub» → «Секрети й ключі» (passkey),
    repository `eigenaar/repo`, «Публікувати автоматично», archiefmap (aantal, grootte) met «Видалити старіші» (bewaar N ≥ 3 nieuwste, de actieve altijd; passkey),
    logboek van publicaties (ook mislukte, met vertaalde reden).
  - `backend/uitrol-github.ts`: release `uitrol-<versie>` met echte JSON (wijzigingen + sha256 + commit), `target_commitish` alleen bij een 40-hex BRON-COMMIT,
    archief als asset (stream), idempotent (bestaande release/asset hergebruikt), 3 pogingen bij netwerk/5xx/429, geen herhaling bij 4xx. Fouten zijn codes
    (`GITHUB_HTTP_401`, `GITHUB_NETWERK`, …), de token komt nooit in log, run, journaal of antwoord. Automatisch: zodra een nieuw archief aan een run hangt.
  - Journaal: `owner.uitrol.pakket.gedownload`, `owner.uitrol.pakket.opgeruimd`, `owner.uitrol.github.gepubliceerd`, `owner.uitrol.github.mislukt`,
    `owner.uitrol.github.instellingen` (categorie «Оновлення сайту»).
- **Tests:** `uitrol-deur` 99/99 (+6: archief bestaat, byte-voor-byte gelijk, `.sha256`, 0640, OK-gebeurtenis met pad/sha256/grootte, geen velden bij weigering);
  `uitrol-pakketten` 43/43 (nieuw: eerst het oude gedrag — OK zonder archief → run zonder pakket —, dan koppeling OK/SSH_OK, parser weigert `/etc/shadow`,
  download zonder eigenaar/zonder bevestiging/zonder of met hergebruikte link geweigerd, met bevestiging bestand + sha256 + journaal, GitHub-JSON met `"`/`\n`/`\`,
  target_commitish, asset-upload met volledige grootte, idempotent, 502 → 3×, netwerk → 3×, 401 → 1×, token nergens, zonder token «niet gekoppeld»,
  automatisch publiceren, opruimen met passkey en minimum 3); `uitrol-runs` 46/46; `geheimen` 7/7. Browser-harness (Chromium, uk/nl, licht/donker, 390/1280):
  44/44 — geen overloop, uitleg bij oude runs, download met juiste naam en sha256-waarschuwing bij verschil, vertaalde GitHub-fouten.
- **Niet bewezen:** echte upload naar GitHub (alleen met nep-fetch), echte schijfrechten op de server (map 0770 + `ReadWritePaths`), grote archieven (300 MB) in de
  browser (de download gaat via een blob in het geheugen, zoals bij de nachtelijke back-ups).
- **Na de installatie:** in «Секрети й ключі» een token met doel «GitHub — релізи сайту (технічний)» toevoegen, in «Оновлення → Налаштування» de repository invullen
  en desgewenst «Публікувати автоматично» aanzetten. Bestaande releases hebben geen archief (ze werden nooit bewaard); vanaf de volgende installatie wel.

## 8 en 9 — Kleine UI-gebreken en de browserextensie (uitvoerder G)

- **8a Band «ТЕХНІЧНИЙ» verbergt bij scrollen.** Oorzaak: de oude code luisterde naar `window.scrollY`, maar de dienst scrolt in `.canonical-workspace`. Nu `src/tech/band-verbergen.ts`: één `scroll`-luisteraar met capture op `document` (elke container), verbergen na > 80 px omlaag, terug bij omhoog scrollen, muis aan de bovenrand, focus in de band of Esc. Verborgen band = `html[data-tech-verborgen]` → `#root` naar `top:0` (de 40 px komen vrij), 6 px handgreep blijft; `prefers-reduced-motion` zonder animatie.
- **8b Eén knop «Написати лист».** De tweede zwevende knop + tweede berichtvenster in `MailSidebarNavigation.tsx` (portal) zijn weg; alleen `MailComposeFloat.tsx` (één zone `mail-compose-float`). De pil in het menu opent hetzelfde venster (`mail:open-compose`). De knop is onzichtbaar tot de plaats bekend is (geen sprong), staat links van de bel met ≥ 12 px ruimte of eronder op smalle schermen, en respecteert de veilige zone (`src/mail-compose-plaats.ts`).
- **8c 390 px.** Korte stapnamen in de wizard (Файл · Перев. · Завант. · Схвал. · Встан.), etiketten breken binnen hun kolom; tabbladen in `TabsRij.tsx` met vervaagde randen en pijlen als er meer is.
- **8d Tijdzone.** `src/uitrol/tijdzone.ts`: terminal, stappen en historie gebruiken dezelfde zone (standaard die van de browser), met afkorting (CEST/UTC/GMT+3) in de terminalbalk. Keuze «Часова зона» in Оновлення → Налаштування: browser / UTC / Brussel / Kyiv (localStorage, try/catch).
- **9 Extensie 0.4.1.** Strook «Доступне оновлення розширення X → Y» op elke pagina (`src/ExtensieUpdateBand.tsx`, eigen root in `main.tsx`) met «Оновити автоматично» (alleen CRX-installatie; `UPDATE_CHECK` → `chrome.runtime.requestUpdateCheck`), «Як оновити вручну», «Нагадати пізніше» (24 u; niet bij verplicht < 0.4.0). De extensie controleert zelf elke 6 u en toont «↑». Build: `minVersion`, `crxStatus`, oude crx/updates.xml verwijderd. `sign-extension.mjs` maakt nooit meer stil een nieuwe sleutel (exit 2) en weigert een sleutel met een ander extensie-id (exit 3). Details en de stap voor de eigenaar: `deploy/EXTENSIE-BIJWERKEN.nl.md`.
- **Tests:** `tests/eenheid/ui-audit-g.test.ts` 50/50 (elke controle reproduceert eerst het oude gedrag), `browser-extensie` 21/21 (whitelist uitgebreid met `UPDATE_CHECK`, manifest ≥ 0.4.0), `extensie-toestand` 14/14, `extension-folder-install` 5/5, `terminal-kleur` 18/18; harness `/tmp/h-G/test.py` 36/36 (Chromium 1280 en 390 px, licht/donker: band verdwijnt bij scrollen in de container en `#root` schuift mee, wizardlabels zonder overlap, geen horizontale scroll, updatestrook en «later»).
- **Niet bewezen:** automatische update in een echte Chrome (vereist de CRX 0.4.1, ondertekend met de sleutel van de eigenaar — die staat niet in de repository); de mailknop in de echte pagina met bel en ingeklapt menu (alleen bron- en plaatsingstests).

## Integratie (alle uitvoerders samen) — wat bij het samenvoegen nog is rechtgezet
- **«Draait nu» = wat echt actief is** (`backend/uitrol-bron.ts`): de hoofdbron (`runs`) bepaalt staat/methode/tijd, maar `versie`/`release`/`commit` komen van de map waar `current` naar wijst (anders het siteproces). Zonder dit toonde `get_live_release` na een installatie zonder run (oud script, handmatig) een **oudere** versie als live. De afwijking blijft zichtbaar; nieuw veld `versieBron`. Tests `uitrol-bron` 25/25 (bijgewerkt + nieuw: «nieuwere releasemap staat als afwijking»), `mcp-spiegel` 11/11 (fixture met echte `current`).
- `mail-qa-2026-10-12`: M1 (tik opent, slepen na > 8 px, venster in portal) controleert nu `MailComposeFloat.tsx`, plus nieuwe controle «geen tweede knop/venster in de zijbalk» — 37/37.
- `menu-snelheid`: vierde root (`ExtensieUpdateBand`) verwacht en gecontroleerd dat ook die pas na activering start — 28/28.
- Testomgeving: `extension/` en `public/` werden niet naar de testmap gekopieerd (vals rood in `browser-extensie`/`ui-audit-g`); `tech-profiel` «niet aan jezelf» = vervuiling van de gedeelde test-db (extra member-rijen met het eigenaarsadres, door andere tests), niet de code.

## Te controleren op de server na installatie (alleen lezen)
```
sudo -u postgres psql -d mijnruimte -v eigenaar='<OWNER_EMAIL in kleine letters>' -f deploy/CONTROLE-EIGENAAR-IDENTITEIT.sql
sudo -u postgres psql -d mijnruimte -Atc "select count(*) filter (where data->>'verwijderdOp' is null), count(*) from app.records where tbl='owner_service_sessions_v1' and data->>'authMethod'='agent-token'"   # verwacht: 0|<n>
sudo -u postgres psql -d mijnruimte -Atc "select version from app.schema_migrations order by 1 desc limit 6"   # 0063 … 0058
ls -la /srv/mijn-ruimte/pakketten/   # na de eerstvolgende installatie: mijn-ruimte-<V>.tar.gz + .sha256
```
