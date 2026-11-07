> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261018-TECH-AFRONDING.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261018-TECH-AFRONDING.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Afronding technisch profiel en open punten — 18.10.2026

## A — Technische band zonder knipperen; «Сайт оновлено» voor open tabbladen
- **Oorzaak knipperen (live gemeten):** 305 wissels van `data-tech-verborgen` in 15 s. Verbergen bij scrollen zette `#root` van top 40 → 0 px; de scrollcontainer werd hoger, de browser corrigeerde `scrollTop`, dat gaf een scroll-event, de band kwam terug, `#root` schoof weer… De meldingenbel (vast in `#root`) schokte mee (in de test tot 80–88 px).
- **Oplossing — verbergen bij scrollen zonder geometrie («headroom», `src/tech/band-headroom.ts`).** De knop «Згорнути смугу» (eerste herziening) is op verzoek van de eigenaar weer weg, samen met `band-inklappen.ts`. Verbergen verandert nu **alleen `translate`**: `top`, hoogte en padding van `#root`, werkruimte en zijbalk zijn in beide standen gelijk, dus `scrollHeight`/`clientHeight` veranderen niet en de browser heeft niets te corrigeren. Verborgen schuiven band, ondersteunings-/impersonatieband en de hele app samen één bandhoogte omhoog (0,22 s, zoals de adresbalk op een telefoon); zichtbaar is alles exact zoals vroeger. Werkruimte en zijbalk lopen één bandhoogte onder `#root` door (buiten beeld zolang de band zichtbaar is) zodat er onderaan geen gat valt: de werkruimte met een lege strook (`::after`) zodat ook de laatste rij bereikbaar blijft, de zijbalk met evenveel extra onderpadding (inhoud even hoog, achtergrond en scheidingslijn tot onderaan); mail (volle hoogte) houdt zijn indeling via een doorzichtige onderrand. `#root` kreeg `overflow:visible` (geen scrollcontainer meer — kan dus ook niet ‘ongemerkt’ verschuiven). **Bel, haar melding en paneel schuiven even ver terug en staan stil**; `vast-kader.ts` rekent met `#root` zonder zijn translate (en herkent de losse `translate`-eigenschap als kader), dus «Написати лист» naast de bel springt ook niet. Beslissing (zuiver, getest): één echte scrollcontainer (`scroll` met capture, `e.target`; alleen verticaal en ≥ 50 % van de vensterhoogte), afgelegde weg in één richting ≥ 24 px, ≥ 300 ms tussen wissels (een wissel die moet wachten wordt na 300 ms opnieuw beoordeeld), alles binnen 220 ms na een wissel genegeerd, rubberband begrensd; bovenaan (≤ bandhoogte) altijd zichtbaar; tonen ook bij muis tegen de bovenrand, focus in de band en Esc; niet verbergen zolang «⋯» of een venster van de band open is; `prefers-reduced-motion` → zonder animatie. Terloops: de dock boven/onder en de dichte telefoonknop van het menu kregen in technische modus ten onrechte de volle hoogte — de zijbalkregel geldt nu alleen voor de verticale zijbalk.
- **«Сайт оновлено до <versie>»** (`src/platform/nieuwe-versie.ts`, `NieuweVersieBand.tsx`, eigen root in `main.tsx`): de build zet zijn versie in de bundel (`vite.config.ts` → `__MR_BOUW_VERSIE__` uit `UITROL-VERSIE`); de site vraagt `/api/version` (no-store) bij terugkeer naar het tabblad en elke 60 s zolang het zichtbaar is (nooit vaker dan elke 15 s). Andere versie → niet-blokkerende strook linksonder (bel blijft vrij) met «Оновити сторінку» en «Пізніше» (tot de volgende versie). Vanzelf herladen alleen als het tabblad verborgen is én er niets ingevuld is (gewijzigde velden, concepten, contenteditable). De service achtergrondproces was al network-first voor HTML en laat `/api/` met rust; bij een nieuwe versie vraagt de site hem ook om bij te werken.
- **Tests:** nieuw `band-headroom` 32/32 — o.a. **de oude lus nagebootst** (oude regel + klemmende geometrie: 1876 wissels in 15 s; nieuwe regel in dezelfde geometrie: 0), drempel 23/24 px, 220/300 ms, bovenaan, rubberband, andere container, «⋯» open, 15 s intensief (≤ echte richtingswissels; 0 bij trillingen < 24 px), CSS: verborgen-regels zetten alleen `translate`. `ui-audit-g` 42/42 (8a op het nieuwe gedrag), `vast-kader` 22/22, `menu-snelheid` 29/29 (vijfde root), `nieuwe-versie` 20/20. Browser (Chromium, echte TechLaag + tech.css + canonical-chrome.css + CanonicalNotificationCenter, zijbalk, plakkende kop, klein en horizontaal lijstje; 1280 en 390 px) **29/29**: 15 s intensief scrollen (wiel, rukken, naar het einde, rubberband nagebootst, trillingen) → 24 wissels bij 45 echte richtingswissels, 0 bij trillingen/rubberband; `scrollHeight`/`clientHeight` van de werkruimte, hoogte van de zijbalk en `top` van `#root` elk één waarde; bel in rust zichtbaar ±0,00, verborgen ±0,00, verschil 0,00 px, ook tijdens de animatie 0,00 px; omlaag → band uit beeld, werkruimte en zijbalk tot de onderrand; omhoog → terug, zijbalk/plakkende kop onder de band, onderste menuknop in beeld; muis bovenrand, Esc, focus → zichtbaar; klein/horizontaal lijstje → blijft; onderaan met zichtbare band → laatste rij in beeld; document scrolt niet; reduced-motion → 0 s. **Dezelfde test op het pakket 20261018-153026 reproduceert het probleem:** 64/74 wissels bij 45 richtingswissels (ook 9–10 in de rubberband-fase), 227/230 verschillende `top`-waarden van `#root`, bel 79/86 px. Browser «Сайт оновлено» 14/14.

## C — «Захист»: auth-poort, OPA fail-closed en RLS met één beslissing van de eigenaar (migratie 0066)

**Waar:** /diagnostiek → tabblad «Захист» (`src/beveiliging/Beveiliging.tsx`). Per bescherming een kaart: stand (вимкнено / тінь / увімкнено),
gereedheid (controles die de server op de echte database en dienst doet), «Увімкнути» en «Вимкнути».

**Mechanisme zonder SSH:** `app.beveiliging_schakelaars` (0066). De site leest de stand bij de start en daarna hoogstens elke 5 s
(`server/platform/schakelaars.ts`); wie schakelt, werkt het geheugen meteen bij → aan/uit zonder herstart.
Voorrang blijft: `AUTH_POORT_AFDWINGEN` / `OPA_AFDWINGEN` = 1|0 (geforceerd) en voor OPA het root-bestand (`"beheer-alleen-tech": true`).
RLS: de stand blijft `app.rls_instellingen`; de systeemrol schrijft die niet zelf, alleen via `app.rls_afdwingen_zetten()` (BEVEILIGING DEFINER,
EXECUTE alleen voor mijnruimte_system; veilig omdat die rol BYPASSRLS heeft — de stand beperkt alleen mijnruimte_app).

**Gereedheid (blokkerend, server controleert opnieuw bij het aanzetten):**
- auth-poort: schaduw loopt; geen anonieme 2xx buiten `PUBLIEKE_ROUTES` in de gekozen periode (`app.rls_audit` 'anoniem-2xx').
- OPA: OPA gezond; schaduwbesluiten in de periode; geen «verschil»; geen «zou geweigerd zijn» (doel-weigert/onbereikbaar, per actie);
  eigenaar in een technisch profiel (ontbrekende mogelijkheden = waarschuwing).
- RLS: `DATABASE_URL_APP` gezet; rol mijnruimte_app LOGIN zonder BYPASSRLS/SUPERUSER; verbinding werkt als die rol; RLS + policy op elke
  tabel met een accountkolom die de app mag raken; isolatieproef als app-rol in één transactie met ROLLBACK (`app.rls_proef` = strenger-alleen
  GUC: synthetisch account A schrijft, B ziet/wijzigt/wist niets en ziet in geen tabel rijen van anderen; controle dat de proef echt test);
  schaduwaudit RLS leeg.

**Hekken:** aanzetten = eigenaar + actief technisch profiel in dit tabblad + passkey (STEP_UP_REQUIRED, eenmalig verbruikt) + reden.
Uitzetten = eigenaar, meteen, zonder passkey/techprofiel. Routes `/api/owner/beveiliging/*` hangen bewust niet achter `afdwingAdmin`
(noodrem werkt ook als OPA stuk is) en staan in `AGENT_VERBODEN`. Alles in het beheerjournaal (`admin.beveiliging.*`) met reden.

**Zekering:** 10 min na het aanzetten, hoogstens elke 15 s na een antwoord (`server/platform/antwoord-teller.ts`, geen timer):
401-piek van de poort (≥ 5/2 min), OPA onbereikbaar (≥ 3), 403-piek, RLS-fouten 42501 (≥ 3), of 5xx-piek boven max(5 %, 3× basis) →
automatisch uit + journaal `admin.beveiliging.zekering` + melding aan de eigenaar (link /diagnostiek).

**DATABASE_URL_APP zonder SSH:** knop «Створити роль застосунку» (passkey) start `mijn-ruimte-db-rollen.service` (polkit: alleen «start»
van die vaste naam). Root-kopie van het script (`installeer-app.sh` → `db_rollen_hulp_inrichten`, kopieert alleen) voert
`db-rollen-instellen.sh instellen-als-nodig` uit: bestaat de variabele al → niets; anders `instellen` (rollen, SCRAM, geheimen.env, herstart,
gezondheidscontrole, bij een fout alles terug). Uitkomst zonder waarden in `/var/lib/mijn-ruimte-uitrol-status/db-rollen.json`.
Bewust niet automatisch tijdens elke installatie: een terugdraai van de release haalt omgevingsvariabelen niet weg.

**Bestanden:** migrations/0066_beveiliging_schakelaars.sql, migrations/rechten.sql (punt), server/platform/{schakelaars,antwoord-teller}.ts (nieuw),
server/platform/{auth-poort,router}.ts (punt), backend/beleid.ts (punt), backend/beveiliging-schakelaars.ts (nieuw), backend/index.ts,
backend/agent-namens.ts, shared/beheer-journaal.ts (punt), src/beveiliging/* (nieuw), src/diagnostiek/Diagnostiek.tsx (punt, tab),
deploy/mijn-ruimte-db-rollen.service (nieuw), deploy/db-rollen-instellen.sh, deploy/opdracht/50-mijn-ruimte-opdracht.rules, deploy/installeer-app.sh (punt).
**Tests:** tests/eenheid/beveiliging-schakelaars.test.ts — 72/72 (gewoon), 76/76 met rollen (run-test-rls.sh, echte RLS aan/uit + zekering);
toegang-context 54/54 met rollen; rls 11/11, rls-groepen, routes, server-beheer 99/99, beleid-afdwingen, agent-namens 45/45, beheer-journaal, ssh-ca ongewijzigd groen.

## D — «Віддалений стіл»: RDP/VNC/SSH via Apache Guacamole (migratie 0067)

Melding: «Guacamole (RDP/VNC) — не впроваджено, зараз лише текстовий термінал». Nu: technisch profiel → menu → «Віддалений стіл».

**Keten.** Browser (`guacamole-common-js` 1.5.0, eigen chunk, laadt pas bij een sessie) —WSS `/api/owner/remote/tunnel`→ app
(`backend/remote-bureaublad.ts`, eigen tunnel, geen guacamole-lite) —TCP `127.0.0.1:4822`→ **guacd** —RDP/VNC/SSH→ doel.
De browser praat nooit met guacd. WS-pad via `registreerWsPad` in `backend/connectors-gateway.ts` (zelfde host-controle,
`?ticket`/`?token` geweigerd) plus Origin = Host.

**Regels.**
- Openen: alleen de eigenaar (rol + eigenaarsadres), technisch profiel actief in DIT tabblad, verse **passkey** (geen Google/TOTP;
  één bevestiging = één handeling). Ook verbinding opslaan/verwijderen en «Дозволені хости» vragen passkey.
- Ticket: 60 s, eenmalig (nonce), HMAC; bevat sessie-id + vervaltijd + nonce, nooit het wachtwoord; gaat als eerste
  Guacamole-bericht `mr-auth`, niet in de URL.
- Wachtwoord/sleutel: alleen in de kluis (`owner_vault_v1`, naam `remote-<id>`), komt pas bij de guacd-handshake uit de kluis
  en wordt daarna uit het geheugen gewist; nooit in antwoorden of logboek.
- Doelen: privénetwerken, loopback, CGNAT; publiek alleen van de lijst van de eigenaar; link-local/metadata (169.254.*, fe80::),
  multicast, 0.0.0.0/8, 240/4 altijd verboden (ook `::ffff:`-vormen). De server lost DNS op, controleert ELK adres (gemengd
  antwoord = geweigerd) en geeft guacd het IP → geen DNS-rebinding. «Перевірити» = TCP-connect (3 s), alleen binnen deze regels.
- Bestandsoverdracht standaard UIT (ook gefilterd in de tunnel: `file`/`put`/`pipe`), klembord per verbinding, opname optioneel
  naar `/srv/data/guac-opnames` (30 dagen, tmpfiles.d).
- Einde: zelf, 15 min zonder invoer, eindtijd (≤ 8 u en ≤ einde activering), technisch profiel weg (uitloggen, intrekken,
  verlaten, opnieuw activeren — meteen via haak `bijTechEinde` in `backend/tech-profiel.ts`, plus controle elke 20 s), browser of
  guacd weg. Max. 3 sessies. Elke sessie in `app.remote_sessies` + audit `owner.remote.geopend/verbonden/mislukt/gesloten`
  (wie, wanneer, waarheen, duur, reden, bytes).
- AI: geen MCP-tool; `/api/owner/remote/*` staat in `AGENT_VERBODEN`.
- Band: «● активний віддалений сеанс» zolang dit tabblad een sessie heeft; het sessievenster blijft onder de band.

**guacd op de server (moet geïnstalleerd zijn — doet de installer).** `deploy/installeer-app.sh` → `guacamole_inrichten`:
- alleen als `"guacamole": true` in `/etc/mijn-ruimte/mcp-rechten.json` (nieuwe installaties: `"guacamole": false`; ontbreekt =
  uit). Uit: niets geïnstalleerd, een eerder gestarte guacd wordt gestopt; de site meldt «вимкнено на сервері».
- aan: `apt-get install guacd libguac-client-rdp0 libguac-client-vnc0 libguac-client-ssh0`, systeemgebruiker
  `mijnruimte-guacd`, eigen verharde unit `mijn-ruimte-guacd.service` (`guacd -b 127.0.0.1 -l 4822`, ProtectSystem=strict,
  geen capabilities, IPAddressDeny link-local/multicast); de pakketunit `guacd.service` gaat uit. Geen apt-pakket maar wel
  docker → `mijn-ruimte-guacd-docker.service` (image `guacamole/guacd:1.5.5`, host-netwerk, `-b 127.0.0.1`, alleen-lezen,
  cap-drop ALLE). Daarna controle met `ss`: luistert guacd op iets anders dan loopback → meteen gestopt.
- Aanzetten: `"guacamole": true` in mcp-rechten.json, installer opnieuw draaien (of de gewone uitrol). Migratie 0067 zoals altijd.

**Getest.** `tests/eenheid/remote-bureaublad.test.ts` 67/67: tickets (handtekening, eenmalig, verlopen), SSRF (publiek,
169.254.*, `::ffff:`, octaal, DNS-rebinding), rechten (geen eigenaar, nep-«eigenaar», geen techprofiel, ander tabblad, geen passkey,
agent), tunnel tegen een nep-guacd (echte TCP-handshake, IP + kluiswachtwoord in `connect`, bestanden geblokkeerd, ticket
eenmalig, 5 s zonder ticket dicht), inactiviteit, techprofiel verlaten (haak), logboek zonder wachtwoord. Regressie:
agent-namens, tech-sessies, tech-profiel, terminal, beheer-journaal groen. Harness `/tmp/h-D2` (lijst, formulier, sessievenster
met nep-tunnel en echte guacamole-common-js) uk/nl × licht/donker × 1280/390: 124/124.
**Niet geverifieerd:** een echte RDP/VNC/SSH-verbinding via een echte guacd (geen guacd en geen doelmachine in de testomgeving),
de installatie op de live server (niet uitgerold), en emoji/tekens buiten het BMP in het klembord (de client telt lengtes in
UTF-16, guacd in codepunten).

## E · «Подивитися як користувач» (impersonatie met toestemming, migratie 0068)

**Wat:** een beheerder (technisch profiel met `impersonatie.aanvragen`: rol «ondersteuning» of de eigenaar) vraagt in de technische
band («Подивитися як користувач») met e-mail, reden en duur 5–60 min (standaard 15). De gebruiker krijgt een melding en een venster
met wie, waarom, hoe lang, wat zichtbaar en wat nooit; «Дозволити» vraagt een verse **sterke** bevestiging (passkey/TOTP/herstelcode,
daarna verbruikt), optioneel «ook acties». Daarna toont het tabblad van de beheerder de site van de gebruiker onder een rode band
«Ви переглядаєте як … · залишилось mm:ss · Завершити» (gestreept met acties). Gebruiker: rode pil + «Хто зараз має доступ до мого
облікового запису» (`#wie-heeft-toegang`) met «Завершити негайно» en het journaal van de sessie.
**Hoe (geen cookie of token van de gebruiker):** elke same-origin `/api/…`-fetch in dat tabblad gaat via `POST /api/impersonatie/aanroep`
met de eigen sessie van de beheerder; de server controleert per aanroep de rij (actief, eind_op, dezelfde beheerder, hetzelfde tabblad,
technisch profiel loopt) en voert de route in-process uit als de gebruiker (`site-dispatch.roepAlsImpersonatie`). Drie hekken «alleen
lezen»: routeregel (`shared/impersonatie.ts`), `ownerRequireSession` (gedelegeerde tak), `db.ts` (schrijven in app.records geweigerd).
Vaste verbodslijst ook met acties: identity/*, access/*, admin/beheer/security, tech, uitrol, geheimen/vault/tokens, export, betalingen,
uitloggen, impersonatie/ondersteuning. Einde: tijd, gebruiker, beheerder, uitloggen/einde technisch profiel (lui bij elke aanroep).
Journaal: elke regel binnen een sessie met actor = beheerder, `actorType: 'impersonatie'`, `namensId` = gebruiker, «від імені» = sessie;
leesaanroepen 1×/route/min, elke actie en weigering apart. AI-agenten: `/api/impersonatie/*` en `/api/ondersteuning/*` in AGENT_VERBODEN.
**Bestanden:** `migrations/0068_impersonatie.sql`, `migrations/rechten.sql` (SELECT-only voor app-rol), `backend/impersonatie.ts`,
`backend/impersonatie-routes.ts`, `shared/impersonatie.ts`, `src/impersonatie/{modus,herschrijf}.ts`, `src/impersonatie/{Band,Impersonatie}.tsx`,
`src/impersonatie/impersonatie.css`; puntwijzigingen in `backend/index.ts` (hek 2 + routes), `backend/site-dispatch.ts`,
`backend/agent-namens.ts`, `server/platform/{context,audit,db}.ts`, `src/main.tsx` (modus vóór de app, geen extra createRoot),
`src/tech/TechLaag.tsx` (knop + gebruikerslaag), `shared/beheer-journaal.ts` (etiketten).
**Tests:** `tests/eenheid/impersonatie.test.ts` 71/71 (echte DB, echte routes: geen toestemming → geen sessie; toestemming zonder sterke
step-up → geweigerd; alleen lezen blokkeert 7 echte schrijfroutes + hek 2 + hek 3; lezen toont de gegevens van de gebruiker; verbodslijst
met acties; tijd/gebruiker/uitloggen beëindigen meteen; journaal met actorType; beheerder zonder rol → 403; agenten geweigerd);
beheer-journaal 44/44, tech-profiel 36/36, menu-snelheid 29/29. Harness `/tmp/h-E2` uk/nl × licht/donker × 390/1280: 104/104.
**Niet geverifieerd:** de volledige app (bootstrap, alle diensten) in impersonatiemodus tegen een echte server; `<img src="/api/…">`,
XHR, EventSource en WebSockets worden niet doorgestuurd (alleen fetch); routes die rechtstreeks via `getPool` schrijven vallen alleen
onder hek 1+2; meldingen alleen in de site (er is geen mailmechanisme). Twee bestaande controles faalden al in deze testomgeving
(ondersteuning «app-rol»: zonder DATABASE_URL_APP is de app-pool de systeemrol; agent-namens «gewone sessie»: gewone cookie-sessie,
raakt de gewijzigde gedelegeerde tak niet — niet tegen een schone kopie nagegaan).

## G — Technische bundels alleen voor een tech-sessie; diagnose «для всіх / лише для мене» (migratie 0070)

### G1 — /assets/tech/* alleen met actief technisch profiel
- **Indeling** (`shared/tech-assets.ts`): technisch = `src/uitrol|geheimen|diagnostiek|overzicht|audit|integraties|terminal|flags|ssh|remote|guacamole|beheer|beveiliging|bescherming/`, `src/Admin*.tsx`, `src/admin-*.{ts,tsx,css}`, `src/UitrolMeester.tsx`, of een bestand dat begint met `// @tech-asset` (voor nieuwe beheerpagina's zonder de lijst te wijzigen). Bewust openbaar: `src/tech/*` (band, poort, activeervenster), `src/diagnose/`, `src/ondersteuning/`, `src/agenten/`, `src/instellingen/`.
- **Bouw** (`vite.config.ts`, alleen `rollupOptions.output.chunkFileNames/assetFileNames`): een lazy chunk waarvan de ingang (of alle eigen modules) technisch is → `dist/assets/tech/` (+ zijn CSS). Lazy blijft lazy; gedeelde chunks met openbare code blijven openbaar. Nu: AdminConsoleView (met alle beheerpagina's), Terminal, Vlaggen, SshBeheer, RemoteBureaublad, integratielogo's.
- **Bouwcontrole** `scripts/tech-assets-controle.mjs` (in `npm run build`, direct na `vite build`): faalt als een openbare bundel een technische STATISCH importeert, als `index.html` naar `assets/tech/` verwijst, of als er geen enkele technische bundel is.
- **Server** (`server/start.ts` → `backend/tech-assets.ts`): elk pad onder `/assets/tech/` alleen met een geldige toegangscookie `__Secure-tsv_tech_assets` (HttpOnly, Secure, SameSite=Strict, Domain=.tarasevych.com, Path=/), anders **404** (ook voor niet-bestaande namen). Antwoord altijd `Cache-Control: private, no-store` + `Vary: Cookie` (nooit `immutable`). De cookie komt uit `/api/owner/tech/status|activeren` bij een actieve activering in dat tabblad; in `app.tech_asset_toegang` staat alleen de SHA-256, gekoppeld aan de activering (verloopt/stopt mee; 15 s cache). `beeindigen` en een status zonder geldige activering wissen hem.
- **Grens (bewust):** een cookie geldt per browser, niet per tabblad: een ander tabblad van dezelfde browser en gebruiker kan de bundel laden zolang de activering loopt. De beheer-API's blijven per tabblad gecontroleerd. Doel: wie geen technisch profiel heeft of niet aangemeld is, krijgt de beheercode niet.
- **Service achtergrondproces:** `/assets/tech/` wordt nooit onderschept of gecachet (één regel; `VERSION` niet verhoogd — dat doet A bij de volgende versie).
- **Frontend:** `src/tech/tech-bundel.tsx` → `lazyTech()` (bij 404: status vernieuwen → nieuwe cookie als de activering hier nog loopt → één keer opnieuw) en `TechBundelGrens` (melding «Технічні модулі не завантажено … оновіть сторінку» i.p.v. witte pagina). Gebruikt voor AdminConsoleView, Terminal, Vlaggen, SSH, Віддалений стіл. `preloadCurrentView` laadt de beheerbundel niet meer vooraf (dat zou nu 404 geven). **Nieuwe beheerpagina's: laden via `lazyTech`** (de eenheidstest controleert dat).

### G2 — «Сервер (для всіх) / Цей обліковий запис»
- **Zuiver** (`shared/diagnostiek-account.ts`): 7 diensten (Пошта, Календар, Drive, GitHub, ШІ, Пристрої, Мої налаштування), koppeling dienst → servercontroles, beoordeling uit feiten (alleen tellingen/ja-nee), conclusie `server` (iedereen) / `account` (alleen dit account) / `beide`, advies uk/nl per code.
- **Backend** (`backend/diagnostiek-account.ts`, routes in `backend/admin-diagnostiek.ts`): Google-status per dienst + bij «Перевірити» of Google een toegangstoken uitgeeft (token nooit bewaard/teruggegeven; Google-foutteksten worden nooit een code), postvakken, wachtrij, GitHub gekoppeld (niet welke sleutel), AI-koppelingen, apparaten, accountstatus. Opslag `app.diagnostiek_account_uitslagen` (30 d). `POST /api/owner/admin/diagnostiek/account` (eigenaar of `diagnose.lezen`; eigen account of `gebruikerId`; beide kolommen; audit `diag.account.bekeken|uitgevoerd`). `POST /api/owner/diagnostiek/mijn-diensten` (iedere goedgekeurde gebruiker; ALLEEN eigen account, `gebruikerId` genegeerd, geen serverkolom; 10/10 min; audit `diag.account.zelf`).
- **Planning:** serverronde elke 15 min (`cron.json` «diagnostiek-server» → `diagnostiekServerCron` → dezelfde `serverRonde` als de knop; `deploy/mijn-ruimte-diagnostiek-server.timer`, in `TIMERS` van `installeer-app.sh`). Account: op verzoek, met geschiedenis.
- **UI:** Діагностика → tab «Для всіх / цей обліковий запис» (eigen account) en dezelfde tabel bij «Скарга користувача» (gekozen gebruiker). Налаштування → Обліковий запис → «Стан моїх служб» (kolom «Мій обліковий запис» + advies). Op ≤ 560 px worden rijen kaarten (390 px zonder horizontaal scrollen); kleuren uit het thema.

### Tests
- `tests/eenheid/tech-assets.test.ts` 34/34: indeling, bouwcontrole (goed/slecht/leeg), SW, frontend-aansluiting (alle tech-imports via `lazyTech`), en de ECHTE server tegen PG: zonder sessie 404, verzonnen sleutel 404, sessie zonder tech 404, actieve activering 200 met `private, no-store` + `Vary: Cookie`, alleen hash in DB, geen nieuwe sleutel per status, ander tabblad wist niets, na beëindigen/verlopen 404, cookie gewist.
- `tests/eenheid/diagnostiek-account.test.ts` 46/46: beoordeling, tabel «server ok / account niet» → «account», nagebootste bronnen (token geweigerd, GitHub-fout), gegevensbescherming (geen token/adres/Google-tekst in DB, antwoord, logboek), rechten via de echte routes (gebruiker alleen zichzelf, geen serverkolom; beheerroute geweigerd; eigenaar beide kolommen), cron/timer/bedrading.
- `tests/e2e/tech-assets.e2e.ts` 13/13 (Chromium, lokale build): mail + hub zonder tech vragen niets onder `/assets/tech/`; zelf ophalen 404; admin zonder tech = poort; met tech 200 + juiste koppen; na uitzetten 404; «Стан моїх служб» op 390 px. Bestaand groen: admin-diagnostiek 94, tech-profiel 36, tech-sessies 18, routes, menu-snelheid, nieuwe-versie, beheer-journaal.
- **Uitrol:** migratie 0070 loopt automatisch; de nieuwe timer installeert `installeer-app.sh`. Na uitrol eenmalig in een tech-tabblad «Оновити сторінку» (de oude beheerbundel stond onder `assets/`).

## F — SSH-CA «aan te zetten vanaf de site» + verplichte «?» uit één register (migratie 0069)

**SSH-сертифікати (kaart in het technisch profiel, `src/ssh/SshBeheer.tsx`, vervangt het losse venster).**
- Stand (root schrijft `/var/lib/mijn-ruimte/ssh-ca-uit/beheer-status.json`): CA-sleutel ja/nee, sshd vertrouwt de CA (effectieve
  `TrustedUserCAKeys` uit `sshd -T`), KRL actief, schakelaar, Include aanwezig.
- «Підготувати» en «Увімкнути»: passkey, die **root zelf** controleert (`mijn-ruimte-passkey verifieer-ssh-ca <bestand> <actie>`,
  doel `ssh-ca`, actie in de challenge, nonce eenmalig; nieuw in `deploy/goedkeuring/webauthn-kern.mjs` + `goedkeur-hulp.mjs`).
  «Вимкнути», «Прибрати довіру sshd» en intrekken nemen alleen rechten weg: zonder root-passkey (site vraagt wel stap-op).
- Root-kant: `mijn-ruimte-ssh-ca beheer|status` (nieuw in `deploy/ssh-ca/mijn-ruimte-ssh-ca.sh`), unit
  `deploy/mijn-ruimte-ssh-ca-beheer.service` (polkit: alleen `start`, regel toegevoegd in `deploy/opdracht/50-mijn-ruimte-opdracht.rules`),
  inbox `/srv/mijn-ruimte/ssh-ca-beheer` (installer: `ssh_ca_inrichten`). Geen shell van de site; inbox, verplaatsen en opruimen in Python.
- sshd: `sshd_config` wordt nooit herschreven; alleen `/etc/ssh/sshd_config.d/50-mijn-ruimte-ssh-ca.conf` (TrustedUserCAKeys, RevokedKeys,
  AuthorizedPrincipalsFile). Zonder Include → `SSH_CA_SSHD_GEEN_INCLUDE`. `sshd -t` vóór `systemctl reload ssh`; bij een fout of mislukt
  herladen terug naar de vorige drop-in (`SSH_CA_SSHD_ONGELDIG` / `SSH_CA_SSHD_HERLADEN`).
- Uitgifte 5–60 min (`-V -5m:+Nm`), principals per rol (`SSH_CA_PRINCIPALS_PER_ROL`, alleen eigenaar → `beheer`) ∩ root-lijst
  `/etc/mijn-ruimte/ssh-ca/toegestaan.json`; serienummer `-z` voor de KRL. Lijst in `app.ssh_ca_certificaten` (0069: serie, door, wanneer,
  tot, principals, ingetrokken; geen certificaat). Intrekken: `ssh-keygen -k` op `/etc/mijn-ruimte/ssh-ca/krl`, sshd weigert meteen.
- Routes (`backend/ssh-ca-beheer.ts`, `backend/ssh-ca-routes.ts`): `/api/ssh-ca/{stand,lijst,beheer/uitdaging,beheer,intrekken}` —
  eigenaar + `ssh.host` in dit tabblad + stap-op; `/api/ssh-ca/` staat in `AGENT_VERBODEN`. Journaal `owner.ssh-ca.*` (etiketten in
  `shared/beheer-journaal.ts`).
- 0069 verbreedt ook `goedkeur_uitdagingen_doel_check` met `'ssh-ca'`. Wie later die CONTROLE opnieuw zet, moet `'ssh-ca'` meenemen.

**Na installatie (eigenaar):** technisch profiel → «SSH-сертифікати» (vlag `ssh-certificaat` toont de knop) → «Підготувати» (passkey)
→ «Увімкнути» (passkey). Vereist: `Include /etc/ssh/sshd_config.d/*.conf` in `sshd_config` (Debian/Ubuntu standaard) en een passkey in
`/etc/mijn-ruimte/goedkeur-passkeys.json`.

**«?» verplicht (`shared/hulp-register.ts`, `src/hulp/HulpVraag.tsx`).** Eén register met lagen wat/gevolg/risico/dev (uk/nl) + bron.
`tests/eenheid/hulp-register.test.ts` faalt met de lijst van wat ontbreekt: elk `<select>`, checkbox, radio en `role=switch` in de mappen
van het technisch profiel en het beheer moet `data-hulp='<sleutel>'` hebben (of `data-hulp-vrij='filter|sortering|keuze'`), de sleutel moet
volledig in het register staan en in hetzelfde bestand moet `<HulpVraag k='<sleutel>' />` staan; ook catalogi (rollen, root-schakelaars
uit de standaard `mcp-rechten.json` van de installer, beveiligingsschakelaars 0066, SSH-CA). «Для розробників» is nu ingeklapt
(`<details>` in `src/tech/Vraag.tsx`) en toont sleutel en bestand. Nieuwe optie → item toevoegen in het register (of `hulpRegistreren`).

Tests: `ssh-ca-beheer` (echte sshd, echte passkey-hulp, ssh-keygen/KRL; 34), `ssh-ca-site` (rechten 403, passkey, routes, 0069; 40),
`ssh-ca` (33), `hulp-register` (17); harness `/tmp/h-F2` (52 controles: 1280/390, licht/donker, uk/nl).

## N — Meldingen: gebruiker los van beheer; paneel in de technische band; geluid/pop-up per type (geen migratie)

Verzoek eigenaar: «панель Сповіщення має бути розділена для користувача від адмін сповіщень … лише одна графа … можна обеззвучити,
вимкнути спливні сповіщення для будь-якого типу».

- **Eén classificatie** (`shared/melding-typen.ts` + `shared/melding-soorten.ts`): elke soort (kind) → type (10 persoonlijk, 13 technisch),
  ernst (kritiek/belangrijk/info) en voor technische soorten de vereiste mogelijkheid (`users.manage`, `diagnose.lezen`, `journaal.lezen`,
  `uitrol.voorbereiden`, `diensten.beheren`, `impersonatie.aanvragen`, …). `shared/meldingen-ruimte.ts` gebruikt die tabel; link-regel
  (admin./api./beheerpagina) blijft. Nieuw/hernoemd: `impersonatie.beheerder` (antwoord van de gebruiker aan de beheerder; was
  `impersonatie` en stond in de gewone bel), `uitrol.mislukt` (mislukte of zonder uitkomst afgesloten installatie → melding aan wie
  goedkeurde, `backend/uitrol-goedkeuring.ts` → `meldMislukt`). `beveiliging.zekering` is nu technisch (stond vroeger in de gewone bel).
- **Server filtert** (`backend/index.ts`): `meldingOntvanger(user)` (eigenaar → alles; technisch profiel niet ingetrokken → de mogelijkheden
  van zijn rollen; fout → niets technisch). `siteNotificationOverview` levert technische meldingen alleen aan wie ze aangaan; de teller telt
  ze ook niet voor anderen; `POST /api/owner/notifications/read` markeert alleen wat de ontvanger mag zien.
- **Gewone bel** (`src/CanonicalNotificationCenter.tsx`): alleen persoonlijke meldingen + één regel «У технічній панелі N нових
  сповіщень» (alleen met technisch profiel). Klik: actief → paneel in de band; niet actief → venster «Увімкнути технічний профіль», daarna
  opent het paneel vanzelf (sessionStorage `mr-tech-na-activeren`, 10 min geldig).
- **Paneel in de band** (`src/meldingen/TechMeldingen.tsx`, knop met teller in `TechLaag`): filters type / важливість / прочитані,
  «Позначити все прочитаним», links naar admin. Bron: `src/meldingen/tech-meldingen-store.ts` (CanonicalChrome → TechLaag-root).
- **Per type** (bel → «Типи сповіщень», `src/meldingen/MeldingVoorkeurenPaneel.tsx`): звук / спливає / видно, ook technische types voor
  wie een profiel heeft. Opslag: `sidebar.meldingen.soorten` (owner_ui_preferences_v1 via `/api/owner/ui/sidebar/save`, localStorage
  alleen cache) — oude opslag zonder `soorten` = alles aan. Kritiek (`beveiliging`, `inzage`, `tech.uitrol-mislukt`, `tech.bescherming`):
  geluid en pop-up mogen uit, verbergen niet (UI uitgeschakeld + uitleg; normalisatie dwingt `tonen: true`). Nieuwe servermeldingen
  krijgen nu ook een pop-up met de titel (als het type dat toestaat); geluid alleen als het type geluid mag.

Tests: `melding-soorten` (50: scanner van alle `notify()/meld()`-soorten in backend/ → 23 gevonden, alle in de tabel; echte DB:
gewoon account / auditor / ingetrokken profiel), `menu-meldingen` 40, `notice-dedupe` 6, `notification-position` 5, `ai-ruimte` 16,
`vast-kader` 22, `hulp-register` 17. Harness `/tmp/h-N` (126 controles: bel + regel, paneel in de band met filters, voorkeuren met
echt geteld geluid/pop-up, activeren en terug, zonder profiel; uk/nl, licht/donker, 1280/390).

## T · Technisch profiel over tabbladen, lijst «⋯», extensie 0.4.2 (18.10.2026)

**1. Profiel valt niet meer weg in een nieuw tabblad** (migratie **0071** `tech_activatie_erven`: `ouder_id`, `herkomst` eigen/geerfd/gedeeld).
- Open activering («до виходу з облікового запису/профілю») = hele browsersessie: elk tabblad van dezelfde ankersessie krijgt bij zijn eerste
  `/api/owner/tech/status` een eigen kopie (`ervenOpen`, zonder stap-op, logboek `owner.tech.geerfd` «успадковано вкладкою»). Andere
  sessie/browser: nooit. Een tabblad waarvan de eigen activering ná het begin van de open activering eindigde, erft niet stil opnieuw.
- Op tijd = eigen tabblad. Nieuw tabblad geopend vanuit een technisch tabblad (link in nieuw tabblad, middelklik, `window.open`): eenmalig
  kaartje (localStorage, 15 s) → BroadcastChannel `mr-tech` → het BRON-tabblad roept `POST /api/owner/tech/delen` (zelfde sessie, doel
  nieuw, zelfde einde; `owner.tech.gedeeld`). Verlopen = alleen die rij.
- «Вийти з технічного профілю» in elk tabblad → alle rijen van de sessie (`beeindigen(u, tab, sessie)`, logboek `via: ander tabblad`);
  andere tabbladen meteen via `mr-tech` (`aan`/`uit`), andere subdomeinen bij zichtbaar worden / minuutcontrole. Uitloggen/revoke: zoals
  0060 (per `sessie_id`, kopieën inbegrepen). Bron schakelt open → op tijd: kopieën eindigen (`vervangen`).
- Tekst in «Увімкнути»: legt beide modi uit. Agents (`/api/owner/tech/*`) blijven geblokkeerd (agent-namens).

**2. Lijst «⋯» van de band** (TechLaag/tech.css, puntwijzigingen): groepen Розділи / Інструменти / Люди й підтримка / Цей сеанс met kop,
korte uitleg per knop, zoekveld (focus bij openen), ↑/↓/Home/End/Enter, Esc → focus terug op «⋯», huidige plek gemarkeerd
(`aria-current`), raakvlak 44 px; brede band (data-pas 0–2) ongewijzigd. Eigen fout gevonden en opgelost: elke meting
(ResizeObserver) sloot de lijst op de telefoon meteen weer — sluiten nu alleen als «⋯» echt verborgen is.

**3. Extensie 0.4.2** (MIN blijft 0.4.0). Oorzaak «активація в налаштуваннях не працює»: opties openen in een tabblad
(`open_in_tab`), `ownPage` eiste `!sender.tab` → `set-diag`/`self-test` geweigerd (schakelaar sprong terug, «Тест» brak). Nu: eigen
id + `chrome-extension://<id>/`-adres (content scripts blijven geweigerd); opties melden mislukken. Site: `mcpIngang(…, extensie)`
laat `agents#extension` / `?extension=welcome|update` staan; met profiel-uit toont `ExtensieTechAanbod` «Увімкнути технічний профіль
(і під'єднати)» → activeervenster (stap-op), zelfde pagina; daarna koppelt/zet de installatiehulp zelf aan (eenmalig, `mr.ext.doorgaan`).
Zonder technisch profiel: zoals vroeger naar ai.*/verbindingen. Popup: «Увімкнути технічний профіль і під'єднати». Pakket opnieuw bouwen
(`scripts/build-extension.mjs`) bij de volgende uitrol.

Tests: nieuw `tech-tabbladen` 31 (echte routes + PG), `extensie-opties` 22 (echte background.js met nep-chrome; oud gedrag nagebootst);
`tech-profiel` 36, `tech-sessies` 18, `browser-extensie` 21, `extensie-toestand` 14, `ui-audit-g` 42, `ai-agent-bord` 20, `impersonatie` 71
(regex aangepast aan de lijst) en 20 andere raakvlak-tests groen. Harness `/tmp/h-T` 43/43: twee tabbladen (erven 0,01 s, verlaten in B →
A en C uit < 0,2 s), op tijd + tabblad vanuit A (zelfde einde), lijst 390 px licht/donker, welkomstpagina, options.html met uitgepakte
extensie in echte Chromium (oud gedrag: schakelaar springt terug). Lokaal toegepast: 0071.

## Pakket uit git (geen «zonder-git»-waarschuwing meer)
- Vanaf dit pakket wordt gebouwd met `deploy/uitrol/maak-voorstelpakket.sh` → `git archive` van een echte commit; `BRON-COMMIT` is die commit (40 hex). De voorcontrole toont «Коміт … — випуск відтворюваний з git».
- Bij het pakket hoort `mijn-ruimte-<versie>.bundle` (git bundle): de geschiedenis van de geïnstalleerde pakketten als commits met tags (`pakket-20261017-221747` … `pakket-20261018-153026`) plus de nieuwe commit. Importeren in de eigen repository:
  `git fetch /pad/mijn-ruimte-<versie>.bundle 'refs/heads/main:refs/heads/claude/<versie>' 'refs/tags/*:refs/tags/*'` en daarna naar GitHub pushen.
- Reproduceerbaar: dezelfde commit + dezelfde versie/metadata geven bit voor bit hetzelfde archief (dubbel gebouwd: identieke sha256). Gecontroleerd: het archief bouwt (`npm run build`) zonder bestanden van buiten git.
- `.gitignore` aangevuld: testhulpmiddelen (`harness/`, `harness-*.config.*`, `tsconfig.?-*.json`) en de pakketmetadata (`UITROL-VERSIE`, `AUTEUR`, `AGENT`, `SAMENVATTING`) — die komen als virtuele bestanden uit het script, nooit uit de boom.
- Typecontrole van de server (`tsc -p tsconfig.server.json`) is voor het eerst schoon (was 41 fouten, alle al vóór deze wijzigingen: dubbele `Eigenaar` in uitrol-goedkeuring.ts, `as const`-routes in beheer-journaal-routes.ts).

## X · Extensie 0.5.0: standaard vergrendeld, ontgrendelen met passkey, AI-brug, verzamelaar (migratie 0072)

**Kernregel.** Zonder een door de server ondertekende ontgrendeling voert de extensie geen enkele opdracht van een AI uit en verzamelt ze niets
(console, netwerk, DOM, archief). Ontgrendelen kan alleen op de site (mcp.*/agents#extension, ook via `?ontgrendelen=1`):
ingelogd → technisch profiel met **lopende activering** in dit tabblad → assertie (UV) van een **eigen passkey** van dit account.
Zonder profiel/activering/passkey: knop uit + uitleg + actie (`WEIGER_UITLEG` in `shared/extensie-ontgrendeling.ts`).

**Keten (wie controleert wat).**
1. Site → `POST /api/owner/agents/ontgrendeling/uitdaging` (sessie + tabcontext): server toetst tech-recht, rollen → caps (`CAPS_PER_ROL`),
   duur ≤ einde activering (max 480 min), domeinen ⊂ eigen hosts (exact, zonder poort/userinfo) → challenge gebonden aan agentId, caps, domeinen,
   eind, nonce, activering, sessie (eenmalig, ≤ 5 min).
2. Browser → `navigator.credentials.get` (UV verplicht) → `POST …/ontgrendeling`: server controleert met de eigen passkey (rpIdHash, origin = alleen
   de dienst van de sessie, signCount) → rij in `app.extensie_ontgrendelingen` (vorige van die agent ingetrokken) → push over de bestaande WSS
   `{t:'ontgrendeling', grant, sig}` met `sig = HMAC-SHA256(opdrachtsleutel van de koppeling, ontgrendelTekst(grant))`.
3. Extensie (`extension/shared.js` `verifyOntgrendeling`): handtekening (constante tijd), eigen agentId/userId, tijd (ook t.o.v. ontvangstmoment),
   duur, caps, domeinen; bewaard in `chrome.storage.session` (TRUSTED_CONTEXTS; weg bij herstart van de browser). Ingetrokken gids en oudere grants
   worden nooit opnieuw aanvaard.
4. Elke opdracht: bekend type → HMAC per opdracht (bestaand) → ontgrendeling geldig → cap ∈ grant ∩ instellingen → `valideerOpdracht` (schema per type,
   onbekende sleutels/`__proto__`/control- en bidi-tekens/te lang = weigeren) → host ∈ domeinen (ook ná navigatie) → accountclaim van het tabblad → uitvoeren.
   De server dwingt hetzelfde af vóór verzenden (`dispatchCommand`: `EXTENSIE_VERGRENDELD` / `EXTENSIE_CAP`), alleen voor browseragenten.
5. Einde: duur voorbij, einde/vervanging van de technische activering, uitloggen, noodstop, intrekken op de site («Відкликати зараз»), in de pop-up,
   het zijpaneel of de opties (wachtrij tot de server bevestigt), herverbinden zonder actieve rij (server stuurt `vergrendel` zonder gid).

**Status altijd actueel zonder herladen.** Extensie duwt bij elke wijziging de publieke status naar eigen pagina's en naar open tabbladen
(bridge → `window.postMessage`, alleen whitelist-velden, nooit sleutels/tokens); de site combineert dat met `GET /api/owner/agents/extensie-status`
(elke 5 s zolang zichtbaar) — `src/extensie/extensie-live.ts`. Staten: «Не під'єднано до сайту», «Очікування Passkey», «Доступ відкрито»,
«ШІ-агент під'єднано» (AI-opdracht in de laatste 120 s of lokale agent verbonden). Ook als regel in het «⋯»-menu van de technische band.

**Verzamelaar (alleen ontgrendeld én host ∈ domeinen).** Netwerk via `chrome.webRequest` (methode, pad zonder zoekopdracht, status, ms, type; nooit headers
of bodies); console/uitzonderingen/LCP/CLS/long tasks via collector.js (passief tot de brug hem aanzet); DOM/prestaties/beveiliging via de nieuwe
opdracht `browser.audit` (MCP-tool `browser_audit`): bevindingen als FORM_HTTP_ACTIE, SCRIPT_ZONDER_SRI_EXTERN, TARGET_BLANK_ZONDER_NOOPENER,
INLINE_HANDLERS, IFRAME_ZONDER_SANDBOX_EXTERN, MIXED_CONTENT, CSP_UNSAFE_INLINE… Nooit veldwaarden, cookies, opslag of querystrings.

**Lokale AI-agent (optioneel, alleen lezen).** Native Messaging-host `com.tarasevych.mijnruimte` (`deploy/extensie-native/`, download
`/downloads/mijn-ruimte-extensie-native.zip`) + MCP-server voor Claude Desktop/Code. Werkt alleen met optionele permissie `nativeMessaging`, een
ontgrendeling met «локальний агент» aangevinkt, en 6 leesopdrachten. Host ↔ MCP: wederzijdse HMAC over nonces met een token (0600) dat bij elke
start nieuw is; `allowed_origins` exact het extensie-id.

**Manifest 0.5.0.** `storage, alarms, scripting, activeTab, sidePanel, webRequest`; optioneel `debugger` (diepe diagnose, gevraagd in de opties) en
`nativeMessaging`; `host_permissions` alleen `https://*.tarasevych.com/*`; CSP `script-src 'self'; object-src 'none'; base-uri 'none'`; `key` = publieke
CRX-sleutel → ook «Load unpacked» heeft id `ofpffonakgjioahgfejmiblfmbkobmmi`. agentToken en opdrachtsleutel staan nu in IndexedDB van de extensie
(niet meer in `storage.local`).

**Gevolg.** Ook in de privéruimte voert de browser niets meer uit zonder ontgrendeling door een account met technisch profiel.

**Plan en verdeling (parallel).** A: background.js, shared.js, manifest · B: bridge.js, collector.js · C: pop-up, zijpaneel, opties · D: server
(0072, routes, gateway, afdwinging, `browser_audit`) · E: site (ontgrendelblok, live status, toestandsmachine, band) · F: Native Messaging · daarna
onafhankelijke securityreview (9 bevindingen, alle gerepareerd met test) en een end-to-end-proef in echte Chromium met nep-server (70/70; vond en
repareerde: accountclaim na het wekken van de service achtergrondproces).

**Tests.** extensie-vergrendeling 108, extensie-validatie 11, extensie-verzamelaar 27, extensie-ui 67, extensie-native 56, extensie-ontgrendeling 52,
extensie-ontgrendeling-crypto 12 (vaste testvector server = extensie), extensie-site 71, browser-extensie 21, browser-keten 41.

## Y · 19.10.2026 — extensie 0.6 met twee profielen, hub «Під'єднання ШІ», «Доступи», contacten, mobiele mail (migraties 0073, 0074)

**Waarom.** 0.5 maakte de extensie alleen-technisch: zonder tech-profiel verdween «Розширення браузера» van mcp.*/agents#apparaten/extensie.
Nu: één extensie, twee profielen; de aangemelde sessie op de site is de enige bron van gezag (pakket 20261018-184832 vervalt, nooit geïnstalleerd).

**Extensie 0.6.0 — twee sloten.** `prive` (koppeling in de accountruimte) en `technisch` (tweede koppeling, alleen te maken met lopende tech-activering). Elk slot:
eigen sleutels (IndexedDB), eigen WSS, eigen ondertekende ontgrendeling (v2, met `ruimte` in de tekst). Profiel van een tabblad komt van de site:
`<meta name="mjn-profiel" content="gebruiker|technisch">` (live bij activeren/beëindigen). Technisch slot werkt alleen op tabbladen met profiel technisch
(admin/mcp…, passkey zoals 0.5); prive slot alleen op eigen diensten (hub, mail, cloud, ai, id, github, huis, mcp — nooit admin.*), niet op een
technisch tabblad; buffers per slot gescheiden. UI: account + profiel van het actieve tabblad, kaart «Як користувач» en — alleen bij tech-recht —
«Технічний профіль»; wie tech-modus verlaat ziet meteen zijn gebruikersrechten, zonder prive-koppeling het aanbod «Додати доступ як користувач».
Prive ontgrendelen: `POST /api/owner/agents/ontgrendeling/prive` (1/7/30 dagen) met step-up van deze sessie (elke methode); rechten = de eigen
AI-toestemmingen van die browser ∩ beleid. AI-verbindingen: browser-tools volgen de ruimte van het apparaat — een prive-verbinding bedient alleen het
prive-slot, een technische alleen het technische (nooit kruislings).

**Beleid en beheer (0073).** `app.extensie_beleid` per gebruiker (prive/technisch aan, caps per ruimte, max dagen/minuten, lokaal). Routes
`/api/owner/agents/extensie-beheer` (+ `/beleid`, `/intrekken`, `/verlengen`) voor eigenaar of activering met users.manage; eigenaar onaantastbaar
voor anderen; nieuw beleid trekt wat erbuiten valt meteen in; melding aan de gebruiker; alles in audit.

**Hub «Під'єднання ШІ» (mcp.*/agents).** Tabbladen Огляд · Конектори · Під'єднані ШІ · Розширення браузера · Пристрої · Токени · Доступи ·
Технічне (alleen tech-modus) · Журнал. Oude adressen (#apparaten/extensie, #extension, mcp.*/verbindingen, ai.*/verbindingen) leiden hierheen;
niets verwijderd. Огляд: matrix «Що через який спосіб» uit echte gegevens. Доступи: «Мої доступи» (alles wat ik gaf, per methode: intrekken,
verlengen, beperken) en voor beheerders in tech-modus «Усі користувачі» (beleid, intrekken, verlengen).

**Contacten en afzenders (0074).** Пошта → «Контакти й відправники»: alle adressen uit alle mailboxen en mappen (ook «ви писали»), per adres status,
vertrouwen en «чому» met bronnen: Authentication-Results (DKIM aligned, SPF, DMARC, ARC), DNS van het domein (MX, SPF, DMARC-policy, BIMI/VMC),
lijst officiële domeinen (banken NL/UA, overheid, betaal- en techdiensten), imitatie (lookalike, homoglief, gemengd schrift). Volledige controle start
vanzelf bij het eerste openen van de mail, hervatbaar, Пауза/Зупинити, daarna incrementeel. Alleen metadata; logboek zonder adressen.

**Mobiele mail.** Brede HTML-mail wordt binnen zijn kader passend geschaald (knop «Оригінальний розмір» → alleen het kader scrolt); globale
`footer`-regel lekte in bijlagekaarten; werkbank/voorbeeldvenster schermvullend met safe-area en 44 px doelen; PDF-balk wikkelt; donker thema:
mail op wit papier, rond PDF themakleur, ШІ-balk volgt het site-thema. Echte Chromium 320–414/1280 px: elementen buiten beeld 150 → 0, max.
overloop 472 → 0 px, doelen < 44 px 294 → 0.

**Tests (volledige set).** 4365/4378; de 13 die falen zijn dezelfde als altijd (geen app-rol in de testomgeving). Nieuw o.a.: extensie-profielen 42,
extensie-vergrendeling 114, extensie-ontgrendeling 80, -crypto 19 (v2-vector server = extensie), extensie-beheer 31, ai-hub 42, ai-toegang-beheer 59,
mail-contacten 70, mobiel-mail 27. Echte Chromium: extensie e2e 41/41, hub 76/76, «Доступи» (320–1280), contacten 53/53, mobiele mail 150 metingen.

## Z · 19.10.2026 — live-audit (eigenaar + nieuwe gebruiker) en reparaties (geen nieuwe migratie)

**Methode.** Crawl van alle 10 subdomeinen in de Chrome van de eigenaar (technisch profiel), daarna extensie, noodstop, journaal, «Захист», en een
tweede account (Google) als Учасник via «Додати інший обліковий запис». 5 crawlers + 2 gebruikerscrawlers + 6 reparatieagenten. Details: scratchpad/audit/*.

**Kritiek, gerepareerd.** Mail: iframe-hoogtelus (mail-body-passend: offsetHeight i.p.v. scrollHeight, frame niet observeren); bijlagevoorbeeld onder het
iframe + Esc; bijlagekaarten zonder naam; contacten-melding onder de zijbalk; scan vals «Бракує дозволу Gmail» bij 502 (gmailFoutVan); vals «Підозрілий»
voor subdomein van hetzelfde organisatiedomein; «Відкрити листи від нього» zonder filter; «Зняти позначку»; NL-codes in historie; gesprek zonder laatste
antwoord; Drive-zoeken per woord; cloud-viewer onder zijbalk. Gebruiker: Пошта → Облікові записи deed niets (MailAccountsHub zonder onConnect) → Google-OAuth
start; «Сесія закінчилася» voor Учасник op mcp.* → nieuwe code API_RECHT_VEREIST met uitleg, geen polling, geen «Стоп»; entitlement «Доступ до ШІ-мосту»
nu in admin/access; welkomstkaart «Що далі» na goedkeuring; wachtend account ziet alleen het modaal; extensie «прив'язане до іншого облікового запису»-kaart;
accountwissel beëindigt het tech-profiel van het vorige account. Noodstop «Стоп» trekt nu ook alle MCP-connectorverbindingen en tokens in (vroeger
bleven Claude-tools in beide ruimtes werken). Admin-journaal toonde alleen service='admin' (sessieveld als filter) → filterveld `dienst`.

**Hoog, gerepareerd.** Tech-band verdween bij 5xx (tech-store reset alleen bij 401/403/404); extensie-status 403-spam op alle diensten; polling-storm hub
(één poller, 10 s); #extensie dubbele wizard en tegenstrijdige termijnen; zelftest-verdict; tellers/matrix uit echte gegevens; «Усі користувачі» voor eigenaar;
journaalvertalingen; /Grok → /mcp; board-knoppen; ai.* eigen inhoud; 404-pagina op alle diensten; /recent en /notes echte inhoud; hub-dialogen Esc/focus;
sessiekaarten; sticky HTTP_530-banner; healthcheck Host-header; audit-filter niet onthouden; «до 31.12.99» → «до відкликання»; api.* dode tabs weg;
«Увімкнути» zonder reden geeft nu een melding; wizard-toast na intrekken; schakelaar-contrast; «Причина:» in de band; opruimknop voor 37 dode koppelingen.

**Niet gerepareerd / beslissing eigenaar.** Of Учасник standaard AI-connectors/extensie (prive) mag: nu alleen met entitlement «api-platform» (toggle in
admin/access). Inschakelen van Шлюз/OPA/RLS op de live server (RLS: 343 schaduwweigeringen in mail state-bulk → eerst die routes). GitHub-PAT ontbreekt in
de kluis (alle github.*-tabs leeg). tarasevych.com/www zonder DNS. CRX 0.6 niet ondertekend. Popup/zijpaneel/opties en SW-herstart van de extensie alleen in
testchromium bewezen, niet in de Chrome van de eigenaar.

**Tests.** 4572/4586 (145 sets); 13 vallen alleen zonder app-rol in de testomgeving, 1 (ssh-ca-site) door migratievolgorde in de gedeelde test-DB.

## AA · 19.10.2026 — 17 punten van de eigenaar (migratie 0075; extensie 0.6.1)

Uitgevoerd in parallelle sporen; elk punt heeft een eigen eenheidstest. Volgorde = de lijst van de eigenaar.

**1. «Хрестики» naast «Огляд» (admin.*/updates).** Bewezen in de Chrome van de eigenaar: `src/AdminUitrolView.tsx` rendert
`<div class="admin-uitrol ut-root">`, en de OUDE regel `.admin-uitrol button{display:inline-flex…}` (0,1,1) in `src/admin-uitrol.css` won van
`.ut-tabs-pijl{display:none}` (0,1,0). Daardoor stonden BEIDE schuifpijlen van de tabbalk zichtbaar op precies dezelfde plek (118,15,28×28) terwijl de
balk niet eens overliep (scrollWidth = clientWidth = 1320): «‹» over «›» = een kruisje in een rondje. Live bewezen door die ene regel te verwijderen —
computed display van beide pijlen werd `none` en het kruisje was weg. Reparatie: de oude knopstijl geldt alleen nog binnen de oude containers
(`:is(.admin-uitrol-knoppen,.admin-uitrol-lijst,.admin-uitrol-form,.admin-uitrol-voorstel,.admin-uitrol-intrek)`) en de pijlregel kreeg twee klassen
(`.ut-tabs-wrap .ut-tabs-pijl`), zodat geen enkele paginabrede knopregel hem ooit nog kan aanzetten. Test `ut-tabs-pijlen-20261019` (9/9) bewaakt beide kanten.

**2 + 17. Menu, snelle toegang, volgorde en kleur — per gebruiker.** Echte fout gevonden: de browsercache van de menu-indeling lag onder één sleutel
`tsv-zijbalk-v2`, zonder account. Met twee accounts in dezelfde browser zag een nieuw account de indeling van het vorige, en een wijziging schreef die
indeling onder de NIEUWE gebruiker naar de server. Nu `tsv-zijbalk-v2:<scope>` (bereik synchroon uit de bootstrap, vóór de bootstrap uit sessionStorage per
tabblad); uitgestelde opslagacties worden bij accountwissel geannuleerd en vóór verzending nogmaals op bereik gecontroleerd. Zelfde behandeling voor
`mr-weergave-modus-v1` en `mr.notif.group`. Nieuw: kleur per menupunt (`ItemOverride.kleur`/`ItemKopie.kleur` uit `ACCENTEN`), zichtbaar in de snelbalk én in
de ingeklapte zijbalk (kleurstip), in beide icoonstijlen; het al bestaande maar nooit gebruikte veld `icoon` werkt nu echt. Nieuw `src/SnelleToegangEditor.tsx`:
toevoegen, weghalen, volgorde met knoppen en toetsenbord, icoon, kleur, «terug naar standaard» — bereikbaar uit het «⋯»-menu van de balk en uit
Налаштування → Меню (op de telefoon alleen daar, want slepen is daar onhandig).

**3. Foutmeldingen zonder houvast.** «Сервер тимчасово недоступний — імовірно, встановлюється оновлення» was een gok. Eén bron van waarheid:
`shared/foutuitleg.ts` maakt uit code/HTTP-status + dienst + route + tijd + pogingnummer een concrete tekst; onbekende code → eerlijk «причина невідома»
met de ruwe code, nooit een verzonnen oorzaak. De plakkaat toont nu operatie, dienst, code, tijdstip, poging, en «Повторити» / «Відкрити журнал» /
«Деталі» met één knop «alles kopiëren». Over een installatie wordt alleen gesproken als `POST /api/owner/uitrol/live` dat bevestigt (versie + stap).

**4. Strikte scheiding gebruiker ↔ technisch.** Menu, volgorde, snelle toegang, iconen en kleuren zijn nu per RUIMTE opgeslagen
(`ZijbalkRuimtes{gebruiker,technisch}`, oude waarde leest als `gebruiker`). De server dwingt het af, niet alleen de browser: `ruimte:'technisch'` mag
alleen bij een lopende activering van het technisch profiel in dat tabblad (`techActieveActivatie`), anders 403 `TECH_PROFIEL_VEREIST` — ook voor
beheerders en de eigenaar; de bootstrap geeft uitsluitend de gebruikersindeling mee. Welke diensten überhaupt in een profiel mogen staan blijft
`dienstToegestaan` (geen nieuwe regels bedacht).

**5. Twee grote «enge» knoppen.** «Поділитися» en «Налаштувати поверхню» stonden als grote kaders onderaan de zijbalk (onder «Персоналізація»). Ze zijn
gewone regels in het «⋯»-menu van de sectiekop geworden; in de zijbalk blijft alleen de werkruimtekeuze, en alleen als er meer dan één is.

**6. github.*/accounts — koppelkaart.** Echte koppelkaart met logo uit het merkregister, status uit de server («niet gekoppeld / @gebruiker / token
verlopen / door GitHub geweigerd»), rechtenlijst, veld **Server-URL** (`https://api.githubcopilot.com/mcp/x/all`) met kopiëren en https-validatie, en
«Під'єднати» dat naar de kluis leidt — de enige weg die de server echt heeft. OAuth, GitHub App en de externe MCP-server staan er eerlijk bij als «nog
niet gebouwd», zonder knop. Nieuw: `POST /api/owner/github/koppeling` (geeft nooit het token terug).

**7 + 8. Extensie 0.6.1.** Oorzaak van «Chrome не надав дозвіл налагоджувача» gevonden: Chrome accepteert `debugger` niet als optioneel recht — het
verzoek kon dus nooit slagen, ongeacht de klik. Nu: verzoek strikt vanuit een klik in popup/zijpaneel/opties, vijf onderscheiden toestanden met uitleg, en
een tweede pakket `mijn-ruimte-extension-diagnose.zip` (zelfde id en sleutel, `debugger` in `permissions`) als de echte weg om CDP aan te zetten. De
beveiliging ging strenger, niet losser: `debuggerToegestaan()` eist tegelijk Chrome-recht + opt-in + slot `technisch` + geldige ondertekende ontgrendeling
met `browser.debug` + host in `ADMIN_HOSTS_TOEGESTAAN` ∩ de domeinen van de grant. Zichtbare markering van een actieve verbinding: dunne rand in de kleur
van het profiel (gebruiker groen, technisch amber) in een gesloten shadow DOM, badge en tooltip op het extensiepictogram, en een korte flits wanneer de AI
echt iets doet (niet bij schermafbeeldingen) — weg zodra «Стоп», intrekking of verbreking komt. `prefers-reduced-motion` wordt gerespecteerd.

**9. Eén beeldbasis.** Er waren vier parallelle logobases plus een dode map: `src/agenten/logos.ts` (6), `src/sessies/merk-iconen.ts` (13),
een blok in `src/mcp-ui.tsx` (21) en `src/integraties/logos.ts` (137), én `public/agent-logos/` waar niemand naar verwees — daarom zag hetzelfde merk er
per pagina anders uit. Nu één register `src/merk/` (lazy tabel, 41 merken) waarop `AgentLogo`, `integraties/Logo`, `SessieIconen` en `mcp-ui.Logo` draaien;
de dubbele bronnen zijn weg, 9 dubbele items uit de grote tabel verwijderd, en 15 ontbrekende emblemen bijgetekend (alle 157 catalogusitems hebben er nu
één). Netto −30,4 kB raw / ≈−10,6 kB gzip over de betrokken chunks; 21 getekende glyphs uit de hoofdbundel weg.

**10. /agenda — winkel voor agenda's.** Komende afspraken uit echte gegevens plus een winkel met zes aanbieders. Google Calendar staat op «beschikbaar,
alleen lezen» met erbij wat ontbreekt (de server vraagt `calendar.readonly`, er zijn alleen leesroutes); Microsoft/Outlook, CalDAV/iCloud, Proton, Fastmail
en ICS staan op «binnenkort» met de concrete reden. Tweerichtingskoppeling bestaat nergens op de server — dat is niet nagespeeld maar benoemd.

**11. Notities.** Soorten (tekst, checklist met aanvinkbare regels, code, link), kleur, vastzetten, zoeken op woorden, filter op soort en tags; catalogus
van externe apps (Behouden, Notion, Obsidian, Apple Notities, Markdown-import) met per stuk wat ontbreekt. Geen nieuwe tabel: soort/kleur/vast leven in de tags van
het borditem, binnen de grenzen die `backend/mcp-console.ts` al afdwingt.

**12. hub.*/overzicht als bureaublad.** Let op: `hub.tarasevych.com/overzicht` is het tabblad `overview` in `src/App.tsx`; `src/overzicht/` is het overzicht
van **admin**.tarasevych.com. Nieuw bureaublad met 12-koloms raster, slepen en formaat wijzigen met de bestaande vensterlaag (`src/platform/vensters.*`),
catalogus «+ Додати блок» met acht categorieën, toetsenbordbediening, en een indeling die PER GEBRUIKER op de server staat
(`POST /api/owner/hub/bureau/load|save`). Tegels die nog niet kunnen (GitHub, AI-rechten) staan in de catalogus met uitleg maar worden door de normalisatie
geweigerd — ze kunnen niet op het bureaublad terechtkomen, ook niet via de database.

**13. ai.* — echte beginpagina.** Wat dit onderdeel is, wat het in DIT account nu kan (recht, sleutel, model, gereedschappen — alles van de server),
een werkend chatvenster met stoppen, modelkeuze uit wat de server echt heeft en concrete foutredenen, 14 startvragen die alleen klikbaar zijn als het
benodigde gereedschap er is, en één scherm «alle gereedschappen» met status en directe links. Zonder recht `api-platform` volgt een uitleg in plaats van
«Сесія закінчилася». Eerlijk benoemd: de chat op ai.* heeft nog geen post-, agenda- of Drive-gereedschap (dat zit alleen in de MCP-connector).

**14. AI-knoppen in een geopend bericht.** Echte oorzaak: `.google-mail-reader` is een raster met twee rijen, en `MailReaderAi` was het derde kind — de
balk nam de flexibele rij en het bericht viel in een impliciete rij buiten `overflow:hidden`. Opgelost met `:has(> .mra)` plus reset van de inhoudsregel.
Elke knop draagt nu dezelfde klasse als de rest van de rij (44 px, radius 999, identieke maten staan nog maar op één plek) en heeft een icoon
(`Sparkles`, `TextQuote`, `CornerUpLeft`, …). Op ≤430 px alleen iconen.

**15. «Перевірка всіх адрес» (HTTP_502 bij 5 050 van ≈19 731).** `HTTP_502` werd door de browser zelf gemaakt (antwoord zonder foutcode) en stond niet in
de herhaallijst van de server, die alleen Gmail-codes kende → meteen «mislukt», en 5 050/50 = 101 pagina's, dus 101 klikken. Nu één herhaalladder voor elke
tijdelijke fout (`shared/mail-scan-beleid.ts`: 2→4→8→…→120 s, max 12 pogingen), met `poging` en `wacht_tot` in de database zodat «повторюю через N с, спроба
X» een herlaadactie overleeft; beleid «automatisch doorgaan / problematische overslaan / telkens vragen» per gebruiker; het venster is een echt
verplaatsbaar en opvouwbaar venster uit `src/platform/vensters.tsx` (op smalle schermen een strook met z-index 270 — de zijlade is 260, de scrim 250,
daarom lag 240 eronder). Doorgaan «vanaf het punt van stoppen» is echt: de cursor stond al in dezelfde transactie als de contactregels (bewezen in de test).

**16. Vertaalpaneel.** In `backend/ai-vertaling-routes.ts` stond `deterministicTranslateText()` met drie woordenlijstjes die bij een leeg modelantwoord
`[Переклад → УКР] <origineel>` IN de brieftekst zetten — dat waren de markers en dat was een imitatie. Verwijderd: onvertaalde stukken blijven nu gewoon
origineel (geteld als `onvertaald`), en als er niets vertaald is volgt een eerlijke weigering. Boven de tekst een strook «Перекладено з … рушієм …» met
«показати оригінал». Catalogus van motoren met echte status (de eigen AI-agent werkt als die gekoppeld is en `mail.read` heeft; LibreTranslate, Google,
Microsoft en DeepL staan op «nog niet gebouwd», zonder knop). Nieuwe modus «naast elkaar» (op ≤860 px onder elkaar). De knop «ШІ» is uitgelegd met een
InfoTip; de echte motorkeuze heet nu «Рушії перекладу».

**Opgeruimd.** `src/ChatPanel.tsx` verwijderd (nergens meer gebruikt sinds het nieuwe chatvenster); `src/agenten/logos.ts`, `src/sessies/merk-iconen.ts`,
`public/agent-logos/` en `scripts/agent-logos-maken.mjs` verwijderd.

**Migratie.** 0075 (`mail_contacten_scan`: `poging`, `wacht_tot`, status `overgeslagen`; nieuwe tabel `app.mail_contacten_scan_beleid` met RLS en rechten).
De bureaublad-indeling en de notitiesoorten hebben geen nieuwe tabel nodig.

**Nog open (beslissing eigenaar).** Thema en palet staan nog in één cookie voor alle accounts en beide profielen
(`src/shared-preferences.ts`) — dat is het laatste stuk van punt 2/4 en vraagt serveropslag per account + ruimte. Tweerichtingsagenda, OAuth voor GitHub,
een GitHub-App en een MCP-client op de server bestaan niet. De chat op ai.* heeft nog geen post-/agenda-/Drive-gereedschap. `EXT_MIN_VERSIE` staat nu op
0.6.1: elke oudere extensie krijgt direct een verplichte updatebalk. Het diagnosepakket van de extensie is niet als CRX ondertekend (handmatig laden).

**Tests.** 5090/5090 (148 sets): 8 sets draaien met de app-rol (`run-test-rls.sh`), de rest gewoon. Beide typecontroles schoon, `npm run build` in orde.
Nieuw in deze ronde: `ut-tabs-pijlen-20261019`, `menu-per-account-20261019`, `menu-per-profiel-20261019`, `profiel-isolatie-20261019`, `merk-register`,
`hub-bureau-20261019`, `hub-agenda-notities-20261019`, `ai-werkruimte-20261019`, `mail-ai-knoppen-20261019`, `contacten-hervatten-20261019`,
`vertaalpaneel-20261019`, `extensie-debugger-markering-20261019`, `github-koppelkaart-20261019`, `foutuitleg-20261019`.

## AB · 20.10.2026 — echte hulpmiddelen in plaats van «binnenkort» + één connector per agent (migraties 0076–0078, 0080)

Vervolg op sectie AA, op verzoek van de eigenaar in hetzelfde bestand. Alles wat eerder eerlijk als «nog niet gebouwd» stond gemarkeerd, is nu ofwel
gemaakt, ofwel teruggebracht tot een concrete lijst van wat er nog ontbreekt.

### Live-controle van extensie 0.6.1 (punten 7 en 8)

De eigenaar heeft release 20261019-190816 en extensie 0.6.1 al geïnstalleerd. Gemeten in zijn Chrome:

- De markering (punt 8) **werkt**: op de pagina staat `<div id="mr-markering">`, het groene kader en het opschrift «Mijn Ruimte · ШІ користувача» zijn zichtbaar;
  het technische slot heeft zijn eigen kleur (`#b45309`) en het opschrift «технічний профіль».
- De AI-brug **werkt in de gebruikersruimte**: `browser_get_diagnostics` gaf echte paginametrieken en de 502-geschiedenis terug.
- Maar **de technische ruimte bestond in de browserhulpmiddelen helemaal niet**. Alle 20 browseropties in `shared/connector-v2/catalogus.ts`
  hadden `kanten: G` (alleen `gebruiker`), en de groep `browser` had `kant: 'gebruiker'`. Daardoor kwam op een technisch tabblad
  `EXTENSIE_PROFIEL: a user-space AI never reads or controls a technical tab` terug, en bij diepe diagnose —
  `the Chrome debugger is only available to the technical profile`. Oftewel: het pakket «diagnose», gemaakt voor punt 7, kon op geen enkele manier
  worden gebruikt: het pad ernaartoe was al op het niveau van de hulpmiddelencatalogus afgesneden.
- Er is ook een tweede fout gevonden: `connectors-tools.listTools()` vervangt aan het eind de interne `browser_*`-namen door devtools-aliassen
  (`take_snapshot`, `click`, …), terwijl `v2Lijst` de basis op de INTERNE naam zocht — en niet vond. Daardoor ontbraken in connector v2
  de meeste browserhulpmiddelen **in beide** ruimtes; alleen de hulpmiddelen zonder alias waren zichtbaar.
- Daarnaast: een nieuw tabblad erfde het technische profiel (migratie 0071), waardoor standaard alle tabbladen technisch waren en
  de gebruikers-AI overal een weigering kreeg.

**Gedaan.** De browseropties kregen `kanten: BEIDE`; v2 haalt de lijst op met `aliassen: false`; een nieuwe zuivere poort
`shared/browser-technisch-slot.ts` + `backend/browser-technisch.ts` controleert zes voorwaarden op rij (ruimte → slot → ontgrendeling →
mogelijkheid → host → tabbladprofiel, plus debugger-toestemming) en geeft voor elk een eigen uitleg met stappen in plaats van «403». Een weigering zonder
Chrome-toestemming noemt rechtstreeks het pakket «diagnose» en geeft vijf stappen. Technische browseracties worden in het journaal geschreven als `owner.tech.browser`.
Het erven van het profiel door nieuwe tabbladen is instelbaar geworden (migratie **0080**, `app.tech_profielen.erven_nieuwe_tabbladen`) en staat
**standaard uit** — nieuwe tabbladen zijn nu gebruikerstabbladen.

### Één connector per agent, rechten volgens de actuele stand

Op verzoek van de eigenaar: de ruimte wordt op het moment van toestemming niet meer vastgelegd in de grant.

- Paden: `AGENT_PAD_PREFIX = ''` → `mcp.tarasevych.com/claude`, `/gpt`, `/grok`, `/gemini`, `/copilot`, `/cursor`. Oude adressen
  (`/ai/<agent>` en hun metadata) antwoorden met **308** (behoudt methode en body — 301/302 zouden POST in GET veranderen en MCP breken),
  en worden nog steeds **gelezen** in `slugUitResource`, zodat tokens die zijn uitgegeven met `resource=…/ai/claude` geldig blijven.
- `/mcp` **wordt bewust niet doorgestuurd**: het bedient grants zonder agent en `tvh_…`-tokens die op een agentadres 401 zouden krijgen. Het
  kreeg dezelfde live-berekening en is gemarkeerd als overgangspad; in `deploy/CONNECTOR-EEN-PAD.md` staan de zoekopdracht's waarmee te zien is wanneer het
  weg kan.
- Nieuwe `effectieveRuimte(userId, rol, tabContext)` in `backend/ai-ruimte-poort.ts`: geen eigenaar → `prive`; eigenaar zonder actief
  technisch profiel → `prive`; anders `technisch`. Een aanroep vanuit een AI komt **zonder tabblad** binnen, daarom is `lopendeActivatie(userId)` toegevoegd —
  «is er op dit moment enige activering van dit account» (met tabblad werkt het oude, engere pad).
- De filtering staat zowel op `tools/list` als nogmaals op `tools/call` — **weigering, geen stille terugval naar de privéruimte**: anders
  zouden `browser_*_beheer` of `machine_exec` op gebruikerstabbladen worden uitgevoerd. Technisch profiel verlaten → technische hulpmiddelen verdwijnen
  midden in de sessie; weer aangezet → ze keren terug zonder opnieuw te verbinden.
- Toestemming vereenvoudigd: de vraag «privé of technisch» is weg, de eis van een actief techprofiel op het moment van toestemming is vervallen (de eis van
  eigenaar bleef), de gele waarschuwing «open in de technische ruimte» is verwijderd. Een v2-grant wordt altijd geschreven met `ruimte='prive'`; wat is toegestaan
  leeft in `connector_v2_rechten`, wat nu geldt berekent `effectieveRuimte`.
- In de rechtenkeuze is de technische sectie bij een uitgeschakeld profiel grijs, met een chip «nu niet beschikbaar» en de uitleg dat de toestemming bewaard blijft.
- Opgelost: `toolRuimte()` kende `extern_*` niet, waardoor een technische externe MCP-server nergens bereikbaar was.

### Tweerichtingsagenda (migratie 0076)

Google Calendar kan nu zowel lezen als schrijven: scopes `calendar.readonly` + `calendar.events`, **aanvullende toestemming** voor wie
alleen voor lezen gekoppeld was (aparte stap «Розширити доступ», `include_granted_scopes=true` — de bestaande koppeling blijft behouden).
Aanmaken, wijzigen, verplaatsen (`events.move`), verwijderen, deelnemers, RSVP. Versieconflicten via `If-Match`/etag: 412 van Google →
niets overschrijven, beide versies naast elkaar tonen, «toch overschrijven» is een aparte bewuste knop. Idempotentie: elke schrijfactie
draagt een sleutel, het event-id wordt deterministisch afgeleid, twee gelijktijdige identieke verzoeken leveren één afspraak op. Synchronisatie is incrementeel per
agenda (`syncToken`, `410 GONE` → hersynchronisatie van precies die agenda). De bron van waarheid bij een conflict is zowel in de code als in de DB vastgelegd.
ICS-abonnement is een echte downloader (alleen https, DNS-pinning, time-out, limiet 4 MB, `If-None-Match`, schema vanaf 15 min), zodat
Outlook en Proton via een gepubliceerde link vandaag al werken. CalDAV — **alleen lezen** (PROPFIND/REPORT, app-wachtwoord
versleuteld); schrijven is niet gebouwd, en de lijst van wat ontbreekt gaat mee in het antwoord van de route, op de pagina en op de kaart. De AI kreeg zes
agendahulpmiddelen, allemaal met bevestiging van de eigenaar; `calendar.write` en `calendar.delete` staan **standaard uit**.

### GitHub: OAuth en GitHub App (migratie 0077)

Volledige OAuth web application stroom: `state` wordt uitsluitend als SHA-256 opgeslagen, gebonden aan gebruiker, sessie, host en tijd (10 min),
bij de eerste lezing verwijderd, plus PKCE S256; de callback-route wordt alleen op de github-host van deze installatie geaccepteerd; code-inwisseling,
scopecontrole, vernieuwing via refresh token, ontkoppelen met echte intrekking (`DELETE /applications/{client_id}/token`).
GitHub App: App ID + privésleutel uit de kluis → ondertekende JWT RS256 → installatietoken met vernieuwing, lijst van installaties en
repository's. Één centraal punt `backend/github-toegang.ts` kiest zelf het pad **OAuth → GitHub App → PAT** en vernieuwt wat verlopen is, zodat de rest van
de code ongewijzigd bleef. De waarden voor `Homepage URL` en `Authorization callback URL` worden berekend uit het domein van de installatie — in deze bestanden staat geen enkele
vermelding van tarasevych.com (een test controleert dit), want het platform is BYOS.

### MCP-client op de server (migratie 0078)

De server spreekt nu zelf externe MCP-servers aan: beide transporten (Streamable HTTP en het oude HTTP+SSE, de client bepaalt zelf de versie),
`initialize` met onderhandeling over de protocolversie, `tools/list` met paginering, `tools/call`, `resources`, `prompts`, melding van een gewijzigde
lijst, nette sessiesluiting. Alle uitgaande verzoeken gaan uitsluitend via `backend/veilige-fetch.ts` (streamingversie `pinnedStream` toegevoegd
met dezelfde garanties); de eigenaar beheert de witte lijst van hosts, **lege lijst = nergens heen**. Grenzen: 1 MiB, 20 s per verzoek, 60 s per
sessie, 30 aanroepen/min, 10 verbindingen, 150 hulpmiddelen. Beschrijvingen van externe hulpmiddelen zijn **onvertrouwde gegevens**: ze worden geschoond en aan de AI aangeboden als
`<untrusted_mcp_tool>`; alles zonder `readOnlyHint` wacht altijd op bevestiging van de eigenaar. Nieuw tabblad «Зовнішні MCP» op `mcp.*/agents`.
OAuth 2.1 met dynamische registratie is **niet gebouwd**, de lijst van vijf punten wordt zonder knop getoond; de MCP-server van GitHub wordt voorlopig
met een persoonlijk token gekoppeld.

### Thema en palet — per account en per profiel

Het laatste stuk van de punten 2 en 4. De weergave ligt niet langer in één gedeelde cookie: thema, palet, automatisch schakelen, geluid, positie
van het belletje en recente paden gelden per `<account>|<ruimte>`; taal en foto gelden per account (dezelfde persoon leest in beide profielen dezelfde taal).
De server is de bron van waarheid (`weergave` in `owner_ui_preferences_v1`, routes met dezelfde poort `ownerMenuRuimte`: technisch schrijven zonder
actief profiel → 403, ook voor de eigenaar), de cookie blijft een cache voor het eerste frame. De bestaande gedeelde waarde migreert precies naar **het actieve
account in de gebruikersruimte** — ze wordt niet aan iedereen uitgedeeld en gaat niet naar het techprofiel. Het technische profiel heeft een eigen standaard (donker thema,
palet «grifel»), die de eigenaar kan wijzigen. Voor het eerst is er een groottelimiet op de cookie (3000 tekens, ≤4 ruimtes) met slim
afkappen; eerder was er helemaal geen limiet.

**Migraties.** 0076 (agenda), 0077 (GitHub OAuth), 0078 (externe MCP), 0080 (erven techprofiel). 0079 was niet nodig.

### AB.1 · 20.10.2026 — drie bevindingen uit de live-sessie van de eigenaar

De eigenaar klaagde over drie dingen tegelijk. Elk ervan is gereproduceerd, de oorzaak is in de code gevonden, gerepareerd en met een test afgedekt.

**1. «Blijft in een lus hangen» bij het koppelen van een connector.** Gereproduceerd in zijn Chrome: op `mcp.tarasevych.com/agenten#technisch`, waar het technische profiel **actief was**
(`<meta name="mjn-profiel" content="technisch">`, balk [ТЕХ]), toonde het toestemmingsvenster het gele blok «Двері сервера — це технічний простір. У приватному просторі
цей запит дозволити не можна» en de link «Відкрити в технічному просторі» → `/verbindingen?consent=mrd_…`. Die link stuurde terug naar `/agenten#technisch`
met hetzelfde venster. Een eindeloze cirkel. De server had er intussen geen bezwaar tegen: `POST …/consent/info` antwoordde **200** met `soort:'deur'`, `ruimte:'technisch'`.

Oorzaak: `McpConsentModal` berekende de ruimte **uit het pagina-adres** (`McpServiceView`: `isBeheerPagina('mcp', section) ? 'technisch' : 'prive'`), terwijl er geen aparte pagina
«Technische verbindingen» meer bestaat — die is samengevoegd in de hub «Під'єднання ШІ» (tabblad `#technisch`). Daardoor beschouwde het venster zichzelf altijd als privé, en verwees de link naar
een adres dat terugredirect. Dit was een restant van het oude model: op 20.10 was de connector zelf al overgezet op de live-status (`effectieveRuimte`), maar het venster niet.

Opgelost: de ruimte wordt alleen nog berekend uit het live `techActief()`; in plaats van een link staat er nu de **actie** «Увімкнути технічний профіль» (dezelfde stroom als in de technische balk),
waarna het venster zichzelf zonder navigatie en zonder verlies van het verzoek hertekent naar «Дозволити». Tegelijk: `?consent=` raakt bij navigatie niet meer zoek
(`canonicalNavigationUrl` knipte de querystring eraf), en `/verbindingen` is verdwenen uit de links in `backend/mcp-connector.ts` en `deploy/mcp/server.mjs`.

**2. «Logt uit bij het wisselen van tabblad».** De oorzaak bleek **op de server** te zitten, niet in de browser. In `ownerRequireSessionKern` werd een tabblad zonder eigen rij
in `owner_tab_sessions` geweigerd zodra er in de browser ook maar één tabblad leefde met een **ander** account dan de ankersessie — en dat is na elke
accountwissel het geval. Resultaat: `OWNER_TAB_SIGNED_OUT` → de bootstrap gaf `signed_out` terug **zonder de cookie te wissen**, dus de sessie was de hele tijd gewoon in leven. Precies daarom
lukte het kiezen van het account uit de lijst daarna zonder wachtwoord.

Opgelost: een tabblad zonder rij is een **nieuw** tabblad; het krijgt het ankeraccount van de browser (en nooit het account van een ander tabblad); de rij wordt tijdens de bootstrap aangemaakt.
De hint over een levende sessie staat nu ook op het apparaat (alleen positief), zodat een nieuw tabblad een spinner toont in plaats van het inlogscherm.

Tegelijk is een verse regressie uit het werk van 19–20.10 gevonden: in `shared-preferences.ts` gooide het samenvoegen van de map `accountPerDienst` lege waarden weg, waardoor
`forgetViewAccount()` en `clearViewAccounts()` **niets deden** — de map bleef voorgoed op het oude account staan. Bovendien wiste `logout()` deze map voor **alle**
accounts, waardoor tabbladen van een ander account kwijtraakten «welk account hier actief is». Nu wordt alleen het account vergeten dat uitlogt. De server zelf deed het al goed:
`logout-account-browser` raakt maar één account aan en verankert de cookie opnieuw op een ander levend account.

Het vinkje «Зберегти цей обліковий запис для наступних сесій» was half-echt: de waarde ging bij het inloggen naar de server (en stuurde daadwerkelijk de privécache van de mail aan), maar
**werd nergens opgeslagen** — `useState(true)` gaf telkens weer «aan» terug, bewust uitzetten was onmogelijk, en op de hub ontbrak het vinkje helemaal. Nu leeft de keuze
op het apparaat, wordt ze ook vanaf de hub meegestuurd, synchroniseert ze met het antwoord van de server en is ze zichtbaar in «Налаштування → Сесії та пристрої».

**3. «Запамʼятати цей браузер (не питати знову до виходу)» werkte niet — helemaal niet.** De keuze werd nergens bewaard: `useState(false)` in het venster, TOTP en herstelcode
stuurden haar niet naar de server, passkey evenmin, en in de Google-tak werd een **andere** parameter meegestuurd (`remember` regelt het onthouden van het *inloggen*), die in
`identity/transactions/create` voor step-up hard werd overschreven met `false`. Op de server was er nergens plek om dit op te slaan. Het bijschrift was op alle paden een loze belofte.
Bovendien werd het vinkje gerenderd binnen het blok «Виникли проблеми?» — bij slechts één beschikbare methode was het niet eens zichtbaar.

Nu: geheugen in `owner_step_up_v1.onthoudSessies`, de sleutel is de browsersessie van dit account (een ander account in dezelfde browser wordt niet geraakt), limiet **12 uur**,
wissen bij elke uitlog- en intrekkingsactie. De keuze komt vanuit alle vier de methoden door. De lijst «altijd vragen» (`NOOIT_ONTHOUDEN`): release-goedkeuring, rechten
om releases voor te bereiden, passkey, herstelcodes, TOTP, wachtwoord, inlogmethoden, account verwijderen, export, beheer, toegangscodes — plus vangnetten op pad
(kluis/sleutels, verwijderen, SSH, terminal, impersonatie, extensie ontgrendelen) en **een onbekend pad betekent eveneens «vragen»**. Waar onthouden niet mag,
is er helemaal geen vinkje, maar een zichtbare uitleg. In «Налаштування → Безпека» is te zien welke browsers zijn onthouden en staat een knop «vergeten».

**Tests.** 5624/5624. Nieuw: `consent-ruimte-cyclus-20261020` (26), `sessie-tabbladen-20261020` (21), `stap-op-onthouden-20261020` (27). Geen migraties nodig.

### AB.2 · 20.10.2026 — `NotReadableError` bij het uploaden van een pakket, en volledige geschiedenis van pogingen (migratie 0081)

**Wat er bij de eigenaar gebeurde.** Het uploaden van het pakket op `admin.tarasevych.com/updates` brak af met de melding: «Причина невідома: цього коду сайт
не знає. Сервер повернув **NotReadableError** без пояснення… сервіс admin · NotReadableError · pakket · спроба 2». Bij de tweede poging (na
het herladen van de pagina) werd het pakket geïnstalleerd.

**Gecontroleerd: het pakket was intact.** De sha256 van het archief komt overeen met `.voorstel.json`, 1550 bestanden, `UITROL-VERSIE` en `BRON-COMMIT` aanwezig. Het
probleem zat dus niet in de update en niet op de server.

**De echte oorzaak.** `NotReadableError` is een `DOMException` uit de Bestand API van de **browser**, geen code van onze server. Hij treedt op wanneer de browser een
eerder gekozen bestand niet meer kan lezen: het bestand is na het kiezen verplaatst, hernoemd of overschreven; het ligt in een cloudmap (OneDrive /
Google Drive «bestanden op aanvraag») en is lokaal niet gematerialiseerd; een virusscanner houdt het vast; of het is een netwerkschijf. In de code stond het lezen **buiten**
de `try/catch`: `src/uitrol/Upload.tsx` ving alleen `stuurStuk` op, maar `await f.slice(offset, …).arrayBuffer()` in dezelfde lus niet. Daardoor vloog de browserfout
rauw naar het nieuwe uitlegsysteem en kreeg daar eerlijk «onbekende code». Het foutsysteem werkte correct — er ontbrak alleen kennis over
deze klasse van fouten.

Er zijn nog acht van zulke plekken gevonden, en drie daarvan **logen**: `tar-lezen.ts` vertaalde elke leesfout naar «archief beschadigd»;
`PakketActies.tsx` toonde bij een leesfout «sha256 wijkt af»; het wijzigen van de profielfoto adviseerde «probeer een andere afbeelding». Alle bestandslezingen
lopen nu via één poort `shared/bestand-lezen.ts`, en `shared/foutuitleg.ts` kreeg echte verklaringen voor `NotReadableError`,
`NotFoundError`, `SecurityError`, `AbortError`, `EncodingError`, `InvalidStateError` en een eerlijke algemene tekst voor een onbekende `DOMException`-naam
(noemt de naam zelf en zegt rechtuit dat de server die code niet heeft teruggegeven). De voortgang gaat niet meer verloren: bij een onderbreking zijn het percentage, de oorzaak en de knop
«Обрати файл ще раз» zichtbaar, waarna de upload vanaf dezelfde offset verdergaat. Vóór de start is een goedkope controle «bestand is nog leesbaar» toegevoegd
(512 bytes, zonder netwerkverzoek) — precies die voorkomt dat er een leeg pakket in de status `uploaden` wordt aangemaakt dat de limiet `TE_VEEL_OPEN` opat.

**Geschiedenis van pogingen (verzoek van de eigenaar).** «Waarom heeft de dienst in de geschiedenis van recente uitrollen de mislukte poging niet gemarkeerd?» Omdat het spoor op drie plekken verloren ging:
de server had geen kanaal waarmee de browser een afbreking kon melden; een half geüpload pakket bleef hangen op `uploaden` zonder fase, percentage of oorzaak, en
het opruimen werd alleen bij het openen van de pagina aangeroepen (zonder dat bleef het pakket eeuwig hangen); een geslaagde tweede poging liet in de geschiedenis alleen zichzelf achter.

Nu laat elke poging een spoor achter. Nieuwe tabel `app.uitrol_pogingen` (migratie **0081**) met twee soorten items die nooit door elkaar lopen:
«gemeld door de browser» en «ontdekt door de server». De route `POST /api/uitrol/poging/afgebroken` accepteert de fase (bestand kiezen, lezen, controleren,
starten, uploaden, afronden, goedkeuren, installeren), offset, oorzaakcode, tijd en pogingnummer — met limieten op frequentie (60/uur) en grootte,
alleen van wie het recht heeft om releases voor te bereiden; **de server herberekent zelf het percentage** en haalt het account uit de sessie, zodat liegen over de voortgang onmogelijk is.
Het sluiten van een tabblad wordt via `pagehide` opgevangen en vastgelegd als een eerlijk «afgebroken zonder reden», onderscheiden van een bekende oorzaak. De oorzaken komen uit
dezelfde `shared/foutuitleg.ts` — er is geen tweede teksttabel. In «Recente uitrollen» en «Volledige geschiedenis» is het blok «Afgebroken pogingen» verschenen met
de actie «Hervatten» (wanneer er echt iets te hervatten valt) of «Opnieuw beginnen». Hetzelfde komt in het beheerjournaal (`uitrol_poging_afgebroken`).
Opruimen: 30 dagen en maximaal 200 items per account. Een achtergelaten `uploaden` wordt nu door de uurlijkse cron afgesloten en niet alleen door een geopende pagina, en de codes
`UPLOAD_STIL` / `UPLOAD_TE_OUD` hebben eindelijk een vertaling — eerder werd de kale code getoond.

**Tests.** 5698/5698. Nieuw: `bestand-lezen-fout-20261020` (36), `uitrol-pogingen-20261020` (38).

## AC · 20.10.2026 — aparte ruimtes voor technische toegang (migraties 0082–0087)

Opdracht van de eigenaar: «Het is onduidelijk waarom het technische profiel en het gebruikersprofiel een gedeelde ruimte hebben — mail, AI, cloud. Gebruikers
met technische toegang moeten niet alleen worden gescheiden door toegang tot delen van de site, maar ook door de mogelijkheid om **aparte ruimtes** te hebben voor de overige onderdelen. En wie
technische toegang heeft, moet **zelf beslissen** of hij aparte ruimtes heeft of ze samenvoegt. Omdat het twee verschillende ruimtes zijn, moet er voor
hun integratie een proces van samenvoegen/loskoppelen zijn, zodat er geen toegang tot diensten achterblijft nadat rechten zijn ingetrokken.»

**Waarom dat zo was.** `prive`/`technisch` ging **alleen over AI-verbindingen** — welke hulpmiddelen een agent ziet. De gegevens zelf (mail, cloud, agenda,
bord, GitHub) waren alleen aan `ownerUserId` gekoppeld en verder nergens aan, waardoor het technische profiel simpelweg een verhoogde modus van **hetzelfde** account was.
De gedeelde ruimte was niet zo ontworpen — ze was geërfd.

**Vier beslissingen van de eigenaar**, waarnaar dit is gebouwd: een aparte ruimte **binnen hetzelfde account**; **één keer** vragen bij de eerste activering (zolang er niet
is gekozen, is de technische ruimte leeg); bij verlies van rechten **onmiddellijk bevriezen**, waarna de servereigenaar beslist; samenvoegen **apart per dienst**.

### Kern (migraties 0082, 0087)

De gegevenssleutel is `(userId, ruimte)` geworden. Een rij **zonder** veld `ruimte` is altijd persoonlijk — daardoor wordt geen enkele bestaande rij verplaatst en verandert er voor mensen zonder
technisch profiel helemaal niets. Status van elke dienst in de technische ruimte: `eigen` (eigen gegevens) / `gedeeld` (gebruikt de persoonlijke
koppeling) / `uit` (standaard) / `bevroren`. Onbekende status, onbekende dienst, DB-fout of ontbrekende keuze → **weigering met uitleg**, nooit
een stille terugval naar de persoonlijke lade. Één poort `gegevensLade()` beslist uit welke lade wordt gelezen; het koppelen van een dienst vereist step-up (en is toegevoegd
aan de lijst «altijd vragen»), loskoppelen werkt onmiddellijk, elke actie gaat in het journaal (`owner.ruimte.*`).

**Echt lek gevonden en gedicht:** `effectieveRuimte` haalde de rol uit de **sessie**, waardoor iemand die net de eigenaarsrol had verloren of was
geblokkeerd, met een oude sessie nog steeds de technische lade kreeg. De poort herleest nu zelf de live-rechten uit de DB en bevriest bij verlies.

**Technische toegang tot gegevens en technische toegang tot hulpmiddelen zijn bewust gescheiden.** Een eigen lade hebben alle «werkende» technische rollen
(tester, ontwikkelaar, beheerder, eigenaar — afgeleid uit de bestaande mogelijkheidencatalogus, niet met een losse lijst); alleen-lezen-rollen (ondersteuning,
auditor) hebben die niet, omdat ze daar geen gegevens aanmaken. Daarbij **heeft niemand nieuwe rechten gekregen**: toegang tot releases, server en debugger
is gebleven wat het was, en dat is met aparte controles bewezen. De beslissing over bevroren gegevens blijft bij de **servereigenaar**.

Het fysiek overdragen en verwijderen van een bevroren lade loopt via het register `registreerLadeUitvoerder`: de eigenaar neemt het besluit, de dienst zelf doet het
werk (alleen die kent zijn eigen tabellen), het contract is idempotentie, **uitsluitend** de technische lade aanraken, en bij een fout verandert de status niet
(beter «nog niet gelukt» dan een lade die «overgedragen» heet maar er in werkelijkheid nog staat). Elke beslissing bewaart een rapport: wat er precies is overgedragen of verwijderd, en
of dat volledig was.

### Diensten (migraties 0083–0086)

**Mail en contacten (0083).** Alle **113** routes van mail en contacten staan achter de poort — de hele routetabel is ingepakt, zodat ook een nieuwe route
automatisch achter de poort valt; drie uitzonderingen zijn met reden benoemd (twee provider-webhooks zonder mens of tabblad, en de statusroute zelf die juist
moet kunnen worden gelezen wanneer de dienst uit staat). Contacten leven in `app.mail_afzenders` (een tabel `mail_contacten` bestaat niet). `ruimte` is opgenomen in
de primaire sleutel: hetzelfde adres kan in twee lades bestaan.

**Cloud en agenda (0084).** Er zijn **zes** bestanden met routes gevonden in plaats van vier — `google-suite-browser.ts` en
`google-suite-calendar-photos.ts` stonden niet op de lijst, terwijl juist de hulpmiddelen `drive_*` en `calendar_*` daarheen leiden. Samen **46** routes.
Bestanden van de twee ruimtes liggen in **verschillende bomen** van de opslag (`cloud/…` en `cloud-technisch/…`), zodat het verwijderen van de ene fysiek nooit de andere kan raken.
**Echt gat gedicht:** de OAuth-callback van Google komt zonder sessie en zonder tabblad binnen, waardoor een toestemming die in de technische ruimte was gestart een
**persoonlijke** koppeling zou aanmaken en de persoonlijke grant kon overschrijven; nu wordt de lade in de OAuth-state zelf geschreven.

**AI (0085).** Hier waren er **drie** waarheden die niets van elkaar wisten: de kolom `ruimte` op de rijen, het live `effectieveRuimte` en de status van de dienst
`ai` — die laatste **las niemand**. Oftewel: een eigenaar die «Під'єднання ШІ → вимкнено» instelde, bleef zitten met een volledige technische connector, een technisch
extensieslot en technische apparaten. Nu is de status van de dienst leidend. **Gat gedicht:** `POST /api/owner/externe-mcp/toevoegen` nam
de ruimte zonder enige controle uit de request-body over — iedereen met een sessie kon een vreemde MCP-server in de technische ruimte registreren.

**Bord en GitHub (0086).** Taken, notities, bureaublad, werkruimtes, blokken; GitHub — OAuth, App, PAT, MCP-adres. De zegel van een GitHub-token
is gebonden aan `(persoon, pad, ruimte)`, zodat het omprikken van een rij in de DB geen werkend token oplevert; bij bevriezing wordt het technische token
**echt** ingetrokken (`DELETE /applications/{client_id}/token`), terwijl het persoonlijke intact blijft. Een PAT is voor altijd persoonlijk — in een technische
lade met `eigen` wordt hij bewust niet gebruikt, omdat de sleutelkluis één en persoonlijk is.

### Los daarvan: «Кому дозволено» verloor stilzwijgend mensen

De volledige testrun viel om op de controle `grants: kandidaten-accounts hebben naam en foto`, en dat bleek **geen testartefact** te zijn. In `kandidaten()` stond
een kale `ORDER BY email LIMIT 200`: op een server met meer dan 200 goedgekeurde mensen vielen allen die verderop in het alfabet stonden **stilzwijgend** buiten de lijst, en
kon de eigenaar hun geen rechten geven zonder te begrijpen waarom ze ontbraken. Nu is er zoeken op de server (op adres en naam, met escapen van `%` en `_`), een aparte
route `POST /api/owner/uitrol/kandidaten` alleen voor de eigenaar, en zegt het scherm de waarheid: «Показано 200 з 289 — шукайте за адресою».

### Wat de eigenaar vóór de installatie moet weten

Na deze release **bestaat de technische kant niet totdat de eenmalige keuze is gemaakt**. Direct na de uitrol verdwijnen: de technische
`_beheer`-hulpmiddelen van de connector, de technische apparaten en het technische extensieslot — totdat de eigenaar de keuze in de interface doorloopt (of vooraf
een rij `ai = 'eigen'` invoegt). **Er verdwijnen of verhuizen daarbij geen gegevens.** Dit is hetzelfde gedrag als voor mail, cloud en
het bord, dus gelijk voor alle diensten en geen uitzondering.

**Tests.** Nieuw: `ruimte-scheiding-20261020` (76), `ruimte-mail-20261020` (37), `ruimte-cloud-agenda-20261020` (48), `ruimte-ai-20261020` (40),
`ruimte-bord-github-20261020` (45), `uitrol-kandidaten-zoeken-20261020` (15).

---

## AD. Negen opmerkingen vanaf de live-site (20.10.2026)

De eigenaar liep met twee profielen door de site en stuurde schermafbeeldingen. Hieronder staat elk punt, en **wat daadwerkelijk de oorzaak bleek te zijn** in plaats van wat het leek.
Twee van de negen waren echte lekken tussen ruimtes; beide zijn bewezen met een regressietest, niet met een aanname.

### 1. Vensteromlijsting — alleen wanneer een AI echt meekijkt

Was: het groene kader verscheen al door het enkele feit dat het technische slot verbonden was. Wordt: het kader wordt getekend door `markeringLezers()` —
alleen zolang er een echte AI-actie op het venster plaatsvindt (schermafbeelding, pagina lezen, observeren), plus een uitloop `MARKERING_STAART_MS = 4000`
(één constante, `shared/markering-agenten.ts`). De poort `markeringVoor()` zelf is niet veranderd.

Het bijschrift zegt niet langer «Простір», maar noemt **wie er precies leest en wat hij doet** — 21 acties in twee talen. De kleur van het kader is de kleur van de agent:
opgeslagen als **accentnaam** uit `ACCENT_KLEUREN` (claude→oranje, gpt→teal, grok→grafiet, gemini→blauw, copilot→paars,
cursor→indigo) en niet als hex, zodat thema en palet de tint blijven aansturen; aanpasbaar in «Колір агента» (migratie **0088**, `app.agent_kleuren`).
Meerdere AI's tegelijk — geneste kaders van elk 3 px en onderaan een strook met logo's en acties, `MARKERING_MAX_AGENTEN = 3` plus «en nog N».
Het technische profiel heeft daarnaast een gestippeld buitenkader. Een schermafbeelding verbergt de markering (`markering-verberg`/`markering-toon`),
zodat het kader niet op zijn eigen schermafbeelding belandt. Als niet met zekerheid bekend is welke AI het is, zegt het bijschrift eerlijk «ШІ» en gokt het niet.

**Extensie 0.6.2.** `MIN_EXTENSIE_VERSIE` en `EXT_MIN_VERSIE` zijn samen verhoogd — **elke 0.6.1 krijgt een verplichte
updatebalk**, dus de twee ZIP's moeten samen met deze release uitkomen.

### 2. Mail zichtbaar in beide ruimtes — echt lek (gevonden en gedicht)

De bewering «al gedicht door migratie 0083» **klopte niet**. `backend/hub-block-data.ts` en `backend/global-search.ts`
(tevens het AI-hulpmiddel `site_search`) lazen projecties van mail, cloud, Drive en agenda **buiten elke poort om** — het lekte dus
**in beide richtingen**: het technische profiel zag persoonlijke mail, het persoonlijke zag technische. Gedicht met een gemeenschappelijke `backend/ruimte-projecties.ts`
en een registertest die alle 15 modules met projecties afloopt en faalt zodra er een nieuwe onbeschermde module bijkomt.

### 3. Drive-projectie werd zonder ruimte geschreven — tweede echte lek

`backend/google-suite-sync.ts` schreef elke rij van `google_suite_drive_projection_v1` **zonder veld `ruimte`**, dus als persoonlijk —
ook voor een puur technische koppeling. Bewezen met een regressietest: met het oude gedrag tijdelijk teruggezet haalt de test **12/23**, met
concrete missers (de persoonlijke hub toonde `TECHNISCH-uitrol-*.txt`; de technische ruimte zag geen enkel eigen Drive-bestand;
de cron vroeg niet naar `ladeNogGeldig` en synchroniseerde een bevroren lade door; «aan mijzelf overdragen»/«verwijderen» raakten de projectie niet aan).

Opgelost met hetzelfde mechanisme als bij de agenda: de lade wordt **uit de koppelingsrij** gehaald (`ladeVan`), nooit uit het huidige verzoek;
elke lade heeft **zijn eigen synchronisatiecursor**; de cron slaat een gesloten of bevroren lade over; beide tabellen
(`google_suite_drive_projection_v1`, `google_suite_sync_state_v1`) zijn opgenomen in het register voor «aan mijzelf overdragen»/«verwijderen». Geen migratie nodig:
de projectie leeft in `app.records`, waar `ruimte` een veld is en migratie 0086 al een partiële index levert.

Terloops zijn nog twee kleinere zaken van dezelfde soort gedicht: `spiegelLeeg` in de agenda deed een **VERWIJDEREN** met een filter zonder lade, en kiosksessies
van Google Photos controleerden alleen de eigenaar — binnen het venster van 10 minuten kon een sessie-id uit de technische ruimte in de persoonlijke worden afgespeeld.

### 4. Cloud in het technische profiel: lege pagina zonder menu

De oorzaak lag niet aan de rechten. De server gaf een «zachte» 200 terug met body `providers:null, onboarding:null`, en `CloudFunctionalView` derefereerde die —
een TypeError tijdens het renderen **haalde de hele React-boom inclusief het menu onderuit**, vandaar dat ook het menu «verdween». Aan beide kanten opgelost: de server geeft dezelfde
vorm met lege waarden terug, de pagina heeft `normaliseerBootstrap` en `?.`, en in `src/platform/client.ts` is een algemeen vangnet
op 403 gekomen zodat geen enkele andere pagina ooit nog de schil onderuit kan halen.

### 5. Snel wisselen tussen accounts

Het wisselen zelf werkte al; het probleem was dat het menu dichtklapte en niet vertelde waar je was. Nu blijft het menu open en
noemt het expliciet het account, het profiel en het feit dat **het technische profiel niet meeverhuist** naar een ander account.

### 6. `/sessies`: tekst letter voor letter, knoppen van ongelijke grootte

Oorzaak — `.sessie-dienst-kop` was één flex-rij zonder terugloop: het titelblok had `flex:1` (oftewel `flex-basis:0`) en de nieuwe badges hadden
`auto`. Flexbox krimpt naar rato van de basis, zodat na het verschijnen van twee nieuwe badges de titel **tot nul** kromp en de regel
`overflow-wrap:anywhere` de overloop omzette in afbreken **per letter**. De kolombreedte (17rem) was ruim voldoende — de schuldige was de rij-indeling.

Wordt: `.sessie-dienst-kop` is een grid `auto minmax(0,1fr)`, de badges staan op een eigen regel en lopen per heel woord terug;
`anywhere` is alleen gebleven waar het hoort (IPv6, ID, User-Agent). Het selectievakje «Зберегти цей обліковий запис» is een gewone siteschakelaar geworden
(`.zijbalk-schakel`, `role="switch"`), en rijknoppen, kaartknoppen en «Відкликати» zijn teruggebracht tot één gewicht (`min-height:2.5rem`,
`border-radius:12px`, gelijke icoongrootte).

### 7. Mail koppelen: echte vensters in plaats van fopblokken

Elke tegel opent nu een **echt venster** van de gemeenschappelijke vensterlaag dat kan worden ingeklapt. Binnenin zit wat deze dienst daadwerkelijk kan
(`shared/mail-aanbieders.ts`): Google-OAuth, Microsoft-OAuth of IMAP met een app-wachtwoord. Waar een dienst niet wordt ondersteund
(Online.ua, Proton) staat een eerlijke lijst van wat er ontbreekt **en geen enkele knop**, in plaats van een melding «nog niet ondersteund» onder een knop.

De IMAP/SMTP-client is eigen bouw op `node:tls`, met een **vaste** lijst van hosts in `shared/mail-aanbieders.ts`: de gebruiker voert zelf geen host in,
waardoor SSRF per ontwerp onmogelijk is. App-wachtwoorden worden met AES-256-GCM versleuteld onder de nieuwe sleutel **`MAIL_APP_WACHTWOORD_SLEUTEL_V1`**
(nieuwe verplichte omgevingsvariabele). De client **heeft nooit tegen echte servers gedraaid** — dat is het eerste wat handmatig moet worden gecontroleerd.

**Ingeklapte vensters verdwijnen niet meer** bij de overstap naar een ander subdomein: de staat ligt op de server (`app.venster_stand`, primaire sleutel
`(user_id, ruimte)`, migratie **0089**) en wordt op elk subdomein hersteld via `src/platform/VensterHerstel.tsx` in `CanonicalChrome`.
`zonderGeheimen()` snijdt geheimen weg vóór het opslaan, en de route weigert met `OWNER_VENSTERS_GEHEIM_GEWEIGERD` als ze toch zijn meegestuurd.

### 8. Waarom de maillogo's onzichtbaar waren (de echte oorzaak zat in de build)

De logo's waren niet «vergeten». De gedeelde merkcomponent en de grote merktabel lagen in `src/integraties/`, en die map hoort bij
`TECH_MAPPEN`: daardoor werd de chunk met de tabel naar `dist/assets/tech/` geschreven, en die map levert de server **alleen met een geldige technische cookie** uit.
Een gewone gebruiker kreeg 403 — en zag **geen enkel** logo op «Облікові записи». De buildpoort liet dat ook precies zien:
`openbare bundel …MailFunctionalView….js laadt ./tech/Logo-….js statisch`.

Inhoudelijk opgelost, niet met een omweg: `src/integraties/Logo.tsx` → **`src/merk/MerkLogo.tsx`**, `src/integraties/logos.ts` →
**`src/merk/merk-logos.ts`**. Merkvormen zijn niet technisch — alleen beheerpagina's blijven technisch. De grote tabel
wordt nog steeds lazy geladen, zodat de hoofdbundel niet groeit. De test `tech-assets` eist nu expliciet dat `src/merk/*` **niet** technisch zijn,
en `tech-assets-controle` is schoon: 5 technische bundels, 416 openbare, geen enkele statische verwijzing vanuit openbaar naar technisch.
Logo's voor ukrnet / i.ua / online.ua toegevoegd.

### 9. Één AI — één tabblad; het oude gedeelde adres

Het oude adres `/mcp` kwam uit `src/agenten/een-klik.ts` → `adressen()` (`${origin}/mcp`) en nog vijf andere plekken
(`AgentBord.tsx`, `McpServiceView.tsx` — drie hardgecodeerde strings, `mcp-catalog.ts`, `McpConnectorPanel.tsx`, `shared/ai-agent-bord.ts`).
Die halen het adres nu allemaal uit `agentUrl(slug)`. De literal `/mcp` is op **één benoemde** plek gebleven — `OUD_GEDEELD_URL` — en wordt alleen nog gebruikt
voor de uitleg bij 308 en voor «Andere client» die geen eigen pad heeft. De interface zegt dit rechtuit.

**Herindeling.** Nieuw `src/agenten/AgentPagina.tsx` — de plek `#agent/<slug>` binnen de bestaande hub (geen nieuwe pagina en geen nieuwe entiteit toegevoegd).
Op één tabblad staat alles over één AI: verbinding (eigen adres, kopiëren, status, opnieuw verbinden, intrekken, actieve koppelingen), rechten
(dezelfde `RechtenKiezer` — het formulier is geëxporteerd uit `ConnectorsTab`, geen kopie), ruimte, verbindingswijze en tokens, agentkleur
en het journaal van **specifiek deze** agent. Om niets dubbel te hebben: «Конектори» is nu alleen nog een lijst en bulkacties, de kaart leidt naar de agentpagina;
de gedeelde tabbladen (Пристрої, Зовнішні MCP, Розширення, volledig journaal) zijn gedeeld gebleven.

### Wat de eigenaar vóór de installatie moet weten

1. **Nieuwe verplichte variabele `MAIL_APP_WACHTWOORD_SLEUTEL_V1`** — zonder deze werkt een IMAP-koppeling niet (de rest van de site werkt wel).
2. **Extensie 0.6.2 moet samen met de release worden klaargezet**: `MIN_EXTENSIE_VERSIE` is verhoogd, dus 0.6.1 krijgt de balk voor een verplichte update.
3. **De eerste run van de Drive-cron** voor elke technische koppeling start opnieuw met `phase:'initial'` (de oude statusrij zonder `ruimte` wordt
   voor de technische lade niet gevonden). Dit zijn alleen metadata, tot 100 bestanden per pagina.
4. **Oude rijen van de Drive-projectie die voor een technische koppeling als persoonlijk zijn weggeschreven, blijven persoonlijk** — volgens de regel «bestaande rijen
   verplaatsen we nooit». In de persoonlijke hub kunnen dus nog namen van technische bestanden **uit het verleden** staan. Die verplaatsen is een apart,
   **expliciet** besluit van de eigenaar; ik heb dat zelf niet gedaan.
5. **Kiosksessies van Photos zijn nu aan een lade gebonden**: een selectie starten in de technische ruimte en afronden in de persoonlijke kan niet meer —
   dat geeft `GOOGLE_PHOTOS_SESSION_NOT_FOUND` in plaats van een stille import op de verkeerde plek.
6. **Volgorde**: eerst de release installeren, en pas daarna de cloudflared-regel voor de korte connectoradressen aanpassen
   (`deploy/CONNECTOR-EEN-PAD.md`).
7. De IMAP/SMTP-client is nooit tegen echte servers getest — het eerste om handmatig door te lopen.

---

## AE. Na installatie van 20261020-173704: connectorrechten, taal, meldingen, ontwerp, versleuteling (21.10.2026)

De eigenaar installeerde de vorige release en meldde: «alle eerdere rechten uit de connector zijn verdwenen», namen van hulpmiddelen in het Engels,
technische meldingen in de persoonlijke ruimte, AI-koppeling «verdwenen», admin /ai «niet geïntegreerd», logo's ontbreken of zijn pseudo,
«database is kapot», contrast en mobiele weergave stuk. Elke bewering is gecontroleerd; hieronder staat de **bewezen** oorzaak, geen gok.

### 1. «Rechten verdwenen» — de eigenaar kwam bij de serverdeur uit en niet bij de connector

Het toestemmingsvenster met «Технічний простір… Жодної пошти, Drive чи особистих пристроїв» en de twee blokken «Читання»/«Підписаний випуск» is het
venster van de **serverdeur** (`deploy/mcp/server.mjs`, poort 8091; precies 11 hulpmiddelen). Het verzoek kwam daar terecht omdat de tunnelregel
`^/(claude|chatgpt|…)` → 8091 op de server nog steeds actief is (de wijziging uit `deploy/CONNECTOR-EEN-PAD.md` §1 was niet uitgevoerd). Connector v2 bood al
beide kanten aan en sloeg ze op in de grant — hij werd alleen niet aangesproken. Bewezen met een live-aanroep: `host_status` via `mcp.tarasevych.com/claude`
antwoordde met de stem van de deur.

Onafhankelijk van de tunnel opgelost: de deur **stuurt** alle agentadressen (`/claude|gpt|grok|gemini|copilot|cursor`, `/ai/<agent>`, PRM,
OAuth-metadata) één-op-één door naar de app (`127.0.0.1:8080`); op `resource=…/claude` antwoordt de deur met `invalid_target`, zodat een client met
gecachete OAuth van de deur niet in een lus raakt. Het venster van de deur zegt nu eerlijk dat dit de oude route met 11 hulpmiddelen is.

**Oude `/mcp`-grants gaan niet verloren**: het token van het oude `/mcp` van dezelfde client werkt op `/<agent>` (`backend/connector-v2-erfenis.ts`),
de kanten zijn de vereniging van wat de gebruiker ooit heeft toegestaan; geen migratie nodig. **`notifications/tools/list_changed`**: `GET /<agent>` met
`Accept: text/event-stream` opent een stream en meldt een wijziging van de technische status (voor clients die zo'n stream openhouden).

### 2. Namen van hulpmiddelen — in het Oekraïens en Nederlands

De namen en beschrijvingen waren al vertaald, maar de **parameterbeschrijvingen** in alle 114 hulpmiddelen waren nog Engels, en de devtools-aliassen van het oude
`/mcp` hadden andere teksten dan dezelfde hulpmiddelen op `/claude`. Nu volgt de taal de eigenaar van de grant (taalinstelling van het account, standaard
uk), uit één tekstbron (`shared/hulpmiddel-teksten.ts`, parameters `p(uk, nl)` direct naast het veld). Een test loopt
114 × 2 kanten × 2 talen = 456 vertalingen langs en faalt op elk Engels woord.

### 3. Meldingen gescheiden tussen ruimtes (migratie 0091)

Elke melding krijgt bij het aanmaken een `ruimte` — op basis van de **bron** (29 soorten geclassificeerd: uitrol, SIEM, server, deur, kluis —
technisch; accountbeveiliging, inlogmethoden, «Це були ви?», mail, agenda — persoonlijk). Lezen, de teller van het belletje en «gelezen» gelden alleen
voor de actieve ruimte. Meldingen zijn **geen** aparte dienst geworden in «Scheiding van ruimtes»: de ruimte is een eigenschap van de bron, geen keuze van de gebruiker
(«gedeeld» zou exact de klacht opnieuw veroorzaken). Push-abonnementen zijn er niet in het project — de regel dekt 100 % van de aflevering.
**Oude meldingen zonder `ruimte` blijven persoonlijk** (regel 0082) — de eigenaar kan eenmalig «alles gelezen» kiezen.

### 4. AI koppelen — op één plek, met één klik waar die echt bestaat

Oorzaak van «verdwenen»: de agentpagina had alleen het adres en het rechtenformulier, zonder knop «Під'єднати» en zonder stappen voor de specifieke client; de status
telde alleen v2-grants mee, waardoor een koppeling via de deur of het oude `/mcp` als «niet verbonden» werd getoond. Op admin `/ai` was de oorzaak hetzelfde
(`backend/ai-beleid.ts` las alleen `mcp_oauth_tokens`), en zonder ingesteld beleid toonde de pagina nul agenten.

Nu begint elke pagina `#agent/<slug>` met «Під'єднати <ШІ>» (`src/agenten/verbind-recepten.ts`, uk+nl):
**Cursor** en **VS Code/Copilot** — echt één klik (deeplink); **Claude** — «Open Claude → Connectors» + opdracht voor Claude Code;
**ChatGPT** — Developer modus → Aanmaken (met eerlijke vermelding van het vereiste betaalde abonnement); **Gemini** en **Grok** — eerlijk: de consumentenversies accepteren geen eigen MCP's,
er staat een configuratie voor CLI-clients. De status is waarheidsgetrouw: v2 / oud `/mcp` / deur / geen — met etiket en knop «Oude intrekken».
admin `/ai` toont de status per agent in alle beleidsstaten, met een link naar de agentpagina. Verouderde instructies zijn verwijderd
(`claude.ai/code#customize`, «Customize → Connectors», kaart voor handmatig Bearer-token).

### 5. Logo's — «ontbrekende» waren zwart op donker, «pseudo» waren monogrammen

De logobundel laadde gewoon (200). «Ontbrekende» waren zwarte glyphs van GitHub/Anthropic/MCP op het donkere palet van het beheer: **1,15:1**. Nu geldt één
regel (`merkKleuren` in `src/merk/merk-register.ts`): een monochroom merk wordt getekend met `var(--text)`, een gekleurd merk in dezelfde tint,
opgetrokken tot ≥3:1; gecontroleerd over 181 merken × 26 paletten × 2 vormen = 22 230 metingen. «Pseudo» («RA», «S2», «IS») zijn geen merken
(REST API, SCIM, IMAP/SMTP) — vervangen door categorie-iconen; 20 lettertegels bij «Geheimen en sleutels» zijn vervangen door echte logo's.

### 6. Ontwerp: fundament (beslissing eigenaar: «fundament nu, pagina's één voor één»)

De wortel van «wit op wit»: **drie verschillende sets themavariabelen** op één pagina + ~170 gebruiken van variabelen **die nergens bestonden**
(`--soft`, `--canonical-*`, `--border`…) — in het donkere thema trad de lichte fallback-hex in werking, terwijl de tekst de lichte kleur van het donkere
thema erfde. Plus 13 blokken `prefers-color-scheme` (apparaatthema in plaats van sitethema).

Nu: één tokensysteem (`src/ontwerp/tokens.css`), globale primitieven (`primitieven.css`: knoppen, velden, kaarten, badges, schakelaar,
focus) en mobiele regels (`mobiel.css`). `scripts/kleur-contrast-controle.mjs` controleert 1898 paren in 26 paletten en **breekt de build af**
als een paar onder 4,5:1 (tekst) / 3:1 (iconen) zakt. Hex in pagina-CSS 2751 → ~2200 (het restant zijn hoofdzakelijk veilige fallbacks `var(--x,#hex)`),
lettergrootte < 12 px 514 → 0.

**Bewezen op de lokale proefstand** (151 pagina's/stappen × 3 formaten × 2 thema's × 2 talen = 997 opnames, axe-core + geometriecontrole):

| | VOOR | NA |
|---|---|---|
| contrast (schendingen / uniek) | 1151 / 424 | 0 |
| horizontaal scrollen | 327 / 18 | 0 |
| overlappingen | 67 / 7 | 0 |
| lettergrootte < 12 px | 513 / 59 | 0 |
| te kleine raakvlakken op telefoon | 1034 / 149 | 23 (allemaal deels achter de scrollrand verborgen; werkelijke grootte ≥44 px) |

Concreet: «Дозволити» 1,74 → 10,45:1; «Під'єднати» (mail) 2,25 → 8,06; cloud «Звично» 1,44 → 12,56; toestemmingskaarten 1,02 → 12,1.
Mail op 390 px: een rechterkolom van 320 px liet 0 px over voor de hoofdkolom — de begroeting liep **letter voor letter** terug, en de kolom zelf overlapte de tegels zodat er
**geen enkele kon worden aangetikt**; nu één kolom tot 1100 px. `/agenten`: tabbladrij van 1073 px op een scherm van 307 → scrollbare rij
met pijlen (`src/ontwerp/TabsRij.tsx`, uit de technische map gehaald omdat `src/uitrol/` alleen met een technische cookie wordt uitgeleverd).

**Volgende releases**: navigatie als geheel, ombouw van afzonderlijke pagina's op de nieuwe primitieven, lokale minipaletten per pagina.

### 7. Versleuteling van persoonsgegevens met een sleutel van de gebruiker (migratie 0092, beslissing eigenaar: «gebruikerssleutel + achtergrond tijdens sessie»)

Elke persoon × ruimte heeft een eigen gegevenssleutel (DEK) die **nooit onversleuteld op schijf ligt**. Hij wordt uitgepakt
met een passkey (WebAuthn PRF — in de browser) of met een herstelcode (scrypt, wordt één keer getoond, na gebruik wordt een nieuwe uitgegeven). Zolang
er een sessie open is of er een geldige AI-grant loopt, zit de sleutel in het servergeheugen — achtergrondsynchronisatie en agenten blijven werken. **Een beheerder met database, back-up en
env kan zonder inlog van de persoon niets onder de DEK lezen.** De technische DEK is een aparte sleutel; het technische profiel kan de persoonlijke niet uitpakken.

Onder de DEK in deze release (nieuwe items; oude worden via het oude pad gelezen, de knop «Перешифрувати мої дані зараз» zet ze om):
refresh-token van Google, IMAP/SMTP-wachtwoorden, CalDAV-wachtwoord, GitHub-tokens, ingeklapte vensters. Wat nog niet eronder valt staat met reden in het register op de pagina
(«Шифрування моїх даних», id.* → Способи входу).

Een herhaalde audit op lekken tussen profielen vond er nog één: **AI-mailvertaling** (`ai-vertaling-routes.ts`) las alle berichten van de eigenaar zonder
ruimte — in de technische ruimte kreeg de vertaling persoonlijke mail binnen. Gedicht.

### 8. «Database is kapot» — de echte oorzaak voor BYOS

Op de server van de eigenaar is de database intact (`db:true`, migraties 0001→0092 zonder fouten). Maar op een **schone** PostgreSQL 16-database liep de installatie vast op
`0007_rls_per_tabel.sql` (`ALTER COLUMN … SET EXPRESSION` is PG17-syntaxis; Ubuntu 24.04 LTS levert PG16). Voor een nieuwe
BYOS-gebruiker was de database dus echt «kapot». De migrator controleert geen checksums, dus 0007 is veilig herschreven: op PG17 draait
letterlijk de oude opdracht, op PG16 het equivalent met controle op afhankelijkheden; al bijgewerkte databases herlezen 0007 niet. De installer controleert
de versie **vóór de back-up en migraties** en meldt rechtstreeks «PostgreSQL verouderd», het minimum is 16. Bewezen: de echte migrator doorliep op een schone PG16
0001→0092 + rechten.sql zonder shim.

Een **andermans fout in 0092** gevonden en hersteld: het herdefiniëren van `passkey_uitdagingen_doel_check` verloor de waarde
`'extensie-ontgrendelen'` (0072) — het ontgrendelen van de extensie met een passkey zou direct na de migratie stuk zijn gegaan.

Daarnaast: een vaste 404 op `/downloads/extension-version.json` — `vite build` wiste `dist/downloads/`; nu genereert een build-plugin dit bestand altijd.

### 9. Verbindingsassistent en geheimen op de server

admin → «Інтеграції» → **«Майстер під'єднань»**: voor Google, Microsoft, GitHub OAuth en GitHub App — knop «Відкрити консоль», kant-en-klare
waarden om te kopiëren (redirect URI, origins, scopes uit `SERVICE_HOSTS`), veld voor client id/secret (Google en GitHub — direct op de site met
passkey, zonder herstart; Microsoft — voorlopig alleen met een serveropdracht met verborgen invoer), en een **echte** controle via het token endpoint.
Klikken in de console van de aanbieder blijft onvermijdelijk — daar zijn inlog en toestemming van de eigenaar vereist.

`deploy/geheimen-aanmaken.sh` (installatiestap vóór de migraties) genereert **alleen ontbrekende** sleutels en print uitsluitend namen en vingerafdrukken;
`deploy/geheimen-register.sh` stelt het register **zonder waarden** samen. Nu verplicht en automatisch gegenereerd:
`MAIL_APP_WACHTWOORD_SLEUTEL_V1`, `AGENDA_ABONNEMENT_SLEUTEL_V1`, `SLEUTELKLUIS_SLEUTEL_V1`.

### Wat de eigenaar vóór en na de installatie moet weten

1. **Claude opnieuw verbinden** (`mcp.tarasevych.com/claude` verwijderen en toevoegen, of «Reconnect»): het huidige token is door de deur uitgegeven; na de release
   antwoordt de app daarop met 401 en doorloopt Claude OAuth via het v2-venster met beide ruimtes. Start een nieuw gesprek zodat Claude de
   lijst met hulpmiddelen opnieuw inleest.
2. Voer evengoed `deploy/CONNECTOR-EEN-PAD.md` §1 (tunnelregel) uit — **na** de installatie van de release.
3. Na de installatie: id.* → Способи входу → «Шифрування моїх даних» → aanzetten, **herstelcode bewaren** (verlies van de code én alle
   passkeys = onherroepelijk verlies van de gegevens onder de sleutel — niemand, ook de beheerder niet, kan ze herstellen), passkey toevoegen, «Перешифрувати мої дані зараз»;
   herhaal dit in de technische ruimte.
4. Oude ongelezen technische meldingen verschijnen één keer in het persoonlijke belletje (regel «rij zonder ruimte is persoonlijk»).
5. Minimale versie van PostgreSQL is 16.
6. Sleutel `SLEUTELKLUIS_SLEUTEL_V1` na het aanmaken nooit verwijderen of roteren.

---

## AF. Mail op de telefoon: elf opmerkingen van de eigenaar na 20261021-054108 (21.10.2026)

Elke klacht is op de lokale proefstand (390 px en 1280 px, beide thema's) vóór de aanpassing gereproduceerd en erna gecontroleerd. Hieronder staat de bewezen oorzaak.

### 1. Meldingenpaneel: voor de lijst bleef 150 px over

Zoeken, filters, zeven sectieknoppen, «Порядок» en vier brede knoppen onderaan namen 586 px van de 844 in beslag — in het zichtbare gebied paste **één**
meldingsrij. Nu is dit op de telefoon een schermvullend blad: compacte kop met «⋯» (geluid, types, terug naar de hoek, alles markeren), één
scrollbare rij chips, en zoeken, secties en volgorde zitten achter de knop «Фільтри» met een teller. **Lijst: 150 → 712 px (6 rijen in plaats van 1).**
Desktop ongewijzigd.

### 2. De knop «Новий лист» versprong

De positie werd tegelijk door **vier** mechanismen bepaald (de functie «naast het belletje», het ontwijkregister dat de knop midden in de animatie opmat,
een `!important`-regel voor smalle schermen en de versleepte positie uit de browser) — wie het laatst kwam, won. Op 390 px lag de knop bovenop
het belletje en ving de tikken af. Nu is er één zuivere functie: de knop staat altijd boven het belletje; als het belletje daarheen is gesleept,
gaat hij naar de hoek. Gecontroleerd met een reeks metingen en na het openen/sluiten van het paneel. **De knop «Новий лист» kan niet meer worden versleept** (bewust).

### 3. Foto in «Поштові скриньки» was platgedrukt

De fotowrapper had de klasse `small` — en dat is een globale **knop**-modifier met een padding van 11,2 px. Van de 40 px breedte bleef 17,6 over.
Nu werken knopmodifiers alleen nog op knoppen en links, en hebben alle foto-avatars één regel (`aspect-ratio:1; object-fit:cover`).
**17,6×40 → 40×40.**

### 4. Menu «Інші дії» (⋮): knoppen van andere berichten lagen bovenop het menu

Het menu leefde binnenin de rij, waardoor volgende rijen eroverheen werden getekend. Op de computer was het nog erger: een bovenliggende `transform` verschoof het menu
met **2147 px bij een breedte van 1280** — het was helemaal buiten beeld. Nu wordt het menu bovenop alles gerenderd, binnen het scherm, zijn de items gelijk,
past de tekst erin en kruipt het bolletje «ongelezen» niet meer onder ⋮. De naam van de afzender krijgt voorrang boven het adres.

### 5. Nieuw bericht: menu viel weg, knoppen ovaal, scrollen onzichtbaar

- Uitklapmenu's (vanuit «⋯» en lijsten) werden door de container afgekapt — op 390 px was er van de 15 items geen enkel zichtbaar. Nu liggen ze bovenop alles.
- Icoonknoppen: de regel `width:auto !important` at de breedte op (de paperclip was 19×36). Nu zijn ze allemaal 44×44.
- Werkbalk: past op de telefoon volledig (zeldzame acties zitten in «⋯»), en wanneer hij niet past zijn er een pijl en schaduw zichtbaar.
- **Sjablonen op de telefoon** staan als eerste sectie in «⋯» (ze stonden daar eerder ook al, maar het menu werd afgekapt). Los daarvan: in het donkere thema hadden de sjabloonblokken
  een contrast van **1,01:1**.
- Cc/Bcc zitten op de telefoon achter een knop verborgen, er is «inklappen» en ingevoerde adressen worden op één regel getoond.

### 6. Ingevoerde tekst verdween

De tekst werd wel opgeslagen, maar na herladen ging het venster niet vanzelf open, en tikken op «Чернетка» opende een **nieuw** leeg bericht.
Bovendien werd er niet weggeschreven bij `visibilitychange` — terwijl een mobiele browser bij het uit het geheugen halen van een tabblad vaak alleen dat gebeurtenis stuurt.
Nu: een lokale kopie apart per account en ruimte (alleen geadresseerden, onderwerp en tekst — geen bijlagen of wachtwoorden), opslaan na
300 ms en synchroon bij het verlaten van de pagina; serverconcept met herhaalpogingen; na herladen opent het venster met dezelfde
tekst. Indicator: «Збережено локально · на сервері о HH:MM».

### 7. Extra Google-account: «Не вдалося розпочати під'єднання»

Het venster stuurde altijd de rol «primair» mee en gaf niet door waar het verzoek vandaan kwam. Omdat het primaire Gmail-account van de eigenaar al gekoppeld is,
antwoordde de server met «al verleend» zonder doorstuuradres — en het venster zag dat als een fout. Een **ander** Google-account kiezen was
in principe onmogelijk. Nu komt de rol uit de werkelijke status, toont Google de accountkeuze en heeft elke weigering van de server een eigen uitleg in uk+nl.

### 8. Accounts ontkoppelen

Elk gekoppeld account heeft een status, «Перепід'єднати», «Вимкнути» (met de keuze «lokale gegevens behouden / verwijderen»; voor het primaire account
een directe waarschuwing dat het inloggen op de site niet wordt geraakt), en elke groep heeft «Додати ще один». Nieuwe ontkoppelroute voor Google; postvakken
met ingetrokken toegang **verdwenen eerder stilzwijgend** uit de lijst — ze zijn nu zichtbaar en kunnen worden ontkoppeld.

### 9. Aparte sectie «Додаткові облікові записи Microsoft» — verwijderd

De tegel Outlook en «Додати ще один Outlook» doen via het venster precies hetzelfde.

### 10. Logo's: 21 zelfgetekende verwijderd

Outlook, Ukr.net, I.ua, Online.ua, Yahoo en nog 16 andere (OneDrive, Teams, Windows, Edge…) waren **in code nagetekend** — imitaties van andermans
logo's. Ze zijn verwijderd; in plaats daarvan staat er één consistente neutrale tegel (beginletters van de naam op de merktint, contrast ≥ 4,5:1). De echte
(uit open sets met eerlijke herkomst) zijn gebleven: Gmail, iCloud, Proton, Google, Apple, AI-agenten.

**Eigen logo's voor BYOS:** de beheerder plaatst officiële merkbestanden (SVG/PNG tot 200 kB) in `/srv/mijn-ruimte/merk-eigen/`
of uploadt ze op admin → Інтеграції → «Власні логотипи сервісів» (passkey). SVG wordt geschoond; bestanden met scripts, externe
verwijzingen e.d. worden met uitleg geweigerd.

### 11. Terloops

- `tests/e2e/connector-v2.e2e.ts` deed een verzoek **buiten Chrome om** — dat kon het echte `mcp.tarasevych.com` bereiken, waardoor de
  lokale e2e-runner weigerde te starten. Omgezet naar een lokaal verzoek.
- Kleuren van bijlagetypes en kleine tekst in de berichtrij staan nu op tokens, ≥ 12 px.

### Wat de eigenaar moet weten

1. De knop «Новий лист» kan niet meer worden versleept — hij staat altijd boven het belletje.
2. De pictogrammen voor Windows/Edge op de sessiepagina en Outlook/Ukr.net e.d. op de accountpagina zijn nu neutrale tegels. Echte logo's verschijnen
   alleen als u zelf officiële bestanden plaatst.
3. De lokale kopie van een bericht ligt in de browser van het apparaat (onversleuteld, net als voorheen) en wordt gewist na verzenden, verwijderen of na 30 dagen.
4. De echte Google-inlog voor een extra account is alleen tegen een Google-imitatie getest — doorloop die één keer zelf.

---

## AG. Onafhankelijke reviews, echte logo's, vensterdock en alle «in ontwikkeling»-rechten (21.10.2026)

### 1. Beveiligingsreview met een frisse blik — 8 echte problemen, waarvan twee met hoge ernst

| # | Wat | Ernst |
|---|---|---|
| 1 | In de mailroutes gaf `ladeOf` altijd de **persoonlijke** lade terug (mail heeft een eigen AsyncLocalStorage). Een technisch tabblad met mail op «eigen gegevens» zag het persoonlijke Gmail-account, en met de nieuwe ontkoppelroute kon vanuit de technische ruimte **het persoonlijke Gmail-account worden ontkoppeld en het token worden ingetrokken** | hoog |
| 2 | De erfenis van oude `/mcp`-grants herkende de client aan `client_name`, die de client zelf opgeeft. Een app «Evil (Claude)» met alleen privétoestemming kreeg op `/claude` de **technische** hulpmiddelen van de echte Claude (31 sleutels). Nu geldt erfenis alleen voor exact dezelfde door de server uitgegeven `client_id` | hoog |
| 3 | Serverdeur: het pad `/x/..//oauth2/token` gaf SSRF naar de interne naam `oauth2`/`mcp`; hop-by-hop-headers van de client werden doorgestuurd | middel |
| 4 | «Uitloggen in de hele browser / uit alle accounts» sloot de gegevenssleutel in het geheugen niet | middel-laag |
| 5 | Lokale concepten overleefden «Uitloggen» op een vreemd apparaat | middel-laag |
| 6 | SVG-opschoning controleerde de ruwe tekst — 9 omwegen via entiteiten en CSS-escapes | laag |
| 7–8 | Onbeperkt schrijven van eigen logo's; headers van de deur | laag / verharding |

Elke bevinding heeft een aanvalstest: op de code vóór de review **16/41**, erna **41/41**.

### 2. Toegankelijkheidsreview (WCAG 2.2 AA)

De focus raakte zoek of ontsnapte in het meldingenpaneel, het berichtvenster (14–18 keer per Tab-rondgang), de menu's van de editor en de berichtrij; menu's hadden verkeerde rollen (axe: critical); 25 identieke knoppen «Інші дії» zonder context; **globaal**: Escape verplaatste op elke willekeurige pagina de focus naar de avatar van het accountmenu. Alles opgelost; axe erna — 0 schendingen, 6 toetsenbordscenario's op 390/1280 in uk en nl geslaagd.

### 3. Logo's — echt, niet nagetekend (beslissing eigenaar)

- **14 merken** zijn overgenomen uit open pakketten met officiële logo's onder een eerlijke licentie (`@iconify-json/logos` — CC0; `@iconify-json/vscode-icons` — MIT): Windows, Edge, Microsoft, Node.js, OneDrive, Teams, Azure, Yahoo, monday.com, Pipedrive, Webhook, OAuth, Outlook, OneNote. Het script `scripts/merk-officieel-maken.mjs` tekent niets — het neemt het bestand één-op-één over, haalt het door de SVG-opschoning en legt de herkomst (pakket, versie, licentie, sha256) vast in `src/merk/officieel/HERKOMST.json`.
- **Logodatabase van de site** (`app.merk_beeld`, migratie 0097): voor een domein haalt de server **zelf** het officiële logo op — eerst BIMI (DNS `default._bimi.<domein>`, precies waarvoor bedrijven hun beeldmerk publiceren), daarna iconen van de website van het domein, daarna `favicon.ico`; cache 30 dagen. Zo komen Ukr.net, I.ua, Online.ua, Entra, Fastmail, Freshdesk, Mollie en Tuya binnen — vanaf hun eigen domeinen op de server van de eigenaar. De neutrale tegel verschijnt alleen tot de eerste geslaagde ophaling. Beveiliging van uitgaande verzoeken: alleen https, alleen publieke IP's met verbindingspinning, ≤3 redirects, 5 s, 256 kB.
- **Afzenderfoto's** (`app.afzender_beeld`, apart per persoon en ruimte, adres alleen als HMAC, onder de sleutel van de persoon): organisatielogo van de afzender (BIMI/domeinicoon), foto uit Google Contacten (People API, standaard uit, incrementele toestemming; standaard «lege» foto's worden overgeslagen), vCard, Gravatar (standaard uit). De browser laadt niets van buitenaf — alles loopt via de server.
- Volgorde van voorrang: eigen bestand van de eigenaar → ingebouwd officieel → vorm uit de open set → sitedatabase → neutrale tegel.

### 4. Het dock van ingeklapte vensters ligt niet meer over knoppen heen

Het dock had een z-index **boven alle vensters**, stond altijd uitgeklapt en was niet te verplaatsen; bovendien tilde de regel `bottom:84px !important` het precies naar de hoogte van de knoppen. Op 360/390 px waren van de 15 knoppen van het toestemmingsvenster er maar 2–3 te raken. Nu: op de telefoon een balk van 44 px onderaan waarvoor vensters ruimte vrijhouden; de lijst klapt pas bij aanraken open; het dock kan naar elke rand worden gesleept (ook met de «verplaatsen»-knoppen via het toetsenbord), de positie wordt onthouden; een geopend venster staat niet dubbel in de lijst. De knoppen van het toestemmingsvenster zitten onderin het venster vastgezet. **15/15 op 360, 390 en 1280.** Terloops: het inklappen van vensters op mcp.* en mail.* werd niet bewaard (403 door een hardgecodeerde dienst `hub`).

### 5. Alle 17 rechten «in ontwikkeling» zijn nu echte hulpmiddelen

**Gemeenschappelijke wachtrij «bevestigen op de site»** (`app.ai_bevestiging`, migratie 0098): de AI maakt een verzoek aan → de gebruiker ziet het in de AI-sectie en in de meldingen van zijn ruimte → «Bevestigen» (bij hoog risico met passkey) of «Afwijzen» → pas dan voert de server het uit. Parameters zijn onveranderlijk (hash), een verzoek is niet vanuit een andere ruimte of door een andere gebruiker te bevestigen, geldigheid 30 min, parameters worden versleuteld.

| Recht | Hulpmiddel | Bevestiging |
|---|---|---|
| Berichten verzenden | `mail_send` | altijd, passkey |
| Bestanden aanmaken / uploaden op Drive | `drive_create_file`, `drive_upload_file` | standaard ja |
| Bestanden delen | `drive_share_file` («iedereen met de link» alleen via een apart vinkje, nooit met schrijfrechten) | altijd, passkey |
| Door u gekozen foto's | `photos_picked_media` (Google Photos Picker — de gebruiker kiest) | altijd |
| Afspraken uit iCloud | `icloud_list_events` (CalDAV, app-wachtwoord) | nee (lezen) |
| Pull verzoek | `github_pr` (geen merge, geen wijzigingen in `.github/workflows`) | passkey |
| CI-logboeken | `github_ci_logs` | nee |
| Eigen domein voor een app | `app_domain` (technisch) | passkey + serveropdracht |
| Afbeeldingen | `image_generate` (lokale generator op uw server; zonder die volgt een eerlijke foutmelding) | «vragen» |
| Diagrammen | `diagram_generate` (Mermaid, controle op de server, rendering zonder CDN) | «vragen» |
| Ontwerpcontext | `screenshot_design` (alleen stijlen) | nee |
| Betalingen | `payments_list` (Stripe, alleen beperkte sleutel `rk_`) | nee |
| Beveiligingsjournaal | `audit_read` (IP's en adressen gemaskeerd) | nee (technisch) |
| Gebruikers | `users_manage` (de eigenaar kan nooit worden aangeraakt) | passkey bij elke actie |
| Featureflags | `flags_manage` | ja |
| SIEM-status | `siem_status` | nee (technisch) |

Nieuwe hulpmiddelen worden niet door oude grants geërfd — elk ervan moet expliciet voor de agent worden aangezet; buiten het ondertekende AI-beleid zijn ze onzichtbaar. Migratie 0095 — instellingen van de lokale generator en eigen domeinen.

### Wat de eigenaar moet weten

1. **Google: klik op «Toegang verlenen»** voor het verzenden van mail, schrijven naar Drive en de Photos Picker (oude grants hebben deze scopes niet), en zet voor foto's uit Google Contacten de People API aan in uw eigen Google Cloud-project.
2. **iCloud:** app-wachtwoord van appleid.apple.com → agenda → «Під'єднати iCloud».
3. **Het AI-beleid moet opnieuw worden ondertekend** zodat de nieuwe mogelijkheden (`mail.send`, `drive.write`, `drive.share`, `photos.read`, `media.*`, `payments.read`) actief worden.
4. **Stripe:** beperkte sleutel met leesrechten in de verbindingsassistent. **Afbeeldingsgenerator:** start uw eigen lokale dienst en vul het adres in het beheer in.
5. **Eigen domein voor een app:** `sudo /usr/local/sbin/mijn-ruimte-installeer app-domein <host>` en een CNAME naar de tunnel.
6. **De logo's van Ukr.net, I.ua en Online.ua** komen vanaf hun eigen domeinen binnen na de eerste weergave op uw server (vanaf hier kon ik ze niet ophalen — hun servers gaven een fout terug). De schakelaar zit onder admin → Інтеграції → «Логотипи відправників».
7. **Gmail in de technische ruimte met mail op «eigen»** is nu leeg totdat Gmail specifiek daar wordt gekoppeld (voorheen zag de technische kant het persoonlijke account — dat was lek #1).

### 6. Samenvoeging met releases van een andere agent (20261021-183141 / 191053 / 204442, «buiten git»)

Terwijl deze release werd voorbereid, zijn er op de server drie pakketten van agent grok geïnstalleerd met **volledig zoeken `/zoek`** (kern, synoniemen, rangschikking, bronnen, OCR, wachtrij, pagina met filters en geschiedenis; migraties `0093_zoek_index`, `0094_zoek_rls`, `0096_zoek_bronnen_index`). Die waren buiten git om gebouwd, dus deze release **bevat ze volledig** (anders zou de installatie het zoeken terugdraaien): nieuwe bestanden zijn één-op-één overgenomen, acht gewijzigde bestanden zijn via een driewegsamenvoeging met basis `6aabff9` samengevoegd (geen conflicten; `CloudFunctionalView.tsx` automatisch samengevoegd). De migratienummers `0093`/`0094` botsten met de mijne — de voorcontrole van het pakket weigerde terecht («dubbel nummer»), daarom zijn mijn drie migraties hernummerd naar `0097_merk_beeld`, `0098_ai_bevestigingen`, `0099_dev_rechten_media_github` (op de server van de eigenaar waren ze nog niet toegepast, dus hernoemen is veilig); gecontroleerd op een schone database (0001→0099 zonder fouten, tweede run — «niets te doen»). Drie kleine aanpassingen aan de code van grok: ongebruikte imports (`tsc` met `noUnusedLocals`) en een samenvattingsregel in de test `zoek-etap-d` zodat de volledige testrun hem meetelt.

## AH. Globaal zoeken «/zoek» volgens de specificatie van de eigenaar: audit, kern, bronnen, OCR, geschiedenis, isolatie (22.10.2026)

Opdracht van de eigenaar — «MIJN RUIMTE GLOBAL ZOEKEN» (19 hoofdstukken): één veld dat **een functie van de site vindt zonder de structuur ervan te kennen**
(«taal wijzigen», «wie is er op mijn account ingelogd geweest», «herstelcodes als ik mijn telefoon kwijtraak»), berichten en bijlagen, bestanden, afspraken, het bord, GitHub —
in negen talen, met typefouten, soerzjyk en transliteratie, met een eerlijk overeenkomstpercentage, aanvullen, correctie, geschiedenis op
de server en volledige isolatie tussen ruimtes. Vijf zones werkten parallel (Z1 kern, Z2 bronnen en UI-catalogus, Z3 tekst/OCR/archieven,
Z4 pagina en palet, Z5 kwaliteitsmeting, prestaties, isolatie, documentatie), waarna Z1/Z2 de door Z5 gevonden hiaten hebben gedicht.

### 1. Audit van wat er stond (grok-releases 183141/191053/204442)

De pagina `/zoek` bestond, maar: twee ongevulde indexen (`0093 zoek_objecten`, `0096 zoek_document`), de SQL-functie `app.zoek_norm`
liep stuk bij `datctype=C`; het daadwerkelijke zoeken liep **in het geheugen** over ≤ 1 000 rijen per bron; wachtrij en adapters waren dode code; het percentage
`score·10` liep op tot 1 000 %; aanvullen kwam op de client uit de huidige resultaten; de geschiedenis lag in `localStorage` **zonder koppeling aan de gebruiker**
(lek tussen accounts op hetzelfde apparaat); OCR was alleen een knop (`AI_NOT_CONFIGURED`); geen enkele test met twee gebruikers; geheimen werden niet
gefilterd. Volledige audit: `rapporten/zoek-audit.md` (lokaal) → bevindingen in `docs/zoek/ZOEKEN.md` §1.

### 2. Wat er is gebouwd

| Laag | Was | Wordt |
|---|---|---|
| Index | twee lege indexen, zoeken in het geheugen | **één** `app.zoek_objecten` (migratie `0100_zoek_kern`): titels en tekst worden in Node genormaliseerd (`*_norm`), `zoek_vector` (simple) + `zoek_stam` (stemmers nl/en/de/fr/ro/ru + lichte achtervoegsels uk/bg/pl) als GENERATED-kolommen, trigram voor fuzzy zoeken; `0104_zoek_gin_lade` — `btree_gin`, lade + full-text in één index |
| UI-catalogus | handmatige lijst | generator `scripts/zoek-ui-catalogus.mjs` leest `src/**/*.tsx` → `shared/zoek-ui-knoppen.generated.ts` (**1 132** knoppen/koppen/dialogen met beide talen en locatie) + `backend/zoek/catalogus-ui.ts` (**1 670** objecten: pagina's, tabbladen, secties, instellingen, «?»-uitleg, AI-rechten, integraties) met intentiewoordenboek `INTENTIES` (≈55 pagina's uk/nl/en/ru + soerzjyk). Actualiteitscontrole in `npm run build` en in de test |
| Talen | translit + 17 synoniemgroepen | 9 talen (uk, nl, en, ru, bg, pl, de, fr, ro): normalisatie cyrillisch↔latijn, diakrieten, `varianten()` van soerzjyk/transliteratie in de zoekopdracht, **166 synoniemgroepen**, stopwoorden, lichte morfologie |
| Rangschikking | twee verschillende formules TS/SQL | één formule (`shared/zoek-rangschikking.ts`, `docs/zoek/ZOEKEN.md` §6): exacte titel > volledige frase > prefix > titelwoorden > tekst > synoniem > fuzzy; `percent = round(100·(score/max)^0,75)` — monotoon ten opzichte van de beste treffer **in deze zoekopdracht**; «Чому релевантно» op de kaart uit exact dezelfde signalen |
| Aanvullen / correctie | client | server vanuit de lade van de gebruiker (`/api/owner/zoek/suggesties`): functies, pagina's, categorieën, correcties (transposities, transliteratie → origineel), ≤ 3 verzoeken op 12 tekens (debounce), ARIA-listbox |
| Filters / facetten / paginering | client bovenop ≤ 80 resultaten | server: `bronnen/soorten/formaten/talen/sinds/tot/minPercent/sorteer/pagina`, `facets`, `totaal`; op de telefoon een onderblad (`role=dialog`, focus-trap, Escape) |
| Geschiedenis | `localStorage` | `app.zoek_geschiedenis` (`0103`, RLS, per lade): slaat alleen `(bron,id)` + filters op; opnieuw openen **herberekent** tegen de actuele index en toont «nieuw — N, niet meer beschikbaar — M» (`nieuw`/`weg`); «Очистити історію»/«×» |
| Bronnen | 4 in het geheugen | via de wachtrij `app.zoek_wachtrij` (`0101`: cursors, `wacht_reden`, lease, herhaalpogingen) en cron `zoek-index` (*/5, timer `mijn-ruimte-zoek-index.timer`): interface, Gmail-berichten en bijlagen, eigen opslag, Google Drive, agenda (Google + ICS/CalDAV), bord, GitHub (repo's/README/issues/PR); status van elke bron met voortgang (`/api/owner/zoek/stand`, paneel «Стан джерел») |
| Tekst, OCR, archieven | knop zonder engine | `backend/zoek/{tekst-extractie,tekst-kern,tekst-werker}.ts`: PDF (tekstlaag via pdfjs), DOCX/XLSX/PPTX, TXT/MD/CSV/HTML, zip/tar/gz (bescherming tegen zip-bommen, `../`, diepte) — in een **worker-thread** met geheugen- en tijdslimiet; OCR `backend/zoek/ocr-engines.ts`: systeem-`tesseract` → `tesseract.js` → platform-AI, cache `app.zoek_ocr_tekst` (`0102`, per gebruiker/ruimte/sha256), talen worden geïnstalleerd met `sudo mijn-ruimte-installeer ocr-talen` (`deploy/ocr-talen-installeren.sh`, tessdata met SHA-256). Zonder engine meldt de bron eerlijk «OCR niet beschikbaar» |
| Geheimen | — | één lijst `shared/geheim-patronen.ts` (PEM, `ghp_`, `sk_live_`/`pk_`, JWT, `password=`, verbindingsstrings) — gemaskeerd **vóór** de index, in fragmenten en in suggesties |
| Pagina / palet | oude `SearchPage` + paneel «Overal zoeken» met eigen zoekfunctie | `src/search/{ZoekPagina,ZoekVeld,ZoekKaart,ZoekFilters,ZoekGlobaal}.tsx`: pagina `hub/zoek` volgens het ontwerp van de eigenaar (categorieën met tellers, kaarten met percentage, facetten, bronstatus, geschiedenis, tip), palet ⌘K/Ctrl+K vanaf elke pagina (één voor hub/mail/cloud…; `GlobalSearchPanel` is een dunne schil), `?focus=<hulpsleutel>` licht het gevonden element op de doelpagina uit (`src/platform/focus-doel.ts`); ontwerptokens, axe 0 op 390/1280 |
| Documentatie | — | `docs/zoek/{ZOEKEN,ZOEK-BEVEILIGING,ZOEK-BEHEER,ZOEK-UITBREIDEN,ZOEK-TESTEN}.md`, `ENV-VARS.md` («Zoeken», alle `ZOEK_*`), `SECURITY-NOTES.md` (sectie Z), `deploy/LEESMIJ.md` |

### 3. Isolatie — bewezen, niet beloofd (`tests/eenheid/zoek-isolatie-20261022.test.ts`, 49/49 met gewone pool en onder RLS)

Twee gebruikers met identieke documentnamen en identieke zoekopdrachten: nul overlap in resultaten, `totaal`, facetten, suggesties,
correcties en geschiedenis. `userId`/`ruimte`/`lade` in de request-body worden genegeerd — de lade komt uitsluitend van de server (dezelfde poort als bij mail/cloud).
Een technisch tabblad ziet niets persoonlijks en omgekeerd; een gesloten dienst wordt niet doorzocht en wordt in `gesloten` benoemd met hetzelfde vlak als de hubblokken
(`RuimteGeslotenVlak`); na ontkoppelen/verwijderen verdwijnt de rij uit de index, de suggesties en de geschiedenismomentopname (`weg`). 18 omzeilings-/injectiepogingen →
200/400 zonder andermans rijen. Rechtstreekse `SELECT/UPDATE/INSERT` door de rol app op `zoek_objecten`, `zoek_geschiedenis`, `zoek_ocr_tekst`,
`zoek_wachtrij`, `zoek_bron_stand` → 0 rijen/weigering. Gesloten gegevenssleutel (sleutelkluis 0092) → indexering van mail/Drive leest niets,
het item wacht met de status «wacht op inloggen». Bewuste beperking (net als bij de bestaande projecties): de index bewaart platte tekst onder RLS; de cron
draait met de systeempool en een expliciete `WHERE user_id AND ruimte`.

### 4. Kwaliteit en snelheid — cijfers van de eindrun (22.10, definitieve boom)

- **Evaluatie** (`tests/eenheid/zoek-evaluatie-20261022`, 82 zoekopdrachten met verwachtingen, 12 categorieën): **P@5 = 0,981, MRR = 0,933, Recall@20 = 0,994**
  (drempels 0,80 / 0,75 / 0,85). Vóór de aanpassingen van Z1/Z2 was dit 0,66 / 0,55 / 0,75: doelbeschrijvende zoekopdrachten («waar zie ik wie er is ingelogd») haalden 0,13,
  soerzjyk 0,25, synoniemen 0,33 — nu 1,00 / 1,00 / 0,92. Lekken: 0, geheimen gemaskeerd.
- **Snelheid** (`zoek-prestaties-20261022`, 10 000 objecten in één lade): zoeken p50 116 / **p95 209 ms** (doel 300; vóór 0104 was het 463, vóór
  de optimalisaties van Z1 — 1 069), met facetten 119/207, slechtste geval 329 ms, suggesties p50 68 / p95 83 ms, indexering 1 635 obj./s.
- **Isolatie** 49/49; **kern** 28/28 + 68/68; **bronnen** 40/40 + 45/45; **tekst/OCR/archieven** 79/79; **pagina** 54/54 + 15/15;
  `uitrol-voorcontrole` 29/29; regressie `beveiliging-review` 41/41, `ruimte-scheiding` 76/76, `tech-ruimte-pagina` 56/56,
  `ontwerp-fundament` 34/34, `contrast-knoppen-logos` 38/38, `hulp-register` 17/17; `tsc` beide configuraties — 0 fouten.
- **Proefstand** (`tests/e2e/hulp/stand-zoek.ts`, schone database, 390 en 1280, licht/donker, uk/nl): `zoek-begin` (bronstatus met voortgang en
  fout), `zoek-autocomplete` (listbox, ≤ 3 verzoeken), `zoek-resultaten-filter` (chips, percentages, markering, «Чому релевантно»),
  `zoek-niets`, `zoek-geschiedenis` (`nieuw`/`weg`), `hub-zoeken` (palet) — schermafbeeldingen in `rapporten/stand/ZOEK-F`.

### 5. Wat er in fase F is gerepareerd (na het draaien van de volledige testsuite op de samengevoegde boom)

- `backend/zoek/tekst-extractie.ts`: het pad naar de workerbundel `dist-server/zoek-werker.mjs` was relatief — `new Worker()` wees het af
  (`ERR_WORKER_PATH`), en **elk** bestand kreeg de status «fout» zodra er naast de code een gebouwde `dist-server/` stond. Het pad is nu altijd
  absoluut (`zoek-bronnen-etap-c` 39/40 → 40/40, `zoek-tekst` 79/79 via de echte achtergrondproces).
- `src/search/ZoekPagina.tsx`: een gesloten dienst wordt met hetzelfde `RuimteGeslotenVlak` getoond als de hubblokken; `1 об'єкт / 2 об'єкти /
  5 об'єктів` in plaats van «1 об'єктів» (nl: `1 object / 2 objecten`).
- `src/search/zoek.css`: op de telefoon lag het zwevende meldingsbelletje over de knop «Показати результати» van het onderste filterblad —
  het wordt nu verborgen zolang het blad open is (net als in het berichtvenster).
- `tests/eenheid/tech-ruimte-pagina-20261020`: twee statische controles wezen naar oude bestanden (`GlobalSearchPanel` is een schil geworden;
  `herkomstUitBody` wordt op een aparte regel berekend), en twee controles vergeleken de **volledige** antwoord-JSON waarin ook de zoekopdracht zelf zit — nu worden
  alleen de resultaatgroepen vergeleken; de dekkingsregel ≥ ½ groepen (gedeelde woorden «geheim-<sfx>») was geen lek maar een gedeeltelijke overeenkomst met een lager percentage.
- `vite.config.ts`: `reportCompressedSize:false` — het berekenen van de gzip-grootte na de build liet vite crashen op 2,5 GB heap (de installerlimiet `BOUW_HEAP_MB`).

### 6. Migraties van deze release

`0100_zoek_kern`, `0101_zoek_bron_cursor`, `0102_zoek_ocr_tekst`, `0103_zoek_geschiedenis`, `0104_zoek_gin_lade` (+ `rechten.sql`:
GRANT's voor de nieuwe tabellen). Allemaal idempotent, met terugdraai-instructies bovenin elk bestand; de index bestaat uit afgeleide gegevens, `TRUNCATE app.zoek_objecten`
is altijd veilig en de cron bouwt hem weer op. Brongegevens worden nooit verplaatst. De grok-migraties `0093/0094/0096` blijven staan (0096 `zoek_document` is
leeg en gemarkeerd als verouderd; te verwijderen in de volgende release).

### Wat de eigenaar moet weten

1. Na de installatie vult de eerste cron (≤ 5 min) de index; tot die tijd toont `/zoek` «wordt geïndexeerd» en werken de hubblokken zoals voorheen.
   De eerste volledige doorloop van een grote mailbox duurt uren (limieten per run staan in `ENV-VARS.md`).
2. **OCR** voor scans: `sudo mijn-ruimte-installeer ocr-talen` (apt `tesseract-ocr` + `poppler-utils`, tessdata ±29 MB, SHA-256). Zonder
   dit worden documenten op naam en tekstlaag geïndexeerd en meldt de bron «OCR niet beschikbaar».
3. Worden niet geïndexeerd (eerlijk): bijlagen van IMAP-mailboxen, Microsoft-mail, contacten, apparaten; zip64/7z/rar; de morfologie voor uk/bg/pl is licht,
   zonder woordenboek; semantisch zoeken is er niet (volgens de specificatie — zonder model).
4. Het synoniemenwoordenboek van de eigenaar zit in de kern (`app.zoek_synoniemen_eigenaar`), een interface ervoor is er nog niet.
5. Terugdraaien: `mijn-ruimte-installeer terugdraaien` + `systemctl disable --now mijn-ruimte-zoek-index.timer`; de migraties terugdraaien is niet
   verplicht — de oude code leest de nieuwe kolommen niet (`docs/zoek/ZOEK-BEHEER.md` §6).

## AI. Witte pagina op admin.*/updates na 20261021-221718 en «knop voor terugdraaien werkt niet» (22-10-2026)

### 1. Oorzaak van de witte pagina — gevonden en gereproduceerd op de testopstelling

`shared/merk-eigen.ts` (eigen logo's, sectie AG) had op **moduleniveau** `const PNG_HANDTEKENING = Buffer.from(…)`. Dit bestand
wordt geïmporteerd door `src/integraties/MerkEigenBeheer.tsx`, dat deel uitmaakt van de **technische bundel** van admin.*. In de browser bestaat `Buffer` niet → bij
het laden van de bundel treedt `Uncaught ReferenceError: Buffer is not defined` op → React tekent niets en **elke** beheerpagina
(`/updates`, `/overzicht`, `/toegang`, …) blijft leeg onder de technische balk. Pagina's zonder technisch profiel (de poort) werkten wel,
evenals mcp.* en hub.*, omdat dat een andere bundel is. Unittests draaien in Node, waar `Buffer` wel beschikbaar is, en zagen dit dus niet; de testopstelling van 21-10 werd voor deze release
alleen gedraaid voor mail/dock. Gereproduceerd met de testopstelling `admin-updates` op de uiteindelijke build 221718 (`pageerror: Buffer is not defined`).

Oplossing: de PNG-handtekening is nu een gewone byte-array met een byte-voor-byte vergelijking (werkt zowel op de server als in de browser); `Buffer` blijft uitsluitend
binnen serverfuncties. Testopstelling van alle 12 pagina's van admin.* (1280 en 390) na de oplossing — 38 opnames, 0 consolefouten.

### 2. Om te voorkomen dat dit ooit opnieuw gebeurt

Nieuwe test `tests/eenheid/browser-gedeeld-20261022.test.ts`: elk bestand `shared/*.ts` dat door `src/` wordt geïmporteerd, wordt door esbuild gebundeld voor de browser
en uitgevoerd in een kale `vm`-context **zonder** `Buffer`, `process`, `require`, `fs` (78 modules). Op code 221718 faalt deze met
«shared/merk-eigen: Buffer is niet defined», op de herstelde versie — 3/3.

### 3. «Terugdraaien naar vorige» op mcp.*/dashboard — werkt zoals bedoeld

De knop roept `POST /api/mcp/server/terugdraaien` aan (passkey + bevestiging), en de server voert deze alleen uit als in
`/etc/mijn-ruimte/mcp-rechten.json` `"terugdraaien": true` staat ingesteld. **Standaard staat dit uit** (`deploy/RUNBOOK-VEILIGE-UITROL.md` §6: zodat
iemand die de applicatie heeft overgenomen de site niet heen en weer kan rollen), en de kaart toont «Deze opdracht is uitgeschakeld in het bestand /etc/mijn-ruimte/mcp-rechten.json
op de server». Terugdraaien vanaf de site is zonder deze schakelaar niet mogelijk; de standaardroute loopt via SSH onder de werkgebruiker:
`sudo mijn-ruimte-installeer terugdraaien`.

### Wat de eigenaar moet doen (eenmalig, via SSH)

De goedkeuringspagina is wit, waardoor dit pakket niet vanaf de site kan worden goedgekeurd. Er zijn twee gelijkwaardige routes, beide uitsluitend via `mijn-ruimte-installeer`:

**A (aanbevolen, herstelt de passkey-stroom):** `ssh beheer@<server>` → `sudo mijn-ruimte-installeer terugdraaien` → `20261022-001408` wordt weer actief
(daar werkt admin.* wel) → op admin.*/updates dit pakket uploaden en zoals gebruikelijk met passkey goedkeuren. Migraties worden niet teruggedraaid,
gegevens worden niet verplaatst.

**B (zonder terugdraaien):** kopieer `mijn-ruimte-<versie>.tar.gz` naar de server (`scp … beheer@<server>:~/`), controleer
`sha256sum mijn-ruimte-<versie>.tar.gz` tegen de controlesom uit het bericht, `mkdir -p ~/uitrol && tar -xzf mijn-ruimte-<versie>.tar.gz -C ~/uitrol`,
`sudo mijn-ruimte-installeer installeren ~/uitrol/mijn-ruimte-<versie>` (databasekopie → migraties → build → omschakelen → `/__gezondheid`).

## AJ. Rendercontrole en automatisch terugdraaien (22-10-2026)
Na 20261021-221718 («Buffer is niet defined», witte admin-pagina's bij HTTP 200) opent de installer na gezond/nabewaking de belangrijkste
pagina's van de nieuwe release in headless Chromium op de server (`scripts/rook-controle.mjs`): eenmalige instantie van de site (`dist-server/rook.mjs`) op
een eenmalige database `mijnruimte_rook_<stempel>` met een testeigenaar en technisch profiel, 13 pagina's + import van alle bundels; kapot
(pageerror, ReferenceError/TypeError, lege `#root`, bundel ≠ 200, «interne serverfout») → automatisch terugdraaien naar de vorige release
met gebeurtenis `ROOK_TERUGGEDRAAID` en opgave van reden onder «Updates»; de vorige versie wordt eenmalig gecontroleerd, zonder tweede terugdraaiactie; migraties worden niet
teruggedraaid. Zonder browser — modulecontrole in Node (vm zonder Buffer/process/require) met een eerlijke melding «rendering niet gecontroleerd».
Browser: `sudo mijn-ruimte-installeer browser-controle` (chrome-headless-shell 156.0.8078.47, SHA-256). nazorg: live-controle 2 min
na activatie + verzoek vanaf de site. «Diagnostiek»: onderdelen «Paginarendering» (knop «Rendering controleren») en «Zoekindex»,
paginacontroles tonen het browserresultaat of «alleen HTTP». Documentatie: RUNBOOK-VEILIGE-UITROL §8a, LEESMIJ, ENV-VARS.
Tests: rook-controle-20261022 40/40, uitrol-rook-terugdraai-20261022 19/19, uitrol-nazorg-rook-20261022 13/13, admin-diagnostiek-rook-20261022 26/26.


## AK. Eigenaarsbesluit met passkey-handtekening: terugdraaien en externe MCP-hosts zonder SSH; één geschiedenistijdlijn (22-10-2026)
«Terugdraaien naar vorige» op mcp.*/dashboard en de witte lijst met externe MCP-hosts (mcp.*/agenten#extern) vereisen niet langer SSH en
`"opdracht.terugdraaien": true`: de eigenaar ondertekent het besluit met een passkey (challenge = sha256 van de canonieke inhoud + nonce + ≤ 5 min, doel
`eigenaar-besluit`), de applicatie plaatst het ondertekende bestand in de root-inbox `/srv/mijn-ruimte/besluit-inbox`, `mijn-ruimte-besluit.path` wekt
`/usr/local/sbin/mijn-ruimte-besluit` (root), die zelf de hash herberekent (`besluit-kern.mjs`), de schakelaar en de handtekening verifieert
(`mijn-ruimte-passkey verifieer-besluit`, dezelfde root-sleutels, eenmalige nonce) en pas daarna `mijn-ruimte-installeer terugdraaien
<naar>` uitvoert (modus `besluit`; migraties worden niet teruggedraaid; 1×/10 min) of atomair `externeMcpHosts` in `mcp-rechten.json` herschrijft (back-up,
JSON-validatie; het bestand blijft eigendom van root). Resultaat in `besluit-<id>.json`, gebeurtenis in `gebeurtenissen.jsonl`, audit
`eigenaar_besluit_*`, tabel `app.eigenaar_besluiten` (0105, RLS). Drie toestanden: `opdracht.terugdraaien: true` = oude route + passkey;
afwezig/false = alleen passkey; `terugdraaien-passkey: false` = verboden (analoog voor `externe-hosts-passkey`). UI: terugdraaiwizard
(van welke naar welke versie, waarschuwing, passkey, live-status over een herstart heen) en kaart «Toegestane hosts» (chips, toevoegen/verwijderen, handtekening).
Updategeschiedenis — één tijdlijn op datum (geïnstalleerd, teruggedraaid, automatisch teruggedraaid ROOK_*/NAZORG_*, afgebroken, mislukt, afgewezen), een klik klapt
de details open, «Opnieuw proberen» is inactief met een tooltip als er na de poging een nieuwere release is geïnstalleerd of als de versie ouder is dan de actieve; mobiele
weergave. Documentatie: RUNBOOK §15 (+ §7, §8), ENV-VARS. Tests: besluit-root-20261022 47/47, besluit-app-20261022 32/32 (RLS 33/33),
uitrol-geschiedenis-tijdlijn-20261022 20/20; testopstelling besluit-* met echte handtekening van een virtuele passkey en het root-script.


## AL. Meldingen per sfeer, drie schendingen in «Verificatie», beveiligingsaudit van routes (zone C, 22–23-10-2026)
- **Sfeer van elke melding** `prive | technisch` (register `shared/meldingen-soorten.ts`, migratie `0107_meldingen_sfeer.sql`: etiket op
  bestaande rijen van `site_notifications`/`notification_jobs` per soort, er wordt niets verplaatst). De server levert, telt en markeert als gelezen
  uitsluitend binnen de sfeer van het tabblad: het belletje van de gebruiker toont alleen privé, «Technische meldingen» op de balk alleen technisch (actief profiel in het tabblad).
- **Acties op de site** (`/api/owner/agents/activity`) hebben eveneens een sfeer: beheer, updates, diagnostiek, SIEM, AI-acties via de technische
  koppeling en apparaten van het technische slot verschijnen uitsluitend in het technische paneel (sectie «Acties in de technische ruimte», herhalingen samengevat als «N×», namen uit
  het logboek); poortweigeringen van de technische ruimte gelden niet langer als «acties»; Nederlandse uitkomsten worden getoond als «afgewezen»/«fout».
- **«Verificatie»:** bootstrap hersteld (anker-grant is een bewuste systeemstap met eigenaarsvoorwaarde), access/request (taken voor de eigenaar met
  ontvanger, systeemstap), workspace/load (vals-positieve melding van de ruimtes-cache). Migratie `0108_zvirka_verholpen.sql` ruimt deze drie
  oude tellers op zodat RLS-groepen kunnen worden ingeschakeld.
- **Route-audit:** `docs/beveiliging/MAATREGELEN-PER-ROUTE-20261022.md` (generator `scripts/beveiliging-routes-inventaris.mjs`):
  682 routes, allemaal voorzien van een poort; 33 met persoonsgegevens — allemaal met een aanvalstest (`ruimte-aanvallen-20261022`). Geen lekken tussen accounts gevonden.
- Belletje: gelezen rijen zijn niet langer halftransparant (contrast AA); op de telefoon zijn paneelknoppen ≥ 44 px, zonder genest scrollen.
- Tests: `meldingen-sferen-20261022` 40/40, `ruimte-aanvallen-20261022` 31/31 (+ RLS-varianten); bijgewerkt: `melding-soorten`, `ruimte-meldingen-20261020`.
- Na installatie: niets handmatig nodig; naar wens — `sudo deploy/db-rollen-instellen.sh status` en het één voor één inschakelen van RLS-groepen.


## AM. Zoeken: handmatige indexering in het technische profiel + resultaatweergave volgens ontwerp (22–23-10-2026)

- /zoek, technisch profiel: knop «Indexeren…» → zwevend venster (gedeeld venstersysteem: verslepen, minimaliseren naar het dock met percentage,
  maximaliseren, sluiten, positie wordt onthouden; blokkeert de pagina niet). Volledig (alle bronnen vanaf nul) of gedeeltelijk (geselecteerde bronnen —
  volledig, of «alleen gewijzigd sinds datum»; een bron die nog niet eerder is gescand wordt altijd volledig gelezen). Live-voortgang, tabel per bron,
  resultaat (nieuw / bijgewerkt / verwijderd / ongewijzigd / OCR / fouten met codes), logboek van handmatige en achtergrondruns, «Stoppen».
- Server: POST /api/owner/zoek/index/{starten,stand,stoppen,geschiedenis} (backend/zoek/beheer.ts) — uitsluitend met actieve technische
  activatie van het tabblad, alleen eigen kluizen van de aanvrager; dezelfde advisory lock als cron (bezet → «aangesloten»); ENV-limieten
  ZOEK_BEHEER_RUN_MS (10 min) / ZOEK_BEHEER_ITEMS (2000); audit zoek.index.starten/stoppen; app.cron_runs «zoek-index@handmatig».
- Venstercode — technische bundel (// @tech-asset → assets/tech/); de «?»-toelichtingen ervan komen niet terecht in de zoekfunctie van een gewone gebruiker.
- Resultaten: gekleurde tegels per bron, foto/logo van afzender in e-mails, bestandsformaat in de tegel voor bestanden, officiële logo's van GitHub/Drive
  (src/merk); «Per bron» (groepen met kopjes) naast «Op relevantie»; lijst/raster; «Recente zoekopdrachten» met relatieve tijd.
- Technisch profiel: strook «U zoekt in de technische ruimte» + kluis bij elke bron; >2 gesloten diensten — één inklapbaar blok.
- Opgelost: op 701–900 px lag het filterblad onder de menurail (selectievakjes waren niet aanklikbaar) — het menu is nu verborgen zolang het blad geopend is.
- Geen migraties, geen nieuwe systeemacties. Tests: zoek-index-beheer-20261022 41/41, zoek-ui-20261022 61/61, hulp-register 17/17,
  zoek-isolatie 49/49, zoek-bronnen 45/45; testopstelling zoek-* (10 stappen × 390/768/1280, licht/donker, nl) — alle metingen OK, axe 0.
```


## AN. «Browser en agenten»: één plek, geldigheidsduur naar keuze, dezelfde browserhulpmiddelen voor alle AI's, chat in het zijpaneel (23-10-2026)

### 1. Eén plek in plaats van «Wat mag AI» onder elke browser
Nieuw tabblad **mcp.\*/agents → «Browser en agenten»** (`#browser`): beide extensieslots (status, geldigheidsduur, pagina's, «Toegang openen» /
«Vergrendelen»), matrix **slot × mogelijkheid × agent** (alle, Claude, ChatGPT, Grok, Gemini, Copilot, Cursor; lezen, navigatie,
klikken/invoeren, screenshot, console en netwerk, diepe diagnostiek, scripts), snelsets «Alles toestaan voor ontwikkeling» (met waarschuwing),
«Alleen lezen», «Vergrendelen», «Wat nog meer toegestaan moet zijn» (connectorrechten en modi) en recente weigeringen in gewone taal. Elke schakelaar
heeft een «?» (uk/nl). Na «Opslaan» wordt een actieve ontgrendeling direct opnieuw ondertekend. Elke weigering aan een agent (EXTENSIE_CAP, EXTENSIE_AGENT,
EXTENSIE_HOST, EXTENSIE_VERGRENDELD, EXTENSIE_SCRIPT) noemt de exacte plek: https://mcp.tarasevych.com/agents#browser, slot, rij en
kolom. Het oude tabblad «Browserextensie» dient alleen nog voor installeren/koppelen en verwijst hiernaartoe. Op de telefoon toont de matrix één kolom tegelijk.

### 2. Ontgrendelingsduur — uw eigen keuze, niet «elke 4 uur»
15 min, 1 uur, 4 uur, tot het einde van de technische activatie, **tot het sluiten van de browser**, tot uitloggen uit het account, tot handmatig intrekken, 1 week,
1 maand, 6 maanden, 1 jaar (tot 366 dagen). Het technische slot kan langer leven dan de activatie, maar elk technisch hulpmiddel vereist nog steeds
een actief technisch profiel in het tabblad. Het herstarten van de browser wist «tot uitloggen», «tot intrekken» en week…jaar niet; korte
termijnen en «tot het sluiten van de browser» eindigen zodra de browser wordt gesloten (extensie 0.7.0 meldt een browsersessie-id — dat
kan de toegang uitsluitend sluiten). **Uitloggen uit het account beëindigt elke geldigheidsduur** (voorheen overleefde een privé-instelling van «N dagen» het uitloggen). Migraties 0110, 0111.

### 3. Alle agenten — dezelfde browserhulpmiddelen, ook met de namen van chrome-devtools-mcp
Het enige verschil tussen agenten is uw matrix (gelijkheidstest voor zes agenten). Met een schakelaar zien agenten ook de namen van chrome-devtools-mcp
(navigate_page, take_snapshot, click, fill, … evaluate_script) — deze leiden naar dezelfde hulpmiddelen met dezelfde grenzen;
`evaluate_script` is uitsluitend beschikbaar voor het technische slot, het pakket «diagnostiek» en het vinkje «Scripts». Beschrijving voor agenten: `docs/agenten/BROWSER-VIA-CONNECTOR.md`.

### 4. Chat «AI voor u» in het zijpaneel van de extensie
Naast het huidige tabblad, met het recht «API-platform» en uw eigen modelsleutel; alleen zolang het slot geopend is; het model beschikt uitsluitend over de hulpmiddelen van deze browser.

### Wat de eigenaar moet weten
1. Open «Browser en agenten», vink de mogelijkheden aan en klik op «Opslaan» (tot dat moment gelden de oude rechten per afzonderlijke browser).
2. Werk de extensie bij naar 0.7.0; onderteken het CRX-bestand lokaal met uw eigen sleutel (`node scripts/sign-extension.mjs`). Versie 0.6.2 blijft werken met de oude grenzen.
3. Elke keer uitloggen uit het account (en wisselen van account in een tabblad) sluit de toegang van de extensie; Chrome die op de achtergrond blijft draaien geldt niet als gesloten.
4. Als er een ondertekend AI-beleid actief is, bepaalt dat beleid de hulpmiddelmodi.
```


## AO. Werkblad (hub /overzicht) — nieuw hoofdscherm van de hub

- Nieuw: `src/werkblad/*` — «Werkblad» in plaats van het oude «Bureau» op /overzicht (adres en menu blijven hetzelfde; h1 «Werkblad»).
  Raster van 12/6/1 kolommen zonder overlap (`shared/werkblad-indeling.ts plaatsen`), modus «Instellen»: verslepen (pointer gebeurtenissen,
  live-voorbeeld), formaat wijzigen, widgetcatalogus, achtergrond (kleurverlopen uit tokens of eigen afbeelding ≤ 400 KB), «Terugzetten»; toetsenbord (pijltjestoetsen,
  Shift+pijltjestoetsen, Verwijderen) met aria-live; telefoon — «hoger/lager», tikdoel ≥ 44 px.
- Widgets uitsluitend op basis van bestaande routes: begroeting, snelle toegang (met tellers), mail, agenda, taken, notities, bord, bestanden,
  cloudopslag (quota die de server al kent), recente zoekopdrachten, snelle acties, AI voor u, status van diensten (knop «Controleren»), systeeminformatie
  (in plaats van het weer — zonder externe clouds), tip; technische kluis: server, updates, diagnostiek. GitHub — «binnenkort».
- Database: migratie 0112 `app.werkblad_indeling` (user_id + ruimte, RLS; GRANT in rechten.sql). Routes
  `POST /api/owner/hub/werkblad/{laden,bewaren,terugzetten,tech}` (`backend/werkblad.ts`): kluis uitsluitend vanaf de server, expliciete WAAR, normalisatie
  op de server, versienummer tegen overschrijven (409), `/tech` alleen met technisch profiel.
- Compatibiliteit: bij het eerste openen wordt het oude bureaublad gemigreerd, gewijzigde oude blokken worden toegevoegd als «oud blok»/koppeling, verborgen blokken staan in
  de catalogus; oude gegevens blijven ongewijzigd. `hub/blocks/data` levert `opslag` (opslagquota).
- hulp-register: `werkblad.instellen|achtergrond|terugzetten`; `src/werkblad` valt onder de scanner.
- Tests: werkblad-indeling 69/69, werkblad-routes 28/28 (RLS 29/29); testopstelling werkblad-* — axe 0, LCP 0,44–0,54 s, 0 tikdoelen < 44 px.
- Acties na installatie: geen (de migratie wordt toegepast door de installer).
```


## AP. Terminal: server als apparaat, opdrachtterminal, PowerShell (zone G, 22–23-10-2026)

Voorheen: «Terminal» op de technische balk was uitsluitend een eenmalige container op een apparaat met podman; in de technische ruimte van de eigenaar stond geen enkel
apparaat, zodat het venster «Geen apparaat met ingeschakelde terminal…» toonde. De server werd alleen gekoppeld via een vanaf de site overgetypte code
(beheer-koppelen). PowerShell was verboden.

Nu:
- `sudo mijn-ruimte-installeer terminal-inrichten` (deploy/apparaat-inrichten.sh → /usr/local/sbin/mijn-ruimte-apparaat; draait ook stilletjes
  aan het einde van `installeren`, de eerste keer). Root start dist-server/apparaat-koppelcode.mjs als dienstgebruiker: een eenmalige code
  (sha256, 5 min, ruimte «technisch», eigenaar OWNER_EMAIL) gaat via stdin naar `agent.mjs pair --code -` als beheer. Vervolgens
  `terminal-config on --opdrachten --geen-container` en de unit mijn-ruimte-apparaat.service (User=beheer, NoNewPrivileges,
  ProtectSystem=strict) vanuit het sjabloon deploy/mijn-ruimte-apparaat.service. De oude unit mijn-ruimte-agent-beheer.service wordt uitgeschakeld.
  Mappen: /home/beheer (schrijven), /srv/mijn-ruimte en /var/log (lezen); programmalijst — STANDAARD_ALLOW_SERVER.
- Opdrachtterminal (src/terminal/Terminal.tsx, backend/terminal-opdrachten.ts, migratie 0113 app.terminal_opdrachten met RLS):
  - opent direct op de server: «verbonden als beheer@<host>, map …, toegestaan …»;
  - één programma per regel zonder shell (| ; && > < worden geweigerd);
  - lezen — direct; opdrachten die iets wijzigen — bevestiging in het venster (apparaatinstelling: «elke opdracht»);
  - automatisch aanvullen, geschiedenis met uitvoer, kopiëren; uitvoer wordt vastgelegd;
  - ondertekende term.exec gaat buiten de AI-wachtrij om;
  - zonder apparaat — wizard met de exacte opdracht en «Status controleren».
- Agent 0.8.0: `terminal-config on --opdrachten | --powershell | --geen-container`. PowerShell — uitsluitend als
  `powershell.exe -NoProfile -NonInteractive -Command <tekst>` (één argument, zonder cmd.exe). Elke PowerShell-opdracht vereist bevestiging
  op de site, zowel in de terminal als via AI (uitvoeren_opdracht): backend/connectors-commands.ts stelt dit verplicht, zelfs met de toestemming
  «altijd». Windows: deploy/agent/WINDOWS-POWERSHELL.md (Taakplanner S4U; sc.exe is niet geschikt voor node/powershell).
- Documentatie: docs/terminal/TERMINAL.md, deploy/agent/LEESMIJ.md (0.8.0).

Tests:
- terminal-opdrachten-20261022 69/69 — een andere gebruiker ziet het apparaat niet, zonder technisch profiel 403, RLS, aanvallen op parser/agent/PowerShell;
- apparaat-inrichten-20261022 25/25.

Testopstelling terminal-*: 28 opnames, 0 gebreken.

Na installatie: als de server niet automatisch is gekoppeld — `sudo mijn-ruimte-installeer terminal-inrichten`.
```

## AQ. Integratie van zones AJ–AP in één release (23-10-2026)

De zones werkten parallel in dezelfde boom; op 22-10 rond ~20:30 werden vijf van de zeven agenten afgebroken door een API-limiet. Hun bestanden zijn vastgelegd
in een controlepunt (tak `werk-20261023`, commit 25fef3c, archief en git-bundel overgedragen aan de eigenaar), de agenten gingen verder vanuit hun eigen context en
leverden elk eerst een tussentijds verslag in. Tijdens het samenvoegen is het volgende opgelost:

- **De build liep tegen de geheugenlimiet van de installer aan.** `vite build` op de samengevoegde boom faalde bij `BOUW_HEAP_MB=2560` (zoals op de server) met
  «JavaScript heap out of memory» pas ná «✓ built» (piek ~3,1 GB RSS). De oorzaak lag bij twee reeds voorgebouwde externe bestanden die Rollup
  opnieuw parseerde: `officeparser.browser.slim.mjs` (5,5 MB) en h5wasm (4,2 MB). De nieuwe plug-in `scripts/vendor-ongebundeld.mjs` plaatst deze ongewijzigd in
  `dist/assets/vendor/<naam>-<hash>/` en koppelt ze als externe modules (`/assets/vendor/…`); daarnaast `rollupOptions.cache: false` en
  `maxParallelFileOps: 32`. Nu slaagt de build met 2048 MB (circa ~500 MB marge tot de limiet van de installer) en is deze twee keer zo snel (≈35 s in plaats van 66 s).
  De test `vendor-ongebundeld-20261023` (26/26) bewaakt dat deze bestanden zelfstandige ES-modules blijven en uitsluitend dynamisch worden geladen.
- **Weergave van .mdb/.accdb-bijlagen in mail** crashte in de browser met «process is niet defined» (gevonden door de rendercontrole van zone AJ): vóór
  het laden van `mdb-reader` wordt nu een minimale `process`/`Buffer`-shim geplaatst (aparte module `src/platform/node-shim.ts`, die als eerste
  in dezelfde chunk wordt geladen), zonder iets bestaands te overschrijven. Rendercontrole van zone AJ op de definitieve build in echte
  Chromium: **13 pagina's renderen, 506/506 bundels laden** (vóór de oplossing — 506/507 met een waarschuwing).
- **`evaluate_script`** (chrome-devtools-mcp-alias uit zone AN) is toegevoegd aan de gedeelde lijst van browserhulpmiddelen — anders zou deze
  niet als browserhulpmiddel worden beschouwd (`ai-ruimte` 18/18).
- **Updategeschiedenis (AK):** Escape op een uitgeklapte rij klapt deze in en zet de focus terug op de rij (toegankelijkheidseis A5, voorheen voor de
  zijlade die niet meer bestaat; `ui-audit-g` 59/59).
- **Werkblad (AO):** bij «Recente bestanden» staat in plaats van `vnd.openxmlformats-officedocument…` nu het korte formaat (`xlsx`); op 390 px staat de maand in
  de kalender op een eigen regel met de knoppen eronder (voorheen werd «Oktober 20…» afgekapt en sprong het pijltje naar de volgende regel).
- **Testopstelling van alle nieuwe stappen op de samengevoegde build (H-EIND, 213 opnames, 390/1280, licht/donker, uk/nl) vond en herstelde:**
  - wijzigingen op het scherm «Browser en agenten» (`owner.extensie.matrix`, `.modi`) kwamen in het persoonlijke belletje terecht als «Actie op de site: extensie
    matrix» — dit zijn nu technische acties met een leesbare naam («Rechten ‘Browser en agenten’ gewijzigd»), en elk chatbericht in het zijpaneel
    wordt niet langer een melding (blijft wel in het logboek);
  - het paneel voor technische meldingen toonde slechts één actie: de activiteitsroute haalde zonder onderscheid de 120 nieuwste logboekregels op, waardoor ruis
    (46 «poortweigeringen» per paginalading) en persoonlijke acties de technische acties verdrongen. Nu worden ruis en de andere sfeer al in SQL weggefilterd
    (de test op «uithongering» faalt op de oude code en slaagt op de nieuwe);
  - elke hubpagina in een technisch tabblad toonde «Actie kon niet worden uitgevoerd.» (dit gebeurde ook op de live-site): het oude laden van de
    indeling/ruimte kreeg een verwachte weigering van de ruimtepoort. Die weigering wordt nu stil afgehandeld — de balk en het werkblad lichten de status toe;
  - technisch werkblad: uitrolstatus als woord («gereed» in plaats van `klaar`), diagnostiekcontroles met naam en reden (in plaats van id en
    code), uitrolsamenvatting op twee regels; in het indexeringsvenster «10 min» in plaats van «10 min 0 s».

## AR. Mail: wereldwijd zoeken — in het menu in plaats van bovenop het menu met mailaccounts (24-10-2026)

Verzoek van de eigenaar (één update, uitsluitend deze wijziging): «de knop voor zoeken over de hele site vanuit de mailafdeling wordt, in plaats van bovenop het menu
met mailaccounts te liggen, voortaan weergegeven in het menu tussen de profielfoto en de knop voor het bewerken van het menu».

- **Telefoon (≤ 700 px, menulade).** De ronde knop «Zoeken in ‘Mijn ruimte’» zweeft niet langer rechtsboven over de Gmail-avatar
  (waaronder het «G»-logo uitstak — dat «logofragment»). Hij staat nu in de kop van de lade: profielfoto … **zoeken** ·
  «Menu bewerken» · «Sluiten», 44×44. Aanraken sluit de lade en opent hetzelfde zoekvenster met de cursor in het veld; Esc → focus op
  de menuknop ☰. Het menu met mailaccounts (avatar met logo) is weer volledig vrij: het midden van de avatar en van het logo is de avatar zelf.
- **Computer en tablet (> 700 px).** Het veld «Zoeken in ‘Mijn ruimte’… Ctrl K» ligt niet langer over «Mail vernieuwen», «Snelle instellingen»
  en het menu met mailaccounts (zoals gebeurde op 1704 px met vastgezet menu). Rechts in de kop staat alleen nog de profielfoto; de zoekknop staat
  in de bovenste rij van het zijmenu: uitgeklapt — direct links van de modusknoppen met «Menu aanpassen» (hetzelfde kader en dezelfde hoogte),
  ingeklapt — onder de modusknop, dock — vóór ⚙. Tooltip «Zoeken in ‘Mijn ruimte’ (Ctrl K)». Dit is een aparte knop buiten het paneel «Zijbalkmodus»
  en blijft hetzelfde element bij het uit- en inklappen van het menu, zodat de focus na Esc precies naar deze knop terugkeert.
- **Ctrl K / ⌘K** werkt op elke breedte zoals voorheen: één zoekvenster in de paginakop (zonder knop), waarvoor de lade niet nodig is.
- Overige secties (Mijn ruimte, Bestanden, AI, …) — ongewijzigd: veld rechtsboven op de computer, ronde knop op de telefoon.
- In de kop van de lade stond «Menu bewerken» 6 px hoger dan de foto en «Sluiten» (geërfde ondermarge van 12 px uit
  `.sidebar-expanded .canonical-menu-toggle`) — nu staan alle knoppen op één lijn (op alle pagina's).
- Code: `src/search/ZoekGlobaal.tsx` (`ZoekMenuKnop`, `zonderKnop`, terugzetten van focus als de knop er niet meer is), `src/CanonicalChrome.tsx`
  (`zoekInMenu = current === 'mail'`), `src/ZijbalkWerkbalk.tsx` (`zoek`), `src/search/zoek.css`, `src/menu-v2.css`.
- Controles: `zoek-in-menu-20261024` 23/23; volledige suite van 235 bestanden + 8 RLS-varianten; tsc 0 fouten; rendercontrole 13 pagina's,
  506/506 bundels; testopstelling `mail-zoek-in-menu`, `hub-zoek-ongewijzigd`, `zoek-palet-mail` op 360/390/768/1280/1704, licht/donker, uk/nl —
  alles in orde (elementFromPoint: avatar, logo, «Mail vernieuwen», «Snelle instellingen» raken zichzelf; volgorde in de ladekop
  foto → zoeken → «Menu bewerken» → «Sluiten», één rij; focus en Ctrl K).

## AS. Nederlandse bestandsnamen voor de hele site + kaart «wat staat waar» (24-10-2026, pakket 1 «Adaptive Mail Canvas», stap 1)

Verzoek van de eigenaar: «hernoem alle bestanden naar het Nederlands en zorg dat het systeem weet waar alles staat»; omvang — «De hele site», als afzonderlijk
tussenarchief vóór het adaptieve raamwerk van de e-maillezer.

- **Wat er is gewijzigd.** 531 bestanden in `src/`, `backend/`, `shared/`, `server/`, `tests/`, `scripts/` hebben Nederlandse namen gekregen volgens
  één woordenlijst (bijvoorbeeld `GoogleMailWorkspace.tsx` → `GoogleMailWerkruimte.tsx`, `MailThreadContent.tsx` → `MailGesprekInhoud.tsx`,
  `MailReaderToolbar.tsx` → `MailLezerWerkbalk.tsx`, `MailMessageBody.tsx` → `MailBerichtTekst.tsx`, `mail-density-profile.ts` →
  `mail-dichtheid-profiel.ts`). Drie mappen: `src/search` → `src/zoek`, `src/flags` → `src/vlaggen`, `src/remote` → `src/extern`.
  De codelogica is niet gewijzigd: uitsluitend importpaden, padverwijzingen in tests, scripts en documenten en bestandsnamen in commentaar.
  De componentnamen binnenin (`GoogleMailWorkspace`, `MailThreadContent`, …) zijn gebleven — de kaart laat zien in welk bestand elk onderdeel staat.
- **Kaart.** `docs/kaart/KAART-BESTANDEN.md`: woordenlijst, uitzonderingen met redenen, tabellen per sectie — nieuwe naam · oude naam · exports.
  `docs/kaart/bestandskaart.json` — hetzelfde voor machines. De eerste stap van de build is `scripts/kaart-controle.mjs`:
  - elk nieuw pad bestaat;
  - geen enkel oud pad is teruggekeerd;
  - in code, tests, scripts en de extensie staan geen verwijzingen naar oude paden;
  - een nieuwe Engelse bestandsnaam geeft een waarschuwing met een Nederlandse suggestie.

  De test `bestandskaart-20261024` (26 controles) houdt dit vast in de testsuite.
- **Niet hernoemd (en waarom):**
  - `backend/deployment-identity.ts` — `installeer-app.sh` en `apparaat-inrichten.sh` lezen hieruit het domein;
  - `scripts/rook-controle.mjs`, `server/pg-versie.ts`, `server/apparaat-koppelcode.ts` — worden aangeroepen door de installer;
  - `server/migrate.ts`, `scripts/build-server.mjs` — de voorcontrole van de reeds geïnstalleerde versie vereist deze in elk nieuw pakket
    (gevonden door de voorcontrole van dit pakket: zonder deze bestanden zou de server de update weigeren);
  - `scripts/installer/*` — downloads voor gebruikers;
  - alle bestanden die worden genoemd door scripts en services in `deploy/`;
  - `src/main.tsx`, `src/App.tsx`, `src/index.css`;
  - `migrations/` (namen zijn vastgelegd in de database), systemd-timers en taaknamen in `cron.json`, `public/`, `extension/`, `index.html`,
    `vite.config.ts`, namen van npm-opdrachten en de uitvoerbestanden `dist-server/*.mjs`.
- **Beveiliging ongewijzigd, automatisch geverifieerd:**
  - voor elk van de 794 bestanden in `src/` geldt dezelfde klasse «technisch/gewoon» (96 technisch); regels in `shared/tech-bundels.ts`:
    `Admin*` → `Beheer*`, `admin-*` → `beheer-*`, `src/flags/` → `src/vlaggen/`, `src/remote/` → `src/extern/`;
  - build: eveneens 6 technische bundels (`BeheerConsoleWeergave`, `ExternBureaublad`, `SshBeheer`, `Terminal`, `Vlaggen`,
    `ZoekIndexVenster`) en 497 gewone;
  - zoekcatalogus van de interface (`PLEKKEN`, 101 regels): voor elk bestand dezelfde dienst, hetzelfde tabblad en dezelfde toegang.
- **Wat er voor u is gewijzigd.** Opdrachten uit de instructies hebben nieuwe scriptnamen:
  - `node scripts/onderteken-extensie.mjs` (was `sign-extension.mjs`);
  - `node scripts/bouw-extensie.mjs` (was `build-extension.mjs`);
  - `scripts/tech-bundels-controle.mjs`, `scripts/mail-slimme-inbox-audit.mjs`.

  `npm run build` en andere npm-opdrachten zijn hetzelfde gebleven. De bundelnamen in `dist/assets` zijn nieuw; de browser laadt deze vanzelf in.
- **Zoekcatalogus.** Dezelfde 1149 items met dezelfde plek, soort en tekst. Slechts 2 items kregen een ander id:
  bij het samenvoegen van gelijke knoppen «won» door de nieuwe bestandsvolgorde een ander bestand met een andere Nederlandse tekst. Oude items uit de
  zoekgeschiedenis voor deze twee knoppen lichten daardoor simpelweg niet op.
- **Teststabiliteit.** Door de nieuwe namen veranderde de alfabetische volgorde van de tests, wat twee oude afhankelijkheden van de status van de gedeelde
  testdatabase aan het licht bracht:
  - `agent-namens` haalt de eigenaar nu specifiek uit `OWNER_EMAIL` in plaats van de eerste de beste te pakken;
  - `sleutelkluis-20261020` ruimt na afloop het Drive-account met gesloten sleutelkluis op. Voorheen bleef er na elke run zo'n account achter,
    en omdat de Drive-planner de eerste 10 pakt, kwam `ruimte-drive-projectie` na verloop van tijd niet meer aan zijn eigen accounts toe. Reguliere expressies
  in tests die naar oude namen zochten zijn bijgewerkt. Anders zouden ze stilletjes een lege lijst controleren: `tech-bundels`, `ui-audit-g`,
  `diagnostiek-account`, `mail-ux-beoordeling-20261021`, `mail-rij-2026-10-18`, `vlaggen`, `gebruiker-audit-2026-10-19`.
- **Hulpmiddel** (niet in de repository, voor reproductie opgenomen in het releaserapport): kaartgenerator, hernoeming met herberekening van
  imports (statisch/dynamisch/`lazy`, CSS `@import`, `new URL`, importtekst die door tests wordt gecontroleerd) en controleverificatie van
  onveranderlijke eigenschappen (technische/gewone klassen, plekken in de catalogus).
- Controles:
  - `tsc` (frontend en server) — 0 fouten;
  - build: kaart, interfacecatalogus 1149, L002, slimme inbox, contrast, 6 technische en 497 gewone bundels;
  - tests: 236 bestanden, 8.769 controles, 0 fouten (12 RLS-controles slagen in 8 RLS-varianten; 4 bestanden overgeslagen, zoals altijd);
  - rendercontrole in Chromium — 13 pagina's, 506/506 bundels;
  - testopstelling voor/na op 390 en 1280 px (39 opnames): alleen de gegevens verschillen — tijdstippen van e-mails en het adres van het testaccount, de lay-out is identiek.

## AT. Eén berichtvenster voor alle modi — adaptief kader (24-10-2026, pakket 1 «Adaptive Mail Canvas», stap 2)

Verzoek van de eigenaar: «één lezer die er op de computer uitziet als een professioneel e-mailprogramma, eenvoudig blijft op de telefoon en geen
mogelijkheden verliest tijdens het schalen van het venster»; volledige, gesplitste, zwevende en mobiele modi «gedragen zich hetzelfde».
`GoogleMailWorkspace`, `MailThreadContent`, `MailReaderToolbar`, `MailMessageBody` en de dichtheidsprofielen zijn gebleven — het kader eromheen is veranderd.

- **Kader.** Nieuwe component `src/mail/LeesVenster.tsx` ter vervanging van de eigen «onderlaag» in `GoogleMailWerkruimte.tsx`. Regels zonder DOM —
  in `src/mail/lees-modus.ts`, CSS per vorm — in `src/mail/lees-venster.css`. Vijf vormen: volledig, rechts, onder, zwevend venster,
  telefoon. De vorm is zichtbaar in het attribuut `data-lees-modus`, de breedteklasse van het venster zelf (niet van het scherm) in `data-lees-breedte`. Er is één
  telefoongrens: 721 px. Voorheen liepen de grenzen door elkaar: 559/560, 700/701, 720/721 en 760 px.
- **Gevonden met de nieuwe testopstelling `mail-lezer-*` en opgelost** (8 formaten: 360, 390, 640×400, 852×480, 740, 768, 1280, 1704):
  1. In de modus «Rechts» stond het bericht **links bovenop de lijst**, terwijl de rechterhelft leeg was: de linkerrand van het zijmenu (inline `left`) overschreef
     CSS `left:auto`. Nu staat het bericht tegen de rechterrand en staan lijst en bericht op alle breedtes naast elkaar.
  2. In de modus «Onder» liep het scrollgebied van de lijst ~60 px door onder het bericht, waardoor **de laatste rij van de lijst onder het bericht verborgen bleef**. Na het sluiten van het bericht
     sprong de lijst helemaal naar boven omdat de scrollcontainer wisselde. Nu scrollt de lijst mee met de pagina, houdt onderaan ruimte vrij ter
     hoogte van het bericht en blijft de rij van het geopende bericht altijd boven het bericht zichtbaar.
  3. Op de telefoon werkte de modus «onder» nog deels door: het bericht begon 16 px onder de schermrand. Nu geldt op de telefoon altijd de volledige modus.
  4. Op ≤ 430 px **verdwenen «Toevoegen aan favorieten» en «Naar prullenbak» volledig**: ze werden verborgen door CSS en stonden niet onder «⋮». De kop werkt nu volgens het
     «priority+»-principe: acties staan op één rij in de gekozen volgorde, en wat niet past verschijnt bovenaan in «⋮» onder de groep «Snelle acties». De breedte
     wordt berekend op basis van het berichtvenster zelf, niet het scherm. Voorheen overlapten in «rechts» op 852 px de kopknoppen «⋮» en naastliggende knoppen.
  5. **Escape sloot een geminimaliseerd (dus onzichtbaar) bericht** inclusief het antwoord dat u daarin aan het typen was. Nu doet Escape bij een geminimaliseerd bericht
     niets.
  6. Escape in de **lijst** sloot het bericht in de modi «rechts/onder». Nu werkt Escape naast de lijst en in het zwevende venster alleen
     wanneer de focus zich in het bericht bevindt.
  7. **Focus.** Na het openen bleef de focus op de pagina staan en kondigde de schermlezer het bericht niet aan. Nu verplaatst de focus zich naar het bericht (volledige
     modus, telefoon, zwevend venster). Na het sluiten keert de focus terug naar de rij van het bericht, en als het bericht is verplaatst (archief) naar de rij die
     ervoor in de plaats is gekomen.
  8. **«Terug» op de telefoon verliet de mail.** Nu sluit dit het bericht: er staat één markering in de browsergeschiedenis zolang het bericht de lijst bedekt
     (ook in de volledige modus op de computer). Als u het bericht met de knop sluit, verdwijnt de markering zodat de volgende «Terug» weer normaal werkt.
  9. Voor de schermlezer: «rechts/onder» is een paginagebied (`region`) en geen modaal venster; het zwevende venster is niet-modaal.
  10. **«Venster verkleinen» deed niets tussen 560 en 760 px.** Nu zweeft het venster vanaf 721 px en is de knop op de telefoon afwezig. Toetsenbord:
      het zwevende venster heeft een greep — pijltjestoetsen verplaatsen met 16 px (Alt met 2 px), Shift+pijltjestoetsen wijzigen de grootte, net als bij de overige vensters op de site.
      Na het schalen van de browser keert het venster terug binnen de schermgrenzen.
  11. Het zwevende venster schoof onder het zijmenu: op 768 px werd de menubalk bovenop het bericht getekend. Nu blijft het rechts van het menu
      of dock en onder de bovenbalk. Als er weinig ruimte is, verkleint het venster zich tot 360×300 in plaats van onder het menu te schuiven.
  12. **Het paneel «⋮» stond altijd rechtsboven op het scherm** — ver weg van de knop wanneer het bericht onderaan of in een zwevend venster stond. Nu verschijnt het bij
      de eigen knop; als er onderaan geen ruimte is, klapt het naar boven open.
  13. **Menu rechts of dock boven/onder** (Instellingen → Menu). Het bericht berekende zijn linkerrand vanaf de rechterrand van het menu en merkte een wijziging van de
      menupositie niet op:
      - met het menu rechts liet het bericht links 60 px vrij voor een menu dat daar niet meer stond en liep het rechts onder het menu door, terwijl «Sluiten» werd bedekt door
        de avatar;
      - met het dock begon het bericht vanaf de rechterrand van het dock, dus halverwege het scherm: op 1280 px was het 399 px breed (kopknoppen
        overlapten elkaar), op 768 px slechts 192 px.

      Nu volgen de grenzen van het berichtvenster (en van de bijlageweergave) de werkelijke positie van het menu: naast het menu rechts, onder het dock bovenaan,
      boven het dock onderaan.
  14. ☰ bleef op de telefoon verborgen zolang het bericht geminimaliseerd was. Nu blijft deze knop zichtbaar.
  15. Naast de lijst zette het sluiten van het bericht de lijst terug naar de positie van vóór het openen, zelfs als u verder had gescrold. Nu keert de lijst alleen terug
      wanneer het bericht de lijst bedekte. Naast de lijst blijft de rij van het geopende bericht zichtbaar, ook tijdens «Vorige/Volgende».
  16. Nieuw: de scrollpositie wordt per bericht onthouden zolang de pagina geopend is. Wanneer u terugkeert naar een bericht, bent u waar u gebleven was
      (voorheen altijd bovenaan), zelfs wanneer de berichttekst nog wordt nageladen.
  17. Naast de lijst en in het zwevende venster reserveert de kop niet langer 4.75rem voor de bovenbalk van de site — die zit daar niet.
  18. **«Zoeken in geopend gesprek» vond een treffer, maar scrolde er niet naartoe.** De eerste `<section>` van het bericht is de AI-balk, en de zoekfunctie
      scrolde juist die balk. Dezelfde fout zat in het automatisch scrollen tijdens het verslepen van acties (indeling bewerken).
- **Tests:**
  - nieuw: `lees-venster-20261024` — 40 controles: regels, structuur in elke vorm, broncode, CSS;
  - `mail-ux-beoordeling-20261021` R5: de regel voor «Venster verkleinen» staat nu in `lees-venster.css` en geldt tot en met 720 px;
  - `bestandskaart-20261024` +2: lijst «toegevoegd».
- **Kaart «wat staat waar».** In `docs/kaart/bestandskaart.json` is het veld `toegevoegd` bijgekomen — 7 bestanden die na de hernoeming zijn aangemaakt, met
  beschrijving. `scripts/kaart-controle.mjs` stopt de build als zo'n bestand ontbreekt. In `KAART-BESTANDEN.md` staat de sectie «Toegevoegd na
  hernoeming».
- **Wat er voor u is gewijzigd.** U hoeft niets in te stellen. De modi «Rechts» en «Onder» (Snelle instellingen van mail → «Leesgebied»)
  werken nu zoals bedoeld, ook met het menu rechts of met het dock.
- Controles:
  - `tsc` (frontend en server) — 0 fouten;
  - build: kaart, interfacecatalogus 1149, L002, slimme inbox, contrast, 6 technische en 497 gewone bundels;
  - tests: 237 bestanden, 8.859 controles, 0 fouten (12 RLS-controles slagen in 8 RLS-varianten; 4 bestanden overgeslagen, zoals altijd);
  - testopstelling `mail-lezer-*`:
    - VOOR: in de oude versie vertoonden alle 40 metingen gebreken — volledig, rechts, onder en zwevend op 8 formaten (op de telefoon is dit
      de telefoonvorm) plus geminimaliseerd bericht; menu rechts en dock — 6 van de 6;
    - NA: 55 van de 55 zonder gebreken — dezelfde 40 (nu inclusief zoeken in het bericht, toetsenbordbediening van het zwevende venster en
      scrollpositie) plus menu rechts / dock boven / dock onder op 5 computerformaten;
  - e2e in Chromium: `mail-lijst-ux` 26/26 (inclusief verslepen van het zwevende venster), `mail-opstel-venster` 25/25,
    `mail-verkenning` 1/1, `vensters` 11/11;
  - rendercontrole — 13 pagina's, 506/506 bundels;
  - testopstelling van overige pagina's (hub, mail, menu, identiteit, technische ruimte; 40 opnames, 390 en 1280 px) vergeleken met de vorige
    release: alleen de gegevens verschillen (tijd, testaccount).

## AU. Bericht binnen het venster: berichten, contextpaneel, contactkleuren, dichtheid (24-10-2026, pakket 2 «Adaptive Mail Canvas»)

Referentie — het goedgekeurde ontwerp `claude/mail/MAKET-VIKNO-LYSTA-2026-10-24.md`. De componenten waarvan de eigenaar vroeg ze te behouden zijn gebleven:
`GoogleMailWerkruimte.tsx` (GoogleMailWorkspace), `MailGesprekInhoud.tsx` (MailThreadContent), `MailLezerWerkbalk.tsx`
(MailReaderToolbar), `MailBerichtTekst.tsx` (MailMessageBody) en de dichtheidsprofielen. Het nieuwe werk zit in afzonderlijke bestanden in `src/mail/`, elk opgenomen in
de kaart «wat staat waar».

- **Berichten** (`MailGesprekInhoud.tsx`, `src/mail/gesprek-opmaak.css`, `src/mail/gesprek-context.ts`):
  - foto van de afzender; ring en streep links in de kleur van het contact;
  - naam en verificatiebadge op één regel, daaronder het adres, «aan / cc» (met gekleurde stip, «mij»), tijdstip;
  - knop ↩ «Beantwoorden» op het laatste bericht;
  - eerdere berichten van een lang gesprek samengevouwen tot één regel «N eerdere berichten» met foto's van de deelnemers;
  - op de bijlagekaart staat de versie van datzelfde bestand binnen het gesprek: «v3 · laatste» / «v2 van 3»;
  - uitnodiging `.ics` — afspraakkaart: titel, tijd in uw eigen tijdzone (met `TZID`, ook «hele dag»), locatie. «Afspraak maken» opent
    het Agendavenster met reeds ingevulde titel, starttijd, duur en locatie (de locatie wordt zowel uit `.ics` als in het Google-concept overgenomen);
  - onder het onderwerp staan de eigen gespreklabels met hun Gmail-kleur, tot zes stuks, de rest als «+N».
- **Contextpaneel** (`src/mail/ContextPaneel.tsx`, `src/mail/context-paneel.css`, `src/mail/ics-gebeurtenissen.ts`) — «uit gegevens van de
  berichten, zonder AI»:
  - berichtvenster ≥ 1100 px — kolom van 368 px rechts (kan worden verborgen); smaller — blad op aanvraag: knop «Context» of F6;
    op de telefoon schuift het blad van onderaf omhoog, met tabbladen;
  - **Tijdlijn:** berichten uit het gesprek, «u bent hier», toekomstige afspraak uit `.ics`; met stippellijn — gerelateerde berichten;
  - **Bijlagen:** versiegroepen («3 versies · v3 · laatste … v1»), «Overige bestanden», «Alles opslaan»;
  - **Verbanden:** gewone zoekopdracht in dit postvak op adres van de afzender en woorden uit het onderwerp, met opgave van reden («dezelfde afzender»,
    «vergelijkbaar onderwerp»);
  - **Taken en afspraken:** afspraken uit `.ics` («Naar Agenda», «.ics openen»), «Naar taken», «Afspraak maken»;
  - **Afzender:** providercontrole (SPF, DKIM, DMARC), contactkleur — 13 kleuren uit het Mail-palet;
  - **Beveiliging:** TLS onderweg, externe afbeeldingen, trackingpixels, onbeveiligde `http`-afbeeldingen, hoe koppelingen worden geopend.
- **Contactkleuren.** Een keuze in het paneel wordt opgeslagen in dezelfde afzenderregels van Mail (`senderRules`). Daardoor is de kleur zowel in de berichtenlijst
  als in het gesprek zichtbaar: streep, ring, stip bij «aan / cc».
- **«Weergave»** (`src/mail/WeergaveKeuze.tsx`):
  - dichtheid binnen het bericht (Compact · Normaal · Ruim), onafhankelijk van de venstermodus;
  - tekstgrootte 90 / 100 / 115 / 130 % — een HTML-bericht wordt in zijn geheel geschaald zonder dat de opmaak breekt;
  - externe afbeeldingen: «Vragen» of «Altijd tonen».

  De instellingen worden op dit apparaat bewaard. De knop staat in de kop; op de telefoon en in een smal venster onder «⋮».
- **Externe afbeeldingen zijn nu verborgen totdat u ze toont** (`src/mail/beelden-toestemming.ts`, `MailBerichtTekst.tsx`):
  - boven het bericht verschijnt een strook «N … verborgen · Eenmalig tonen · Altijd van deze afzender»;
  - totdat u klikt doen de browser en de server geen enkel verzoek naar buiten, zodat een trackingpixel niet te weten komt dat het bericht is geopend.
    Ingesloten afbeeldingen (`cid:`) worden zoals altijd getoond;
  - «altijd» — tot 300 adressen, uitsluitend op dit apparaat;
  - achtergronden (`background="…"`) lopen nu via uw server, net als afbeeldingen; video- en audiobronnen en externe SVG-verwijzingen uit een bericht
    worden helemaal niet geladen.
- **Kop** (`MailLezerWerkbalk.tsx`):
  - ∧ «N van M» ∨ — vorige / volgende bericht uit de lijst (ook in zoekresultaten); «Beantwoorden» als hoofdknop; «Context» als schakelaar; «Weergave»;
  - **telefoon:** bovenaan ← ∧ ∨ en «Context» (tijdens zoeken ook de treffernavigator); onderaan binnen duimbereik — Archiveren · Uitstellen ·
    Prullenbak · Meer · Beantwoorden. «Meer» opent «⋮» als een blad boven de balk. Het belletje schuift omhoog boven de balk, en zolang er een blad geopend is
    («Context», «Meer», «?»), verbergt het zich eronder. Kaarten van geminimaliseerde berichten vallen niet over het geopende bericht heen;
  - **smal venster** (< 560 px, bijvoorbeeld «rechts» op 740–852 px): compacte kop, terwijl «Weergave», «Minimaliseren» en «Venster verkleinen»
    naar «⋮» zijn verhuisd, zodat «Terug» en ∧ ∨ altijd op hun plek blijven.
- **Sneltoetsen** (`src/mail/lees-modus.ts`, `src/mail/SneltoetsenHulp.tsx`):
  - R — beantwoorden, A — allen beantwoorden, F — doorsturen als bijlage, E — archiveren, J / K — volgende / vorige, F6 — bericht ⇄ context, Esc,
    ? — hulp;
  - werken niet tijdens het typen van tekst en niet in combinatie met Ctrl / Alt / ⌘; werken ook op een Oekraïense toetsenbordindeling (de fysieke toetspositie telt);
  - naast de lijst — alleen met focus in het bericht; met focus in de berichttekst werken ze eveneens.
- **Esc en «Terug»:** sluiten eerst het blad en daarna pas het bericht. Op de telefoon heeft het blad een eigen stap in de geschiedenis.
- **Tests:**
  - nieuw: `lezer-context-20261024` — 54 controles;
  - nieuw: `gesprek-context-20261024` — 19 controles;
  - `lees-venster-20261024` — bijgewerkt;
  - testopstelling: nieuwe stappen `mail-lezer-context-volledig` en `mail-lezer-context-rechts`. Deze meten de kolom of het blad, de inhoud van elke
    sectie, etiketten, «Weergave», sneltoetsen, Esc en «Terug», de telefoonbalk, en verifiëren dat er vóór «Tonen» geen enkel verzoek naar buiten gaat.
- **Kaart «wat staat waar»:** +10 bestanden van pakket 2 in de sectie «Toegevoegd na hernoeming» (in totaal 17).
- **Wat er voor u is gewijzigd:**
  - externe afbeeldingen zijn standaard verborgen. Terugzetten naar hoe het was: «Weergave» → «Externe afbeeldingen» → «Altijd tonen»;
  - op de telefoon zit «Bericht minimaliseren» onder «Meer»;
  - in een smal venster zitten «Weergave», «Minimaliseren» en «Venster verkleinen» onder «⋮».
- **Niet gedaan (eerlijk vermeld):**
  - reageren op een uitnodiging («Ja / Nee / Misschien») en «u bent vrij op dit tijdstip» — Mail heeft geen toegang tot Agenda (andere dienst). Of
    dergelijke toegang wordt verleend, beslist de eigenaar;
  - versies «Vergelijken», vertaling van het onderwerp en AI-punten — pakket 3;
  - koppelingen worden niet gecontroleerd, maar alleen geopend in een nieuw tabblad zonder doorgeven van het pagina-adres;
  - Safari en Firefox zijn niet getest.
- **Bevinding buiten het pakket.** `backend/extensie-beheer.ts` (`lijst()`) heeft een `LIMIT 500`: op een server met meer dan 500 gebruikers toont de lijst
  niet iedereen. Lokaal faalt hierdoor `extensie-beheer` (28/31), omdat zich in de testdatabase 899 gebruikers hebben opgehoopt. In dit
  pakket niet gewijzigd.
- **Gevonden met de testopstelling en vóór de release opgelost:** op een laag telefoonscherm (640×400) viel de berichtkop over de hulp «?» heen (nu
  ligt de hulp hoger dan de actiebalk); het belletje bedekte tekst en knoppen van de bladen «Context» en «Meer» (verbergt zich nu onder het blad).
- Controles:
  - `tsc` (frontend en server) — 0 fouten;
  - build: kaart, interfacecatalogus 1.174 elementen (+25), L002, slimme inbox, contrast, 6 technische en 496 gewone bundels;
  - tests: 239 bestanden, 8.932 controles (+73 nieuw). Er faalden er 4, geen enkele door dit pakket: 3 in `extensie-beheer` (zie de bevinding
    hierboven) en 1 instabiele in `ruimte-cloud-agenda-20261020` (achtergrondplanner; afzonderlijk gedraaid — twee keer 48/48). 12 RLS-controles slagen
    in 8 RLS-varianten; 3 bestanden zonder resultaat, zoals altijd;
  - testopstelling `mail-lezer-*`: 71 van de 71 zonder gebreken — dezelfde 55 als in pakket 1 plus 16 nieuwe contextmetingen (volledig en rechts op
    8 formaten);
  - e2e in Chromium: `mail-lijst-ux` 26/26, `mail-opstel-venster` 25/25, `mail-verkenning` 1/1, `vensters` 11/11;
  - rendercontrole — 13 pagina's, 505/505 bundels;
  - testopstelling van overige pagina's vergeleken met de build van pakket 1 — 54 opnames, 390 en 1280 px: hub, mail (inbox, etiketten, instellingen, contacten, lijst,
    zoeken in menu), cloud, identiteit, thuis, beheer, MCP, GitHub. Alleen de gegevens verschillen: tijd, testaccount, responstijd
    van de server, lijst van diensten die nog wordt nageladen.

## AV. AI met bronverificatie en tweetalig lezen (24–25-10-2026, pakket 3 «Adaptive Mail Canvas»)

Referentie — het goedgekeurde ontwerp `claude/mail/MAKET-VIKNO-LYSTA-2026-10-24.md`. De hoofdregel van het pakket: **niets verzinnen**. Elk
AI-punt wordt uitsluitend getoond wanneer het bijbehorende citaat woordelijk in het originele bericht voorkomt, met de bron altijd direct ernaast zichtbaar. De behouden componenten
zijn gebleven; nieuwe onderdelen staan in afzonderlijke bestanden in `src/mail/` en `shared/`, elk opgenomen in de kaart «wat staat waar».

- **«Wat wordt er van u verwacht?»** (`src/mail/WatNodigBlok.tsx`, regels — `shared/ai-bronnen.ts`, CSS — `src/mail/ai-blok.css`). Blok
  boven de berichten van een gesprek:
  - **zonder model, direct en zonder iets te versturen** — eenvoudige analyse in de browser. De punten zijn woordelijke zinnen uit berichten die zijn binnengekomen na
    uw laatste antwoord: vragen, verzoeken, deadlines (tot 5). «Kort» — tot 3 feiten: datum met tijd, bijlage, bedrag. Talen:
    nl, uk, en, de, fr, pl;
  - **«Verfijnen met AI»** — uitsluitend met een privé-agent met `mail.read` en alleen na klikken. De agent ontvangt de berichten van het gesprek per alinea
    «[3.2] …» en geeft de punten terug in uw taal. **Elk punt wordt twee keer gecontroleerd — op de server én in de browser:**
    - het citaat moet woordelijk in de originele alinea voorkomen (soort aanhalingstekens en streepjes, spaties en hoofdletters maken niet uit; «…» staat voor delen in
      dezelfde volgorde);
    - een deadline moet in dezelfde alinea van het **origineel** staan, niet van de vertaling;
    - een punt zonder bevestiging wordt niet getoond. De voettekst meldt «Woordelijk in origineel: 4 van 5; de rest wordt niet getoond», en «Niet-gevonden
      tonen» klapt zulke punten open met het etiket «niet gevonden in het bericht»;
  - bij elk punt staat een bronchip «bericht 3 · §3» en een deadline «vóór ma 26 okt.»; «Kort» heeft eveneens bronvermeldingen;
  - acties: **Conceptantwoord** (met AI — het concept van de agent in het antwoordveld; zonder AI — citaten van de punten in het antwoordveld) ·
    **Naar taken** (het taakvenster is al ingevuld: titel en punten met deadlines en bronnen) · **Naar Agenda** (datum en tijd uit het punt);
  - badges: AI — indigo met stippellijn en «AI»; eenvoudige analyse — grijs, zonder stippellijn, «Auto». Altijd is zichtbaar «geen onderdeel van het bericht» en wie
    het heeft samengesteld (naam van de agent of «eenvoudige analyse zonder model»);
  - op de telefoon en in een laag venster (lager dan 860 px) is het blok ingeklapt tot één regel «2 punten · vóór ma 26 okt.». Uw keuze
    (uitklappen / inklappen) wordt op dit apparaat onthouden;
  - het antwoord van de agent wordt voor het gesprek onthouden tot het einde van de sessie, uitsluitend in het paginageheugen: het opnieuw openen van het bericht doet geen nieuw verzoek.
- **Onderwerp:** vertaald onderwerp met daaronder de regel «Origineel: …». De chip **«Antwoord nodig»** verschijnt wanneer het laatste bericht niet van u is en een
  vraag of verzoek bevat; klikken erop opent «Waar komt dit vandaan?».
- **Blad «Waar komt dit vandaan?»** (`src/mail/BronBlad.tsx`):
  - toont het punt en de originele alinea met het gemarkeerde citaat;
  - vertaling van de alinea — alleen met een agent; zonder agent wordt uitgelegd waarom er geen vertaling is;
  - controleresultaat: «Woordelijk gevonden in het origineel. Datum en deadline zijn gecontroleerd aan de hand van de berichttekst, niet de vertaling». Anders staat er
    eerlijk: «niet gevonden», «de door het model genoemde deadline is niet in deze alinea gevonden — deze wordt niet getoond», «het model wees een andere alinea aan;
    de bron is gecorrigeerd»;
  - **«Alinea in bericht tonen»** klapt het bericht open, schakelt over naar het origineel en licht de alinea ~4 s lang rechtstreeks in het bericht op (kader + CSS Custom
    Highlight; de berichttekst zelf verandert niet);
  - **«Punt onjuist — verbergen»** — wordt op dit apparaat voor dit gesprek onthouden; «Verborgen punten herstellen» zet ze terug;
  - blad binnen het berichtvenster: op de telefoon onderaan over de volledige breedte. Esc en «Terug» sluiten eerst dit blad, waarna de focus terugkeert naar de chip.
    Het belletje van de site verbergt zich zolang het blad eronder ligt (ook buiten de telefoon).
- **Vertaalstrook** (`src/mail/VertaalStrook.tsx`, `src/mail/VergelijkTabel.tsx`) boven een bericht in een andere taal: «Taal van bericht:
  Nederlands → Oekraïens · **Origineel / Vertaling / Vergelijken**»:
  - **Vertaling** — op dezelfde plek, met behoud van opmaak (via de privé-agent, zoals voorheen);
  - **Vergelijken** — tabel met alinea's «origineel ↔ AI-vertaling» (§1, §2 …). Bronalinea's van punten zijn gemarkeerd met «Bron voor 2 punten
    · woordelijk gevonden». Op de telefoon staan ze onder elkaar. Het opgemaakte bericht is met één druk op «Origineel» weer terug;
  - zonder agent is alleen «Origineel» beschikbaar en legt de strook uit waarom; het bericht wordt nergens naartoe gestuurd.
- **«Weergave» → «Taal van bericht»** (`src/mail/WeergaveKeuze.tsx`, `src/mail/lees-modus.ts`): «Origineel» (standaard) of
  «Vertalen» — in dat geval wordt een bericht in een andere taal direct bij het openen vertaald. Onder de keuze staat expliciet vermeld dat de tekst naar uw
  AI-agent (met naam) gaat. Geldt uitsluitend op dit apparaat.
- **Contextpaneel** (`src/mail/ContextPaneel.tsx`):
  - «Taken en afspraken» — de punten uit «Wat wordt er van u verwacht?» met bron en deadline; «Naar taken» voor elk punt; «Waar komt dit vandaan?» is ook vanaf hier te openen;
  - «Bijlagen» — **«Vergelijken»** in elke versiegroep. Opent het venster «Versies vergelijken» (`src/mail/VersieVergelijk.tsx`,
    `src/mail/tekst-verschil.ts`, `src/mail/bijlage-tekst.ts`):
    - twee versies, uitsluitend tekst: PDF tot 60 pagina's, DOCX / ODT / RTF, TXT / CSV;
    - verschil per alinea en per woord;
    - scan zonder tekst, onbekend formaat en fout krijgen elk een afzonderlijke, eerlijke melding;
  - de kop «uit gegevens van de berichten, zonder AI» blijft staan zolang het paneel geen modelpunten bevat; daarna staat er «AI-punten zijn gemarkeerd met ‘AI’».
- **Antwoordbalk:**
  - «Doorsturen»;
  - AI-suggesties (met stippellijn) worden ingevoegd in het antwoord; zonder model — «Reageren op bericht 3 · §3» (citaat van de vraag). Dezelfde tekst
    wordt geen tweede keer ingevoegd: noch na dubbelklikken, noch wanneer het bericht opnieuw wordt geopend met een opgeslagen concept;
  - de AI-knoppen («Samenvatting», «Conceptantwoord», toon) zijn van boven het bericht naar deze balk verhuisd. Daarmee is ook een bevinding uit pakket 2 opgelost: de AI-strook
    stak aan de linkerkant buiten het berichtkader uit.
- **Het paneel «AI-analyse en vertaling»** is nu op elk scherm standaard ingeklapt (voorheen alleen op kleine schermen). De knop ⌄ klapt het uit en uw keuze
  wordt onthouden. De statusregels van de vertaling zijn nu ook in het Nederlands beschikbaar en verwijzen in het bericht naar de vertaalstrook.
- **Server** (`backend/ai-vertaling-routes.ts`, nieuwe modus `acties` in `POST /api/owner/mail/ai-vertaling/run`):
  - berichten uit het gesprek: tot de 12 nieuwste, elk tot 8.000 tekens, samen tot 60 alinea's en 22.000 tekens (nieuwere berichten krijgen voorrang);
  - de tekst wordt ontdaan van trackers en geheimen en woordelijk doorgegeven binnen `<untrusted_data>`: instructies in een bericht blijven gegevens;
  - het antwoord van het model wordt gecontroleerd met dezelfde regels uit `shared/ai-bronnen.ts`. Geen antwoord — 503 «De AI-agent gaf geen antwoord…
    er is niets verzonnen», zonder terugvaltekst;
  - dezelfde toegangsregels (uitsluitend een privé-agent met `mail.read`), cache en snelheidslimieten als voor de overige modi.
- **Tussendoor opgelost:**
  - het opschonen van tekst voor AI verwijderde «?» en «&» in gewone zinnen in plaats van alleen trackerparameters in URL's;
  - de taalherkenning beschouwde elk bericht met «[ПРИХОВАНО_СЕКРЕТ]» als Oekraïens;
  - knoppen in het contextpaneel waren 16 px in plaats van 13 px: de regel `.mail-functional button` overschreef hun grootte. Dezelfde regel
    overschreef ook de knoppen van het nieuwe blok — gevonden door de testopstelling;
  - het venster «Toevoegen aan taken» kon vooringevulde gegevens van een eerdere klik op «Naar Agenda» overnemen.
- **Tests:**
  - nieuw: `ai-bronnen-20261024` — 55 controles (regels zonder DOM: alinea's, woordelijk zoeken, verificatie, datums en deadlines nl / uk / en / pl,
    eenvoudige analyse, «Antwoord nodig», markering); `lezer-ai-20261024` — 61 (blok, «Waar komt dit vandaan?», strook, tabel, contextpaneel,
    «Taal van bericht», verbanden, CSS, suggestie zonder herhaling); `ai-acties-20261024` — 30 (servermodus `acties`); `versie-vergelijk-20261024` — 50
    («Versies vergelijken», inclusief een echte PDF);
  - bijgewerkt omdat het gedrag bewust is gewijzigd: `mail-ux-beoordeling-20261021` (AI-paneel ook op de computer ingeklapt),
    `mail-ai-knoppen-20261019` (AI-knoppen in de antwoordbalk), `lezer-context-20261024` (taakvenster met voorstel, ruimere
    selector voor het belletje), `ai-vertaling` (+1 controle: «?» en «&» in gewone tekst);
  - testopstelling: nieuwe stappen `mail-lezer-ai-volledig` en `mail-lezer-ai-rechts` (`tests/e2e/hulp/stand-lezer-ai.ts`). De gesimuleerde privé-agent
    levert 4 echte punten en 1 verzonnen punt; echte PDF's van drie versies van een overeenkomst.
- **Kaart «wat staat waar»:** +17 bestanden van pakket 3 in de sectie «Toegevoegd na hernoeming» (in totaal 34).
- **Wat er voor u is gewijzigd:**
  - het paneel «AI-analyse en vertaling» is ook op de computer standaard ingeklapt. Uitklappen kan met de knop ⌄ rechts op die rij; uw keuze wordt onthouden;
  - de AI-knoppen («Samenvatting», «Conceptantwoord») staan nu in de antwoordbalk onder het bericht in plaats van erboven;
  - in een laag venster (lager dan 860 px) is het blok «Wat wordt er van u verwacht?» standaard ingeklapt; eenmaal uitgeklapt blijft het uitgeklapt.
- **Niet gedaan (eerlijk vermeld):**
  - er wordt gecontroleerd dat het **citaat** woordelijk in het bericht voorkomt en dat de **deadline** in dezelfde alinea staat. De formulering van het punt zelf komt van
    het model; daarom staat de bron er altijd naast en toont «Waar komt dit vandaan?» het origineel;
  - de eenvoudige analyse zoekt vragen, verzoeken en deadlines op basis van signaalwoorden. Een indirect verzoek zonder zulke woorden kan worden gemist;
  - er is hier geen echt model aangeroepen: in deze omgeving ontbreekt een sleutel, zodat de testopstelling een privé-agent simuleert. Eén van zijn punten is
    opzettelijk verzonnen en werd door de verificatie afgewezen;
  - «Taal van bericht: Vertalen» stuurt elk geopend bericht in een andere taal naar de agent — daarom staat dit standaard op «Origineel»;
  - «Versies vergelijken» vergelijkt uitsluitend tekst, zonder OCR op scans;
  - Safari en Firefox zijn niet getest.
- **Gevonden met de testopstelling en tests en vóór de release opgelost:**
  - «Alinea in bericht tonen» lichtte de alinea niet op: het iframe-document komt uit een ander venster, waardoor `instanceof Document` altijd false gaf
    (nu via `nodeType`);
  - de markeringskleur werd geblokkeerd door de CSP van het bericht (`style-src-elem 'self'`): nu via een in code aangemaakt stylesheet (`adoptedStyleSheets`);
  - knoppen en chips van het blok waren 16 px (`.mail-functional button`), en de voettekst kreeg de globale `footer`-regel uit `index.css` (marge van
    2rem, rand) — nu met hogere specificiteit en expliciete reset; hetzelfde geldt voor het venster «Versies vergelijken»;
  - de tabelkop van «Vergelijken» in `<caption>` werd op de telefoon samengedrukt tot een smalle kolom — de kop staat nu boven de tabel;
  - het belletje viel ook buiten de telefoon over «Waar komt dit vandaan?» heen (852×480, «rechts» 740–768) — verbergt zich nu zolang het blad eronder ligt;
  - op 1280×800 duwde een uitgeklapt blok het bericht zelf onder de onderrand uit — in een laag venster is het blok nu standaard ingeklapt;
  - de eenvoudige analyse herkende geen woordgrenzen bij cyrillische woorden en Poolse woorden op «ę» (`\b` in JavaScript kent alleen A–Z, 0–9 en _):
    «500 грн», «У вкладенні», «З повагою», «proszę»; de citaatkop «… schrijft:» kapte het bericht niet af; in tekst met emoji's verschoof de markering
    met één teken;
  - een suggestie waarop voor een tweede keer werd geklikt, werd nogmaals in het antwoord ingevoegd. Omdat het concept op de server wordt bewaard, werd de tekst in het antwoord bij elk volgend
    formaat van de testopstelling herhaald (1, 2, 3 keer); dubbelklikken had hetzelfde effect. Nu wordt tekst die al in
    het concept staat geen tweede keer ingevoegd — alleen de focus springt naar het antwoord. De platte tekst van het concept wordt uitgelezen via `DOMParser`
    (laadt geen afbeeldingen en voert niets uit) in plaats van via `innerHTML`.
- **Bevindingen buiten het pakket:**
  - `backend/extensie-beheer.ts` — `LIMIT 500` (zie AU), niet gewijzigd;
  - de modi «Korte samenvatting» / «Doel» / «Context» van het AI-paneel (`backend/ai-vertaling-routes.ts`, modus `summary` e.a.)
    stellen zonder modelantwoord een «samenvatting» samen uit de eerste zinnen en algemene adviezen («Neem kennis van de inhoud…») zonder aan te geven dat
    dit niet door een model is opgesteld. Dit druist in tegen de regel «niets verzinnen». In dit pakket niet gewijzigd omdat het bestaande modi raakt. Kan
    afzonderlijk worden rechtgezet: net zo eerlijk als `acties`.
- Controles:
  - `tsc` (frontend en server) — 0 fouten;
  - build: kaart, interfacecatalogus 1.194 elementen (+20), L002, slimme inbox, contrast, 6 technische en 497 gewone bundels;
  - tests: 243 bestanden, 9.129 controles (+197). Er faalden er 3 — in `extensie-beheer` (`LIMIT 500`, zie AU), niet door dit pakket.
    `ruimte-cloud-agenda-20261020` slaagde ditmaal met 48/48. 12 RLS-controles slagen in 8 RLS-varianten; 3 bestanden zonder resultaat, zoals altijd;
  - testopstelling `mail-lezer-*` (alle 12 stappen, 8 formaten, licht en donker thema, plus een Nederlandse run) — 99 metingen:
    - stappen van pakketten 1–2 in het Oekraïens — 71 van de 71, net als in pakket 2;
    - nieuwe AI-stappen — 18 van de 18 (8 formaten × 2 modi + Nederlandse run). In de eerste run van deze build gaven 3 metingen
      «12 px in plaats van 13 px» aan, omdat de controle van de testopstelling de knop «Vergelijken» meenam, die bewust 12 px is. De controle is aangepast en de stappen
      zijn opnieuw gedraaid op dezelfde build. Na de correctie van de suggestie-invoeging zijn de AI-stappen nogmaals herhaald op de definitieve build (`LZ-p3g`) — opnieuw 18 van de 18;
      de suggestie staat op elk formaat exact één keer in het antwoord, zelfs na dubbelklikken. De stappen van pakketten 1–2 zijn gemeten op de
      build vóór deze kleine correctie, aangezien die uitsluitend het invoegen van de suggestie raakt;
    - axe (WCAG 2.2 AA) op het blok, «Waar komt dit vandaan?», de tabel en strook en «Versies vergelijken» — 0 schendingen (92 gecontroleerde gebieden);
      contrast in licht en donker thema — 0;
    - op de nieuwe elementen geen enkel gebrek; de overige opnamegebreken betreffen dezelfde lijst- en berichtelementen als in pakket 2 (538 → 550:
      tijdstip in de lijst, deels zichtbare elementen op de rand van de opname);
    - de Nederlandse run van de contextstappen uit pakket 2 gaf twee keer «niet geslaagd»: die controles zoeken naar Oekraïense woorden («Мітки»,
      «3 версії»), terwijl deze elementen op de opnames in het Nederlands staan. Geen regressie;
  - e2e in Chromium: `mail-lijst-ux` 26/26, `mail-opstel-venster` 25/25, `mail-verkenning` 1/1, `vensters` 11/11;
  - rendercontrole — 13 pagina's, 506/506 bundels;
  - testopstelling van overige pagina's vergeleken met de build van pakket 2 — 54 opnames, 390 en 1280 px (hub, mail, cloud, identiteit, thuis, beheer,
    MCP, GitHub): alleen de gegevens verschillen (tijd, testaccount, responstijd van de server, lijst van diensten die nog wordt nageladen).

## AW. Zwevende knoppen: zones en sleuven (25-10-2026)

Referentie — het goedgekeurde voorstel `claude/omlijsting/MAKET-PLAVAYUCHI-KNOPKY-2026-10-25.md` (besluit van de eigenaar: de actiestapel zweeft boven
de lijst; een volle zone weigert een knop en geeft een melding; meldingenteller ook op ☰; alles in één pakket). Knoppen berekenen hun
positie niet langer vanaf de schermranden of ten opzichte van elkaar: elke knop staat in een sleuf van een zone en de browser (flex) deelt de zone in. Er is niets verwijderd —
het belletje, het paneel, het geluid, de teller, «Opstellen», «Naar boven» en de zwevende meldingen zijn gebleven; veranderd is waar ze staan en hoe u ze verplaatst.

- **Model zonder DOM** (`shared/plaatsing.ts`):
  - apparaatklassen: telefoon ≤ 700 px, tablet ≤ 1099 px, computer;
  - zones: `bovenbalk` (bovenbalk, rij), `lade-kop` (menukop, alleen telefoon), `zijbalk` (als menu-items), `actiestapel`
    (actiestapel in de hoek van het inhoudsgebied, kolom). Capaciteit (telefoon / tablet / computer): 5 / 6 / 6, 2 / 0 / 0, 3 / 3 / 3, 3 / 3 / 3;
    vaste bewoners van een zone (zoeken, foto) en dienstknoppen (in Mail ⟳ en ⚙, op de telefoon ook de foto van het postvak) tellen mee voor de capaciteit;
  - knoppen: `bel`, `opstellen` («Opstellen», alleen Mail), `naar-boven` («Naar boven», alleen in de stapel). Standaard: telefoon — belletje in de menukop
    rechts van de foto, «Opstellen» in de stapel met daarboven de sleuf «Naar boven»; tablet en computer — belletje in de bovenbalk rechts van
    de foto;
  - `indeling(voorkeur, ctx)` → knoppen per zone; `verplaats(...)` → nieuwe indeling of weigering (`vol` met hulptekst,
    `niet-toegestaan`); `terugzetten`, `normaliseerPlaatsing`; `stapelRechthoek` voor het vensterdock;
  - de indeling wordt opgeslagen in de menu-instellingen (`shared/menu-model.ts`, veld `plaatsing`), afzonderlijk per apparaatklasse, per
    account en per ruimte — net als het menu. Geen nieuwe tabel en geen migratie.
- **Zones in de omlijsting** (`src/CanoniekOmlijsting.tsx`, `src/plaatsing/Plek.tsx`, `src/plaatsing/plaatsing-staat.ts`):
  - elke zone is een echt opmaakblok met sleuven (`<Gniezda>`); de sleuven bestaan al voordat de knop verschijnt, zodat er na F5 niets verspringt;
  - een knop wordt via een portal in zijn sleuf getekend (`<Plek knop=…>`); de vorm is rond in de zones en een rij «icoon + naam» in het menu;
  - actiestapel — `position: fixed` in de hoek van het inhoudsgebied: rechts van het menu, links van een menu rechts (dock «rechts» 60 / 310 px),
    boven onderste balken (verbindingsbanner, onderste berichtbalk, geminimaliseerd bericht, dock onderaan als dat tot de hoek reikt — gemeten met
    `ResizeObserver` + `MutationObserver`), in het venster van een ander programma (iframe) — 72 px vanaf de rand (L002). De inhoud heeft onderaan extra ruimte ter hoogte
    van de stapel;
  - wanneer «Opstellen» in Mail naar de bovenbalk wordt verplaatst, schuift de opdrachtbalk van Mail op over de breedte van de bezette sleuven.
- **Belletje** (`src/CanoniekMeldingencentrum.tsx`): eigen x,y-coördinaten vanaf `visualViewport`, eigen sleepfunctie en `tsv:bel-geplaatst`
  zijn vervangen door een sleuf. Het paneel is gekoppeld aan het belletje (`placeNear`, zoals voorheen); wanneer het belletje niet zichtbaar is — rechtsboven. Wanneer het paneel
  boven het belletje opent (belletje in de stapel), is de hoogte niet groter dan de hoogte waarmee de bovenkant is berekend. Het onderdeel «Terugzetten naar de hoek» heet nu
  «Terugzetten naar standaardplek». De teller voor ongelezen meldingen staat ook op ☰ (`.plaats-menu-teller`, eveneens in het knoplabel) wanneer
  het belletje in het menu staat.
- **Zwevende melding — op een vrije plek** (`src/plaatsing/melding-plek.ts`). Twee voorwaarden van uw kant: uit het voorstel — «op de computer onder
  het belletje, op de telefoon bovenaan onder de balk, niet boven de stapel»; uit QA 12-10 (nr. 11 / M7) — een melding valt nooit over knoppen heen (anders raakte een klik na het
  automatisch verdwijnen een verborgen rijknop). De testopstelling liet zien dat een melding onder het belletje in Mail over «‹ 1–10 van 18 ›» heen viel.
  Nu worden kandidaten op volgorde getoetst en wint de eerste waaronder zich geen kleine knop bevindt (knoppen, koppelingen, velden; grote klikgebieden over een
  volledige rij tellen niet mee, net als op 12-10):
  - computer: onder het belletje → onderaan midden in het inhoudsgebied (zoals op 12-10) → bovenaan midden onder de balk → eerste vrije strook in die
    kolom;
  - telefoon (over de volledige breedte): bovenaan onder de balk → boven de stapel → eerste vrije strook tussen balk en stapel;
  - als er geen enkele vrije plek is — de eerste kandidaat, zichtbaar in `data-melding-vrij="nee"`; de gekozen plek staat in `data-melding-plek`;
  - gemeten op de testmail: computer — bovenaan in het midden tussen «Postvak IN» en «‹ 1–10 van 18 ›»; telefoon — bovenaan onder de balk; hub op
    de telefoon — in de vrije strook onder de balk van het «Werkblad» (bovenaan staan daar de knoppen «Instellen» en «Widgetgegevens vernieuwen»);
  - op de telefoon staat de melding op één regel (tekst en knoppen naast elkaar) op alle pagina's en op elke telefoonbreedte; voorheen gold dat alleen in
    Mail tot 520 px, waardoor een melding van twee regels op 640×400 over «‹ 1–10 van 18 ›» heen viel;
  - tussendoor opgelost: met een technisch profiel schoof de melding op de computer, wanneer de balk verborgen was, een halve breedte naar links — een overblijfsel van de
    centrering van 12-10 (`translate: -50%` in `tech/tech.css`). Opgelost: nu geldt dezelfde uitlijning als voor het paneel.
- **«Opstellen»** (`src/MailOpstelZwevend.tsx`) en **«Naar boven»** (`src/CanoniekOmlijsting.tsx`) staan nu in de actiestapel; `fabPlaats()` is verwijderd
  (`src/mail-opstel-plaats.ts` is gebleven met de geschiedenis en gedeelde types). Het vensterdock (`src/platform/vensters.tsx`,
  `venster-dok-logica.ts`) wijkt uit voor de rechthoek van de stapel in plaats van die van het belletje.
- **Verplaatsen** (`src/plaatsing/plaats-slepen.ts`, `plaats-flip.ts`):
  - aanraken: 450 ms ingedrukt houden zonder beweging (beweging eerder > 8 px betekent scrollen); muis: 5 px;
  - tijdens het slepen — gemarkeerde zones met teller «4 van 5» (+1 boven de zone), de plek van herkomst met een stippellijn, een geopende sleuf tussen de buren
    (FLIP 160 ms, zonder animatie bij «beweging verminderen»); een volle zone krijgt een rood kader en een toelichting;
  - beweegt u naar ☰ of het menu — het menu klapt na 650 ms open, beweegt u weg — het klapt na 400 ms weer in (als het slepen niet in het menu begon);
  - loslaten buiten een zone, `pointercancel`, Esc — de knop blijft waar hij stond;
  - zonder slepen: lang indrukken zonder beweging, rechtermuisklik, Shift+F10 / menutoets, of in «Menu bewerken» klikken → «Verplaatsen
    naar…» (`PlaatsActies` in `Plek.tsx`): zones met tellers, «Naar links / Naar rechts» of «Omhoog / Omlaag», «Terugzetten naar standaardplek»,
    «Alle knoppen terugzetten naar standaard», «Sluiten»; focus in het menu, Esc zet de focus terug op de knop; het resultaat wordt gemeld via `aria-live`.
- **Één CSS-laag** (`src/plaatsing/plaatsing.css`): zones, sleuven, stapel, verbergen onder vensters («Nieuw bericht», lade, zoekpalet,
  geopend bericht, meldingenpaneel — via `visibility`, niets verschuift), zwevende melding op de telefoon, weergave tijdens slepen en
  «Verplaatsen naar…». Uit andere bestanden zijn de regels verwijderd die nu in deze laag zitten: `canoniek-omlijsting.css` (marge van 140 px en 6 verschuivingen van «Naar boven»
  via `:has()`), `menu-v2.css`, `mail-qa-2026-10.css` (verbergen van FAB en belletje, meldingsposities), `mail-ux-beoordeling-20261021.css`,
  `mail-nieuw-bericht.css`, `zoek/zoek.css`; `tech/tech.css` compenseert de technische balk voortaan voor de stapel in plaats van voor het belletje. Voorwaardelijke regels
  (`:has(…)`) voor het belletje, «Opstellen», «Naar boven» en de melding buiten deze laag: waren er 15 in 4 bestanden, nu nog 2 — voor de melding specifiek in
  Mail (`mail-qa-2026-10.css`: bovenaan wanneer «Nieuw bericht» geopend is; verborgen op de telefoon wanneer het menu geopend is); in de gedeelde laag zouden die op
  alle pagina's gelden en daarom zijn ze niet verplaatst.
- **Groeibewaking** (`scripts/plaatsing-controle.mjs`, buildstap na de kaart): een knop `<Plek knop=…>` zonder vermelding in de catalogus of
  twee keer getekend, standaardplekken boven de capaciteit op een willekeurige klasse, afmetingen in CSS ≠ model, of een nieuwe regel `position: fixed` buiten
  de laag (vergeleken met de lijst van bestaande — `scripts/plaatsing-vaste-elementen.json`, 114 regels) → de build stopt met de aanwijzing
  «hoort in een zone».
- **Één Esc — één laag:** Esc van het meldingenpaneel (in de capture-fase, zodat op de telefoon eerst het paneel sluit en niet het menu) doet niets
  wanneer de focus in een andere laag met een eigen Esc-afhandeling staat — tekstballon van een menu-item, «Verplaatsen naar…», contextmenu, zoeken — of op een menu-item
  met een geopende tekstballon. Gevonden met de testopstelling: één druk op Esc sloot zowel de tekstballon als het paneel.
- **Tests:**
  - nieuw: `plaatsing-20261025` — 56 controles (model op alle klassen, verplaatsen en weigeringen, normalisatie, buildcontrole
    op geïnjecteerde fouten, zoneweergave, CSS-laag zonder `display:none` en zonder animatie van `left/top`, sleuven ≥ 44 px, één Esc —
    één laag, vrije plek voor melding: volgorde van kandidaten, uitwijken wegens knop, vrije strook);
  - bijgewerkt omdat het gedrag bewust is gewijzigd: `meldingen-mobiel-20261021` (34; 7 controles op de oude x,y-positie vervangen door controles op
    sleuven), `venster-dok-20261021` (54, +1), `ui-audit-g`, `vast-kader`, `mail-ux-beoordeling-20261021`, `zoek-in-menu-20261024`,
    `zoek-bronnen-20261022` (itemnaam), `scripts/l002-audit.mjs` (iframe 72 px — nu op de stapel);
  - QA-stappen van Mail voor de telefoon (`tests/e2e/hulp/mail-qa-stappen-telefoon.json`): belletje via ☰; zoeken op de veldnaam «Zoeken in
    mail», omdat op de telefoon in het veld zelf «Zoeken» staat (de stap slaagde ook al niet op de build van pakket 3, waarna Enter een bericht opende);
  - testopstelling: nieuwe stap `plaatsing-na` (15 metingen A–O: standaardplekken, melding, scrollen, adresbalk, «Naar boven», vegen, zoom ×3,
    onderste balk, slepen met F5, volle zone via menu, toetsenbord, computer ↔ telefoon, belletje als rij in het menu, «Menu bewerken»,
    «Terugzetten»), `plaatsing-dok` (dock rechts / boven / onder, uitgerekt dock) en `plaatsing-lagen` (tellers, melding bij volle zone,
    «Verplaatsen naar…» in licht en donker thema met axe; melding op de hub) — `tests/e2e/hulp/stand-plaatsing.ts`; `plaatsing-nu` is gebleven
    als nulmeting «voor»; stappen van de testopstelling met het belletje (`stand-meldingen`, `stand-sferen-20261022`, `stand-toegankelijk`, `stand-zoek-menu`)
    openen op de telefoon eerst het menu.
- **Kaart «wat staat waar»:** +11 bestanden in de sectie «Toegevoegd na hernoeming» (in totaal 45).
- **Wat er voor u is gewijzigd:**
  - op de telefoon staat het belletje in het menu rechts van de foto en toont ☰ het aantal ongelezen meldingen; naar de pagina verplaatsen kan door ingedrukt te houden of via «Verplaatsen naar…»;
  - de oude positie van het belletje (x,y) is niet overgenomen: iedereen begint op de standaardplekken, waarna elke apparaatklasse zijn eigen indeling onthoudt. Op de computer
    en tablet levert de regel uit het voorstel («rechtsboven → bovenbalk, anders standaard») precies dezelfde plek op als de standaardplek; op de telefoon
    zou die regel het belletje in de bovenbalk plaatsen — precies waarover geklaagd werd. Het veld `belPositie` in het item is niet verwijderd;
  - een veegbeweging die op een knop begint, scrolt de pagina; verplaatsen doet u door de knop ingedrukt te houden;
  - de melding op de computer verschijnt op een vrije plek: onder het belletje of, als daar knoppen staan, onderaan of bovenaan in het midden (op de test-Mail —
    bovenaan in het midden, tussen «Postvak IN» en de paginering); op de telefoon — op één regel, bovenaan onder de balk, en als daar knoppen staan in de eerste vrije
    strook eronder.
- **Niet gedaan (eerlijk vermeld):**
  - de oude positie van het belletje is niet gemigreerd (zie hierboven);
  - «Opstellen» zweeft op de telefoon boven de lijst (uw keuze): direct na het laden kan er een rij deels onder liggen; dankzij de extra ruimte onderaan
    kunt u elke rij boven de knoppen scrollen;
  - melding: als er helemaal geen vrije plek is, wordt de eerste plek gebruikt (op de telefoon bovenaan onder de balk) en is dit zichtbaar in het attribuut
    `data-melding-vrij="nee"`; op de pagina's van de testopstelling kwam dit niet voor. De plek wordt gekozen op het moment dat de melding verschijnt — als er daarna een knop onder
    verschijnt (doordat de lijst verder laadt), verplaatst de melding zich niet meer (leeft maximaal 10 s);
  - klikken op een knop in «Menu bewerken» is getest op de telefoon; op de computer wordt die modus geopend vanuit de menu-instellingen en bereikt u hetzelfde
    menu via rechtermuisklik of Shift+F10;
  - de buildcontrole ziet alleen CSS: een gefixeerde knop die rechtstreeks via een inline-stijl in de componentcode wordt geplaatst, wordt er niet door onderschept;
  - 2 regels voor de zwevende melding zijn in `mail-qa-2026-10.css` gebleven (zie «Één CSS-laag»);
  - het zoomniveau van de browser (Ctrl +) verandert de apparaatklasse samen met de lay-out van de site: 1280 px op 200 % geeft de telefoonlay-out, en de knoppen
    komen dan op de plekken terecht die voor de telefoon zijn ingesteld;
  - de adresbalk en knijpzoom zijn op de testopstelling gesimuleerd (vensterhoogte ±56 px, `Emulation.setPageScaleFactor`); vegen via CDP scrolt in emulatie de
    pagina niet — alleen het stil blijven staan van de knop is gemeten. Echte telefoons, Safari en Firefox zijn niet getest.
- **Gevonden met de testopstelling en tests en vóór de release opgelost:**
  - de melding onder het belletje viel in Mail over «‹ 1–10 van 18 ›» heen (uw voorwaarde uit QA 12-10 nr. 11) → vrije plek (zie hierboven); op
    640×400 viel een melding van twee regels over dezelfde knoppen heen → nu op één regel op alle telefoonformaten;
  - met een technisch profiel en verborgen balk schoof de melding op de computer een halve breedte naar links (`translate: -50%` van de
    centrering van 12-10) → opgelost;
  - «Verplaatsen naar…» kreeg geen focus: het menu is onzichtbaar totdat het gepositioneerd is → focus na positionering, Esc in de capture-fase van het
    document;
  - de zoneteller bij de linkerrand werd afgesneden → blijft nu binnen de schermgrenzen; boven de zone toont de teller al het aantal inclusief de knop (+1);
  - in het menu «Verplaatsen naar…» drongen globale `h2`- en `footer`-stijlen uit `index.css` door → eigen klassen;
  - 768×1024, 36 meldingen, belletje in de stapel: het paneel opende boven het belletje waardoor de onderkant («Terugzetten naar standaardplek») buiten het
    scherm viel → hoogte begrensd;
  - telefoon, «Menu bewerken»: tikken op «Opstellen» sloot de lade en daarmee ook de bewerkmodus → uitzondering voor de stapel en het
    verplaatsingsmenu;
  - Esc sloot samen met het meldingenpaneel ook de lade (op de telefoon staat het belletje in de lade) → eerst sluit alleen het paneel;
  - één druk op Esc sloot zowel de tekstballon van een menu-item als het meldingenpaneel → één Esc per laag;
  - testopstelling: de controle voor het dock onderaan ging ervan uit dat het dock de volledige breedte besloeg (het is een gecentreerde capsule) → horizontale overlap plus een aparte test voor een uitgerekt
    dock; tijdsdrempel voor adresbalk → aantal posities; een muis die boven een menubadge achterbleef opende in de volgende stap de tekstballon →
    muis wordt geparkeerd; `a11y-meldingen` drukte op Esc nadat de focus al uit het (op de computer niet-modale) paneel was verdwenen → eerst focus terug in het
    paneel; de QA-zoekstap op de telefoon zocht het veld op het etiket «Zoeken in mail», terwijl daar op de telefoon «Zoeken» staat → nu op veldnaam.
- Controles:
  - `tsc` (frontend en server) — 0 fouten;
  - build: kaart, `plaatsing-controle`, interfacecatalogus 1.194 elementen (ongewijzigd), L002 (47 bestaande bevindingen, geen nieuwe), slimme
    inbox, contrast, 6 technische en 497 gewone bundels;
  - tests: 244 bestanden, 9.131 controles (+50 ten opzichte van pakket 3: `plaatsing-20261025` +56, `venster-dok` +1, `meldingen-mobiel` −7). In de
    gewone run faalden er 12 — de RLS-controles die in de 8 RLS-varianten slagen (534 van de 534); 3 bestanden zonder resultaat, zoals
    altijd. `extensie-beheer` — 31 van de 31: in pakket 3 faalden daar 3 controles omdat de testdatabase 977 testgebruikers had verzameld
    terwijl de lijst begrensd is op 500; de oude testrecords zijn opgeschoond (back-up bewaard);
  - testopstelling op de definitieve build — 82 metingen, allemaal zonder gebreken:
    - `plaatsing-na` — 8 formaten (360–1704 px, licht en donker thema) + Nederlands op 1280 en 390 px = 10;
    - `plaatsing-dok` — 5 formaten vanaf 740 px + Nederlands = 6;
    - `plaatsing-lagen` — 8 formaten + Nederlands op 1280 en 390 px = 10: axe (WCAG 2.2 AA, inclusief contrast) op tellers, melding bij
      volle zone en «Verplaatsen naar…» in licht en donker thema — 0 schendingen; Esc tijdens slepen zet de knop terug op zijn plek; melding op
      de hub staat op een vrije plek;
    - `mail-meldingen-paneel-vol`, `mail-meldingen-fab-bel`, `mail-zoek-in-menu`, `a11y-meldingen`, `a11y-fab-bel`, `sferen-bel-prive`,
      `sferen-band-technisch` — elk 8 van de 8;
  - gemeten (`plaatsing-na`, alle 8 formaten): scrollen — 1 positie; adresbalk ±56 px — 2 posities (één stap), rust binnen
    4–39 ms, 0 frames met overlap (pakket 3: 14 posities, 250–280 ms, 8 frames met overlap); zoom ×3 — knoppen bewegen niet; F5 — vanaf
    het eerste frame één positie; melding — op elk formaat geen enkele knop eronder; slepen, volle zone, toetsenbord, computer ↔
    telefoon, «Terugzetten» — zoals beschreven;
  - algemene opnameheuristiek: uitsluitend lijstrijen (afgekapte afzendernamen, kleine knoppen in rijen) — dezelfde als voorheen; op de nieuwe
    elementen geen enkele;
  - overige pagina's (54 opnames, 15 stappen, 390 en 1280 px: hub, mail, cloud, identiteit, beheer, MCP, GitHub, inclusief
    technisch profiel) vergeleken met de build van pakket 3: alleen de verwachte verschillen — belletje rechts van de foto / in de menukop, teller
    op ☰, accountmenu opgeschoven samen met de foto, melding op de telefoon bovenaan onder de balk, extra ruimte onderaan de pagina (van −158 tot +128 px:
    de oude marge van 140 px voor «Naar boven» is vervangen door ruimte ter hoogte van de stapel), gegevens (tijd, testaccounts, responstijd), hoogte van de zijbalk
    op paginabrede opnames. Één verschil: de tooltip boven de modusknop van het menu is zichtbaar op de oude opname en niet op de nieuwe; bij
    afzonderlijke herhalingen van deze stap klapte het menu noch op de oude, noch op de nieuwe build open, zodat de oorzaak niet sluitend is vastgesteld (hoogstwaarschijnlijk de
    hoverstatus van de muis tussen stappen);
  - e2e in Chromium: `mail-lijst-ux` 26/26, `mail-opstel-venster` 25/25, `mail-verkenning` 1/1, `vensters` 11/11; strenge QA-stappen
    van Mail (12-10): telefoon 23/23, computer 25/25 (inclusief de controle dat de melding niet rechts over knoppen heen ligt);
  - rendercontrole — 13 pagina's, 506/506 bundels.
