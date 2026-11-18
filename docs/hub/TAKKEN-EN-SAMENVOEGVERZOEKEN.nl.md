> 🌐 **Taal / Мова:** [Українська](ГІЛКИ-ТА-ЗАПИТИ-НА-ЗЛИТТЯ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)
> 🧭 **Hub-secties (`docs/hub/`):** [1. Architectuur](./ARCHITECTUUR.nl.md) · [2. Geschiedenis](./GESCHIEDENIS.nl.md) · [3. Takken, PR's & Releases](./TAKKEN-EN-SAMENVOEGVERZOEKEN.nl.md) · [4. Mapstructuur](./MAP-STRUCTUUR.nl.md) · [5. Omgevingsvariabelen](./OMGEVINGSVARIABELEN.nl.md) · [6. Orchestratie & Uitrol](./ORCHESTRATIE-EN-UITROL.nl.md)

# Volledig Register van Takken (71), Pull Requests (#1–#27) en Releases (GitHub Releases)

De repository `Tarasevych/hub` telt **71 takken (branches)**, **27 Pull Requests (`#1`–`#27`)** en **18+ officiële GitHub Releases**. Dit document bevat de volledige classificatie met directe links naar GitHub, zodat elke ontwikkelaar of AI-agent direct ziet welke takken canoniek zijn, welke actief in ontwikkeling zijn, welke al zijn samengevoegd in `voornaamst` en welke tot het historische archief behoren.

> [!IMPORTANT]
> **Hoofdregel voor taknavigatie:**
> 1. De huidige canonieke staat van het project bevindt zich in de takken **[`voornaamst`](https://github.com/Tarasevych/hub/tree/voornaamst)** en **[`integratie`](https://github.com/Tarasevych/hub/tree/integratie)** (beide wijzen naar dezelfde basis-commit `3095e5f` per synchronisatie `B-009`).
> 2. Alle **28 takken uit Categorie 1.3** zijn al **volledig samengevoegd** (`✅ Samengevoegd`) in de geschiedenis van `voornaamst` — hun code zit al in de hoofdtak.
> 3. **9 takken uit Categorie 1.2** bevatten **nieuwe, nog niet samengevoegde commits van 04-11-2026** (`🔄 Actief / Kandidaat`) bovenop of parallel aan `voornaamst`.
> 4. **30 takken uit Categorie 1.4** (september — 16 oktober 2026) zijn **archieftakken van vóór de consolidatie van de productie-snapshot `SEC-001` (30-10-2026)** (`📦 Archief`). Hun werk is al opgenomen in de codebase via snapshot `016093f`; ze hoeven dus **niet** rechtstreeks in `integratie` of `voornaamst` te worden gemerged.

---

## 1. Register van alle 71 Takken op GitHub (4 Groepen)

### 1.1. Hoofd- en Integratietakken (2 takken)

| Tak | Commit | Datum | Status | Rol en Doel |
|---|---|---|---|---|
| **[`voornaamst`](https://github.com/Tarasevych/hub/tree/voornaamst)** | `3095e5f` | 2026-11-04 | 🌟 **Standaardtak** | Publieke hoofdtak van de repository. Bevat de volledige samengevoegde platformcode (179 commits na consolidatie), het orchestratiesysteem `ORCH-001`, `TRACE-001`, `INTEG-001`, `MAILORBIT/MOB/POLISH-001` en regels `B-009` (`regelsVersie 1.4.2`). |
| **[`integratie`](https://github.com/Tarasevych/hub/tree/integratie)** | `3095e5f` | 2026-11-04 | 🛡️ **Integratie** | Doeltak van de sequentiële integratiewachtrij voor agenten (`orchestratie/wachtrij.json`). Samenvoegen gebeurt uitsluitend via `--no-ff` zonder force-push. |

---

### 1.2. Actieve Takken in Uitvoering en Merge-kandidaten — November 2026 (9 takken)

#### A. Gegevensbescherming, Opschoning van Persoonsgegevens en Regels `1.4.6` (`PRIVACY-001`)
| Tak | Commit | T.o.v. `voornaamst` | Agent / Auteur | Wat zit erin en waar te vinden |
|---|---|---|---|---|
| **[`release/persoonsgegevens-20261104-164147`](https://github.com/Tarasevych/hub/tree/release/persoonsgegevens-20261104-164147)** | `6483f3f` | **+7 commits** (0 achter) | Claude | **Hoofd-releasekandidaat `PRIVACY-001` (besluiten `B-010` en `B-011`, `regelsVersie 1.4.6`).** Volledige verwijdering van persoonsgegevens en IP-adressen uit code, tests en documentatie; variabelen `MR_EIGENAAR_NAAM`, `MR_CONTACT_EMAIL`, `MR_BEHEERSUBNET`, `MR_VM_SSH`; vastlegging van `*.sh text eol=lf` in `.gitattributes` en `git -c core.autocrlf=false archive` in `maak-voorstelpakket.sh`; bijgewerkte `regels.lock.json` en dossier `orchestratie/ontwikkelarchieven/PRIVACY-001.json`. |
| **[`fix/persoonsgegevens-uit-code-20261104`](https://github.com/Tarasevych/hub/tree/fix/persoonsgegevens-uit-code-20261104)** | `8d2580d` | **+1 commit** (0 achter) | Claude | Tussentak van de eerste stap `FIX-PERSOONSGEGEVENS` (verplaatsen van eigenaarsgegevens uit code naar configuratie; opgenomen en uitgebreid in `release/persoonsgegevens-20261104-164147`). |

#### B. E-mail: Mobiele Responsiviteit, Lege Staat en OAuth (`MAILFIX-001` / `MAILFIT-001` / `MAILFIT-002`)
| Tak | Commit | T.o.v. `voornaamst` | PR / Release | Wat zit erin en waar te vinden |
|---|---|---|---|---|
| **[`fix/mailfit-002-20261104-170000`](https://github.com/Tarasevych/hub/tree/fix/mailfit-002-20261104-170000)** | `98beb2a` | **+47 commits** (1 achter) | Kandidaat `MAILFIT-002` | **Nieuwste tak van de e-mailreeks `MAILFIT`.** Bevat alle fixes van `MAILFIX-001` en `MAILFIT-001`, plus compatibiliteit met het servercontract `TRACE-001` zonder bestanden van `integratie` te overschrijven, bijgewerkte regressietest-fixtures van `ORCH` en dossier `orchestratie/ontwikkelarchieven/MAILFIT-002.json`. |
| **[`fix/mailfit-001-20261104-110700`](https://github.com/Tarasevych/hub/tree/fix/mailfit-001-20261104-110700)** | `c3eb3f8` | **+21 commits** (1 achter) | [PR #27](https://github.com/Tarasevych/hub/pull/27) · Release `20261104-160049` | **`MAILFIT-001`:** gecentreerde adaptieve lege staat voor e-mail (empty-inbox onboarding), duidelijke actie om Gmail te koppelen, bescherming van bedieningselementen voor al gekoppelde mailboxen. |
| **[`fix/mailfix-001-20261104-095000`](https://github.com/Tarasevych/hub/tree/fix/mailfix-001-20261104-095000)** | `1d1d28b` | **+18 commits** (1 achter) | [PR #26](https://github.com/Tarasevych/hub/pull/26) | **`MAILFIX-001`:** herstel van mobiele breedte in e-mail, verwijdering van dubbele dienstenbalk, diagnose van Gmail OAuth-fouten, live browser-DOM-controles (`tests/visueel/mailfix-screen.mjs`). |

#### C. Account en Identiteit: 12 Profielsecties (`IDENTITY-ACCOUNT` / `IDENTITY-001` / `IDENTITY-002`)
| Tak | Commit | T.o.v. `voornaamst` | Release | Wat zit erin en waar te vinden |
|---|---|---|---|---|
| **[`feature/identity-account-ui-20261104-180000`](https://github.com/Tarasevych/hub/tree/feature/identity-account-ui-20261104-180000)** | `6e815a0` | **+7 eigen commits** *(basis vóór 2e rewrite)* | Release `20261104-204906` | **`IDENTITY-002` (volledige UI-implementatie):** één uniform accountscherm met **12 secties** en dialoogvenster voor profielfotobeheer (`796223b`), plus release vanuit de eigen tak (`6e815a0`). |
| **[`fix/identity-release-guard-20261104-171500`](https://github.com/Tarasevych/hub/tree/fix/identity-release-guard-20261104-171500)** | `fb56cae` | **+8 commits** (0 achter) | — | **`IDENTITY-ACCOUNT` (CI-beveiliging en integratieplan):** stapsgewijze pakketbuild in CI, oplossing voor `SIGPIPE` (`tar \| grep -q` onder `pipefail`), `privacy`-blok in het ontwikkelarchief en integratieplan voor `IDENTITY-002` (direct gebouwd bovenop `voornaamst` `3095e5f`). |
| **[`feature/identity-account-20261104-120000`](https://github.com/Tarasevych/hub/tree/feature/identity-account-20261104-120000)** | `50e6373` | **+5 commits** (0 achter) | Release `20261104-191935` | **`IDENTITY-001`:** ontwerp, prototype en specificatie van 12 accountschermen, registratie van taak `IDENTITY-001` en ontwikkelarchief volgens `TRACE-001` bovenop `voornaamst` `3095e5f`. |
| **[`feature/identity-account-ui-20261104-1200`](https://github.com/Tarasevych/hub/tree/feature/identity-account-ui-20261104-1200)** | `db4ba84` | **+2 commits** (1 achter) | — | Initiële tak voor documentatie en ontwerp van de 12 schermen van `IDENTITY-ACCOUNT` (vervangen door `feature/identity-account-20261104-120000`). |

---

### 1.3. In `voornaamst` Samengevoegde Functionele en Releasetakken — Oktober–November 2026 (30 takken)

#### 1. Release-traceerbaarheid en Mobiele E-mailbaan (03–04-11-2026 — 4 takken)
| Tak | Commit | Status in `voornaamst` | PR / Tag | Inhoud van de tak |
|---|---|---|---|---|
| **[`feature/mailpolish-001-20261104-084133`](https://github.com/Tarasevych/hub/tree/feature/mailpolish-001-20261104-084133)** | `7ba7a0d` | ✅ **Samengevoegd** | [PR #25](https://github.com/Tarasevych/hub/pull/25) · `20261104-075953` | **`MAILPOLISH-001`:** design-verfijning van `MailKoppelVenster.tsx`, `MailOrbitIntro.tsx`, mobiele sheets `mail-koppel-mobile-sheet.css`, visuele previews en Chromium-screenshots. |
| **[`feature/mailmob-001-20261104-073200`](https://github.com/Tarasevych/hub/tree/feature/mailmob-001-20261104-073200)** | `2b418cf` | ✅ **Samengevoegd** | [PR #24](https://github.com/Tarasevych/hub/pull/24) · `20261104-063430` | **`MAILMOB-001`:** geanimeerde 320px mobiele e-mailbaan, toegankelijke koppelvensters en synchronisatie van 12-uurs Step-Up toestemming ("Niet opnieuw vragen" voor Passkey/TOTP/Google). |
| **[`feature/trace-001-20261103-214810`](https://github.com/Tarasevych/hub/tree/feature/trace-001-20261103-214810)** | `017b8e1` | ✅ **Samengevoegd** | [PR #23](https://github.com/Tarasevych/hub/pull/23) | **`TRACE-001` (`B-007` / `B-008`, regels `1.4.1`):** verplicht `ONTWIKKELARCHIEF.json` in elk releasepakket en SHA-256-verificatie van het archief in GitHub Release op de website en in de root-installer. |
| **[`feature/mailorbit-001-20261103-205354`](https://github.com/Tarasevych/hub/tree/feature/mailorbit-001-20261103-205354)** | `14698ac` | ✅ **Samengevoegd** | [PR #22](https://github.com/Tarasevych/hub/pull/22) · `20261103-211554` | **`MAILORBIT-001`:** live interactieve baan van e-maildiensten en echte interne koppelvensters bij een lege accountlijst of lege inbox. |

#### 2. Grote Integratie `INTEG-001` (03-11-2026 — 11 takken)
| Tak | Commit | Status in `voornaamst` | Inhoud van de tak |
|---|---|---|---|
| **[`feature/integ-001-zvedennia-20261103-102243`](https://github.com/Tarasevych/hub/tree/feature/integ-001-zvedennia-20261103-102243)** | `78fbcf5` | ✅ **Samengevoegd** | **Samengevoegde tak `INTEG-001`:** bundelt alle 9 thematische `integ-001-*`-takken, volledige AVG/GDPR-accountexport zonder afkapping (`4ddf24d`), registratie van nieuwe modules (`cloud-vnext`, `foto-dienst`) in het poortregister en `NoNewPrivileges=yes` voor de `besluit`-service. |
| **[`feature/integ-001-meld-20261103-083755`](https://github.com/Tarasevych/hub/tree/feature/integ-001-meld-20261103-083755)** | `ff46129` | ✅ **Samengevoegd** | Stille meldingen met uitleg in het tabblad "Gelezen", update van E2E en UI-catalogus. |
| **[`feature/integ-001-agpag1-20261103-083758`](https://github.com/Tarasevych/hub/tree/feature/integ-001-agpag1-20261103-083758)** | `e25b5a7` | ✅ **Samengevoegd** | AI-bord: tweetalige namen van tabbladen en blokken in het Oekraïens en Nederlands. |
| **[`feature/integ-001-band-20261103-083753`](https://github.com/Tarasevych/hub/tree/feature/integ-001-band-20261103-083753)** | `b98bb2b` | ✅ **Samengevoegd** | Afstemming van `ui-audit-g` (8a) tests en vast kader (`vast-kader`) volgens het besluit over de bovenbalk. |
| **[`feature/integ-001-agpag2-20261103-083749`](https://github.com/Tarasevych/hub/tree/feature/integ-001-agpag2-20261103-083749)** | `d4df21b` | ✅ **Samengevoegd** | Unificatie van blokheaders op de agentenpagina volgens `agenten-pagina.css`. |
| **[`feature/integ-001-login-20261103-083803`](https://github.com/Tarasevych/hub/tree/feature/integ-001-login-20261103-083803)** | `6bbb685` | ✅ **Samengevoegd** | Regeneratie van de canonieke UI-catalogus na integratie van het nieuwe aanmeldscherm. |
| **[`feature/integ-001-menu-20261103-083746`](https://github.com/Tarasevych/hub/tree/feature/integ-001-menu-20261103-083746)** | `ed46b36` | ✅ **Samengevoegd** | Fix voor de weergave van het taalvlaggetje in het menu (`object-fit: fill`, zonder bijsnijden). |
| **[`feature/integ-001-print-20261103-083745`](https://github.com/Tarasevych/hub/tree/feature/integ-001-print-20261103-083745)** | `4de3780` | ✅ **Samengevoegd** | Statische afdruktests (76 controles) en afdrukverificatie in echte Chrome (`scripts/afdruk-proef.mjs`). |
| **[`feature/integ-001-zoek-20261103-083752`](https://github.com/Tarasevych/hub/tree/feature/integ-001-zoek-20261103-083752)** | `c15e6ae` | ✅ **Samengevoegd** | Dropdown-zoekmenu in de bovenbalk (recente zoekopdrachten, directe resultaten, toetsenbordnavigatie `Esc`/`Enter`/pijltjes). |
| **[`feature/integ-001-test-20261103-083753`](https://github.com/Tarasevych/hub/tree/feature/integ-001-test-20261103-083753)** | `feb9f1b` | ✅ **Samengevoegd** | Stabilisatie van unittests (`afstemming-kern`, `agent-apps`, `apparaat-inrichten`). |
| **[`wip/hub-voor-integratie-20261103`](https://github.com/Tarasevych/hub/tree/wip/hub-voor-integratie-20261103)** | `0ca4cad` | 📌 *Reserve-opname* | Veiligheidscommit van lokaal werk (meldingen, MCP) vóór de start van integratie `INTEG-001`. |

#### 3. Aanmeldscherm `LOGIN-001` (01–03-11-2026 — 3 takken)
| Tak | Commit | Status in `voornaamst` | PR | Inhoud van de tak |
|---|---|---|---|---|
| **[`feature/login-001-plus-hub`](https://github.com/Tarasevych/hub/tree/feature/login-001-plus-hub)** | `3be89e0` | ✅ **Samengevoegd** | — | Integratie van `LOGIN-001` met de belangrijkste hub-wijzigingen en testfixes. |
| **[`feature/login-001-20261101-184800-chatgpt`](https://github.com/Tarasevych/hub/tree/feature/login-001-20261101-184800-chatgpt)** | `6952f8e` | ✅ **Samengevoegd** | [PR #20](https://github.com/Tarasevych/hub/pull/20) (Samengevoegd) | Minimalistisch meertalig aanmeldscherm zonder overbodige logo's en veilige GitHub CI voor ongetekende releasekandidaten. |
| **[`feature/login-001-20261101-195230`](https://github.com/Tarasevych/hub/tree/feature/login-001-20261101-195230)** | `8209000` | 📦 *Gesloten kandidaat* | [PR #21](https://github.com/Tarasevych/hub/pull/21) (Gesloten) | Alternatieve draft-tak voor kandidaat `LOGIN-001` (verbeteringen aan accountmenu en kleuren van de technische balk zijn overgezet naar `feature/login-001-plus-hub`). |

#### 4. Beveiliging `SEC-001`, Orchestratie `ORCH-001`, `MCP-ACCESS-001` en `UX-AI-VAULT-001` (30-10–01-11-2026 — 12 takken)
| Tak | Commit | Status in `voornaamst` | PR | Inhoud van de tak |
|---|---|---|---|---|
| **[`release/ux-ai-vault-001-20261101-160600`](https://github.com/Tarasevych/hub/tree/release/ux-ai-vault-001-20261101-160600)** | `80716ac` | ✅ **Samengevoegd** | [PR #19](https://github.com/Tarasevych/hub/pull/19) (Samengevoegd) | **`UX-AI-VAULT-001`:** beheer van AI-agenten op één plek met directe Passkey-bevestiging en één adaptieve Sleutelkluis. |
| **[`release/sec-001-20261031-084138`](https://github.com/Tarasevych/hub/tree/release/sec-001-20261031-084138)** | `80716ac` | ✅ **Samengevoegd** | [PR #12](https://github.com/Tarasevych/hub/pull/12) (Samengevoegd) | Basis-releasetak na samenvoeging van `SEC-001`, `ORCH-001`, `MCP-ACCESS-001` en `UX-AI-VAULT-001`. |
| **[`claude/project-thread-99x4j9`](https://github.com/Tarasevych/hub/tree/claude/project-thread-99x4j9)** | `3dea7c1` | ✅ **Samengevoegd** | [PR #17](https://github.com/Tarasevych/hub/pull/17) (Samengevoegd) | Verfijning van `ORCH-001` na PR #16: verbod op inleveren van andermans taak, isolatie van technische MCP-koppelingen van privé "AI-toegang". |
| **[`fix/mcp-access-001-20261101-125530`](https://github.com/Tarasevych/hub/tree/fix/mcp-access-001-20261101-125530)** | `b864308` | ✅ **Samengevoegd** | [PR #18](https://github.com/Tarasevych/hub/pull/18) (Samengevoegd) | **`MCP-ACCESS-001`:** nauwkeurige serverdiagnose van AI-toegang, isolatie per koppeling, directe 1-klik-acties en live bijwerken van rechten. |
| **[`release/orch-001-mcp-20261031`](https://github.com/Tarasevych/hub/tree/release/orch-001-mcp-20261031)** | `d33d068` | ✅ **Samengevoegd** | [PR #16](https://github.com/Tarasevych/hub/pull/16) (Samengevoegd) | Gezamenlijke integratiekandidaat `ORCH-001` (PR #11 + PR #13) + `MCP-001` (PR #14) + `MCP-DEUR 8091` (PR #15). |
| **[`fix/mcp-deur-uitrol-20261031-204604`](https://github.com/Tarasevych/hub/tree/fix/mcp-deur-uitrol-20261031-204604)** | `ebc3736` | ✅ **Samengevoegd** | [PR #15](https://github.com/Tarasevych/hub/pull/15) | Synchronisatie van `deploy/mcp/server.mjs` en automatische herstart van de service op poort `8091` tijdens installatie en rollback. |
| **[`fix/mcp-tools-catalog-20261031-192004`](https://github.com/Tarasevych/hub/tree/fix/mcp-tools-catalog-20261031-192004)** | `0b0b67c` | ✅ **Samengevoegd** | [PR #14](https://github.com/Tarasevych/hub/pull/14) | **`MCP-001`:** herstel van de MCP-toolcatalogus voor Cursor Cloud / GitHub OAuth / Streamable HTTP. |
| **[`feature/orch-001-20261031-112355`](https://github.com/Tarasevych/hub/tree/feature/orch-001-20261031-112355)** | `7176e95` | ✅ **Samengevoegd** | [PR #11](https://github.com/Tarasevych/hub/pull/11) | **`ORCH-001` (fasen 0–4):** opzet van `AGENTS.md`, `orchestratie/*`, `scripts/orch.mjs`, beheer via website/MCP en goedkeuring van regels met Passkey. |
| **[`fix/orch-001-review-20261031-165744`](https://github.com/Tarasevych/hub/tree/fix/orch-001-review-20261031-165744)** | `1203048` | ✅ **Samengevoegd** | — | Beveiligingsfix `ORCH-001`: blokkering van willekeurige testcommando's uit pakketten (RCE), SSHSIG-verificatie in GitOps. |
| **[`fix/orch-001-audit-20261031-170250`](https://github.com/Tarasevych/hub/tree/fix/orch-001-audit-20261031-170250)** | `315cebf` | 📦 *Opgenomen in PR #16* | [PR #13](https://github.com/Tarasevych/hub/pull/13) (Gesloten) | Beveiligingstests voor `ORCH-001` (overgezet naar `fix/orch-001-review-20261031-165744` en `release/orch-001-mcp-20261031`). |
| **[`fix/sec-001-20261031-000224`](https://github.com/Tarasevych/hub/tree/fix/sec-001-20261031-000224)** | `fd52dca` | ✅ **Samengevoegd** | — | Oplossing van kwetsbaarheden uit de `SEC-001`-audit en bijbehorende verificatietests. |
| **[`audit/sec-001-20261030`](https://github.com/Tarasevych/hub/tree/audit/sec-001-20261030)** | `016093f` | ✅ **Samengevoegd** | — | Import van de volledige productie-snapshot van 30-10-2026 voor de `SEC-001`-audit. |

---

### 1.4. Historische en Archieftakken van Vroege Ontwikkeling — September — 16 Oktober 2026 (30 takken)

#### 1. Fundament Self-Hosting, Authenticatie en Beveiligingsfasen (September — 6 Oktober 2026 — 7 takken)
| Tak | Commit | Datum | Beschrijving van de fase |
|---|---|---|---|
| **[`Mijn-ruimte-reservekopieën`](https://github.com/Tarasevych/hub/tree/Mijn-ruimte-reservekopie%C3%ABn)** | `1f377ca` | 2026-09-24 | ✅ Initiële tak van de repository (voorouder van `voornaamst`). |
| **[`basis-voor-zelf-hosten`](https://github.com/Tarasevych/hub/tree/basis-voor-zelf-hosten)** | `722542c` | 2026-10-02 | Uitgangssnapshot met de eerste beveiligingsfixes vóór het verlaten van AppDeploy. |
| **[`auth-fase-1`](https://github.com/Tarasevych/hub/tree/auth-fase-1)** | `a60525a` | 2026-10-03 | **Auth Fase 1:** accountkoppeling op `(provider, subject)`, bescherming van Google OAuth redirect-flow tegen Login-CSRF, verwijdering van verouderde sessieroutes (migratie `0002`). |
| **[`beveiliging-fase-2-3`](https://github.com/Tarasevych/hub/tree/beveiliging-fase-2-3)** | `77cddc6` | 2026-10-03 | **Beveiliging Fase 2 & 3:** PostgreSQL RLS (`0003`–`0005`), drie DB-rollen (`db-rollen.sql`), `auth-poort.ts`, append-only audit (`0006`), Step-Up (`stap-op.ts`), AVG-export. |
| **[`beveiliging-fixes-audit`](https://github.com/Tarasevych/hub/tree/beveiliging-fixes-audit)** | `0f0cab4` | 2026-10-04 | **Audit Fixes (A1–A11):** versterking van de hash-keten `app.audit` (`0008`), RLS per tabel (`0007`), publieke pagina's `/privacy` en `/terms`. |
| **[`sync-actief`](https://github.com/Tarasevych/hub/tree/sync-actief)** | `cb130fd` | 2026-10-06 | Synchronisatie van de actieve release `20261006-124427` vanaf de productie-VM. |
| **[`zelf-hosten`](https://github.com/Tarasevych/hub/tree/zelf-hosten)** | `f30ea67` | 2026-10-06 | Hoofdtak van de migratie naar self-hosting (`PORTEERPLAN.nl.md`, `server/platform/*`, `deploy/installeer-app.sh`). |

#### 2. Passkeys, Gasttoegang en Menu v2 (6–9 Oktober 2026 — 7 takken)
| Tak | Commit | Datum | Beschrijving van de fase |
|---|---|---|---|
| **[`feature/connectors-agent`](https://github.com/Tarasevych/hub/tree/feature/connectors-agent)** | `c318679` | 2026-10-06 | Initiële architectuur voor het koppelen van AI-agenten en packaging-runbook. |
| **[`feature/connectors-agent-v2`](https://github.com/Tarasevych/hub/tree/feature/connectors-agent-v2)** | `053a29f` | 2026-10-08 | Doorontwikkeling van agentconnectoren v2 en adaptieve antwoordeditor in mobiele e-mail. |
| **[`veilig-agenten-0.4`](https://github.com/Tarasevych/hub/tree/veilig-agenten-0.4)** | `f89d34f` | 2026-10-08 | Beveiligingscontour voor AI-agenten versie 0.4 (`deploy/DRAAIBOEK-AGENTEN-0.4.nl.md`). |
| **[`passkey-schvalennya`](https://github.com/Tarasevych/hub/tree/passkey-schvalennya)** | `3cd66f4` | 2026-10-08 | Eigen WebAuthn-kern (`deploy/goedkeuring/webauthn-kern.mjs`) en goedkeuring van serverupdates door de eigenaar via Passkey (`Admin → Updates`). |
| **[`aanmeldmethoden`](https://github.com/Tarasevych/hub/tree/aanmeldmethoden)** | `a22ed85` | 2026-10-09 | Gebruikers-Passkeys in de sectie "Aanmeldmethoden" (migratie `0023`, `rpId: tarasevych.com`). |
| **[`bevestig-toegang`](https://github.com/Tarasevych/hub/tree/bevestig-toegang)** | `3d449e7` | 2026-10-09 | Tijdelijke toegangscodes voor gasten, gastsessies (`/toegang`) en sessiebeheer (migratie `0025`). |
| **[`menu-v2`](https://github.com/Tarasevych/hub/tree/menu-v2)** | `b77f8d5` | 2026-10-09 | **Menu v2 (Stage 2):** snelbalk, secties, dock rechts/boven/onder met transparantie en schaling, drag-and-drop bewerkingsmodus. |

#### 3. Claude- en Cursor Agent-takken: MCP, Techprofiel en Connectoren (9–16 Oktober 2026 — 16 takken)
| Tak | Commit | Datum | PR | Beschrijving van de fase |
|---|---|---|---|---|
| **[`claude/plan-2026-10-09`](https://github.com/Tarasevych/hub/tree/claude/plan-2026-10-09)** | `0c18e79` | 2026-10-12 | — | E-mailfixes op basis van QA-rapporten van 12-10 (desktop en mobiel). |
| **[`claude/mcp-een-klik-2026-10-13`](https://github.com/Tarasevych/hub/tree/claude/mcp-een-klik-2026-10-13)** | `c503db1` | 2026-10-13 | — | AI-koppeling via MCP met "één klik" of handmatig, deurbevestiging op de website met keuze van geldigheidsduur. |
| **[`cursor/terminal-etap-c-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/terminal-etap-c-8d4d)** | `e9128e4` | 2026-10-13 | [PR #1](https://github.com/Tarasevych/hub/pull/1) | **Etappe C:** ingebouwde browserterminal op basis van `@xterm/xterm` (standaard uitgeschakeld). |
| **[`cursor/ssh-uitrol-audit-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/ssh-uitrol-audit-8d4d)** | `596cd4a` | 2026-10-13 | [PR #2](https://github.com/Tarasevych/hub/pull/2) | Registratie van SSH-installaties in de updategeschiedenis en het auditlogboek. |
| **[`cursor/mcp-spiegel-tools-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/mcp-spiegel-tools-8d4d)** | `30b45a4` | 2026-10-14 | [PR #3](https://github.com/Tarasevych/hub/pull/3) | Weergave van deur-tools in de MCP-connector (release, bord, dienstenkaart). |
| **[`claude/tech-profiel-2026-10-13`](https://github.com/Tarasevych/hub/tree/claude/tech-profiel-2026-10-13)** | `363fa72` | 2026-10-14 | — | **Etappe B:** isolatie van beheerdersrechten uitsluitend binnen het actieve Technische profiel (`deploy/BEHEER-ALLEEN-TECH.nl.md`). |
| **[`cursor/mcp-spiegel-na-b-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/mcp-spiegel-na-b-8d4d)** | `2c947c6` | 2026-10-14 | [PR #4](https://github.com/Tarasevych/hub/pull/4) | Scheiding van twee webruimtes: gebruikersaccount zonder beheerrechten, technisch profiel zonder privégegevens. |
| **[`cursor/ai-vertaling-context-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/ai-vertaling-context-8d4d)** | `dda7668` | 2026-10-14 | [PR #5](https://github.com/Tarasevych/hub/pull/5) | In-place AI-vertaling van e-mails, samenvatting en cross-mailbox context van berichten en documenten. |
| **[`cursor/ai-agent-scopes-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/ai-agent-scopes-8d4d)** | `013eaa5` | 2026-10-14 | [PR #7](https://github.com/Tarasevych/hub/pull/7) | Granulaire rechten "AI-toegang" (scopes voor catalogustools en gevoelige gegevens, migratie `0044`). |
| **[`cursor/ai-agent-board-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/ai-agent-board-8d4d)** | `11f5232` | 2026-10-15 | [PR #6](https://github.com/Tarasevych/hub/pull/6) | Bundeling van AI-agentenbord (`0043`), granulaire rechten (`0044`) en AI-vertaling/context. |
| **[`cursor/connector-integraties-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/connector-integraties-8d4d)** | `796b78f` | 2026-10-15 | [PR #8](https://github.com/Tarasevych/hub/pull/8) | Aparte AI-connectoradressen, Nederlandse routenamen en stapsgewijze koppeling met grants. |
| **[`cursor/connector-uitvoeren-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/connector-uitvoeren-8d4d)** | `65cfeb9` | 2026-10-15 | [PR #9](https://github.com/Tarasevych/hub/pull/9) | Echte connectoracties: e-mail verzenden, Drive en agenda schrijven, bord, zoeken, GitHub. |
| **[`cursor/connector-functies-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/connector-functies-8d4d)** | `9d5a4be` | 2026-10-15 | [PR #10](https://github.com/Tarasevych/hub/pull/10) | Volledige connectorcatalogus als echte acties (Figma, Notion, GitHub, Wix, Stripe, releases). |
| **[`cursor/release-tar-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/release-tar-8d4d)** | `63a7d48` | 2026-10-15 | — | Tak van het releasepakket `mijn-ruimte-20261015-123546` (echte connectoracties). |
| **[`claude/connector-v2-2026-10-15`](https://github.com/Tarasevych/hub/tree/claude/connector-v2-2026-10-15)** | `4135dfd` | 2026-10-15 | — | Consolidatie A2/A3: `ai/verbindingen` als uniforme hub voor AI-koppelingen met subtabbladen (`deploy/VERBINDER-V2.nl.md`). |
| **[`fix/mail-compose-float-independent`](https://github.com/Tarasevych/hub/tree/fix/mail-compose-float-independent)** | `f7de4d8` | 2026-10-16 | — | Onafhankelijk zwevend opstelvenster voor e-mail en automatische statusverversing in het admin-paneel elke 10 s. |

---

## 2. Volledig Register van alle 27 Pull Requests (`#1`–`#27`)

| PR | Status | Titel | Brontak → Basis | Toelichting op de feitelijke status |
|---|---|---|---|---|
| **[#27](https://github.com/Tarasevych/hub/pull/27)** | 🟢 OPEN | `MAILFIT-001 — centered responsive empty Mail onboarding` | `fix/mailfit-001-20261104-110700` → `fix/mailfix-001-20261104-095000` | 🔄 Actieve kandidaat (uitgebreid in `fix/mailfit-002-20261104-170000`). |
| **[#26](https://github.com/Tarasevych/hub/pull/26)** | 🟢 OPEN | `MAILFIX-001 — mobile width, remove duplicate service strip, diagnose broken Gmail OAuth` | `fix/mailfix-001-20261104-095000` → `feature/mailpolish-001-20261104-084133` | 🔄 Actieve kandidaat (basis voor PR #27 en `MAILFIT-002`). |
| **[#25](https://github.com/Tarasevych/hub/pull/25)** | 🟢 OPEN* | `MAILPOLISH-001: відтворити дизайнерську концепцію в реальній мобільній пошті` | `feature/mailpolish-001-20261104-084133` → `feature/mailmob-001-20261104-073200` | ✅ **Al samengevoegd in `voornaamst` (`7ba7a0d`)**; PR bleef open door gestapelde basis. |
| **[#24](https://github.com/Tarasevych/hub/pull/24)** | 🟢 OPEN* | `MAILMOB-001: жива мобільна пошта й виправлення «Не питати знову»` | `feature/mailmob-001-20261104-073200` → `feature/trace-001-20261103-214810` | ✅ **Al samengevoegd in `voornaamst` (`2b418cf`)**. |
| **[#23](https://github.com/Tarasevych/hub/pull/23)** | 🟢 OPEN* | `TRACE-001: обов'язковий GitHub-журнал і SHA-256 кожного пакета` | `feature/trace-001-20261103-214810` → `feature/mailorbit-001-20261103-205354` | ✅ **Al samengevoegd in `voornaamst` (`017b8e1`)**. |
| **[#22](https://github.com/Tarasevych/hub/pull/22)** | 🟢 OPEN* | `MAILORBIT-001: інтерактивні поштові сервіси на порожній сторінці` | `feature/mailorbit-001-20261103-205354` → `feature/integ-001-zvedennia-20261103-102243` | ✅ **Al samengevoegd in `voornaamst` (`14698ac`)**. |
| **[#21](https://github.com/Tarasevych/hub/pull/21)** | 🔴 CLOSED | `[DRAFT] LOGIN-001: minimalistische aanmeldweergave (ORCH-conforme release-kandidaat)` | `feature/login-001-20261101-195230` → `integratie` | 📦 Gesloten alternatieve kandidaat (werk overgezet naar `feature/login-001-plus-hub`). |
| **[#20](https://github.com/Tarasevych/hub/pull/20)** | 🟣 MERGED | `[DRAFT] LOGIN-001: minimalistische meertalige aanmeldweergave zonder logo` | `feature/login-001-20261101-184800-chatgpt` → `integratie` | ✅ Samengevoegd op 04-11-2026. |
| **[#19](https://github.com/Tarasevych/hub/pull/19)** | 🟣 MERGED | `UX-AI-VAULT-001 + PR #17: керування ШІ-агентом в 1 місці з Passkey на місці та єдине адаптивне Сховище секретів` | `release/ux-ai-vault-001-20261101-160600` → `release/sec-001-20261031-084138` | ✅ Samengevoegd op 01-11-2026. |
| **[#18](https://github.com/Tarasevych/hub/pull/18)** | 🟣 MERGED | `MCP-ACCESS-001: точна серверна діагностика доступу ШІ, ізоляція за під'єднанням, прямі дії в 1 натискання та живе оновлення дозволів` | `fix/mcp-access-001-20261101-125530` → `release/sec-001-20261031-084138` | ✅ Samengevoegd op 01-11-2026. |
| **[#17](https://github.com/Tarasevych/hub/pull/17)** | 🟣 MERGED | `ORCH-001 після злиття PR #16: чужу задачу не здати, агенту без passkey/besluit, подія при збої дверей 8091; розділені простори «Доступу ШІ»` | `claude/project-thread-99x4j9` → `release/sec-001-20261031-084138` | ✅ Samengevoegd op 01-11-2026. |
| **[#16](https://github.com/Tarasevych/hub/pull/16)** | 🟣 MERGED | `INTEGRATIE: спільний кандидат ORCH-001 (PR #11 + PR #13) + MCP-001 (PR #14) + MCP-DEUR 8091 (PR #15)` | `release/orch-001-mcp-20261031` → `release/sec-001-20261031-084138` | ✅ Samengevoegd op 01-11-2026 (bundelt en sluit PR #11, #13, #14, #15). |
| **[#15](https://github.com/Tarasevych/hub/pull/15)** | 🔴 CLOSED | `MCP-DEUR: синхронізація deploy/mcp/server.mjs та перезапуск служби порту 8091 під час встановлення і повернення стану` | `fix/mcp-deur-uitrol-20261031-204604` → `release/sec-001-20261031-084138` | ✅ Samengevoegd via gezamenlijke PR #16 (`ebc3736`). |
| **[#14](https://github.com/Tarasevych/hub/pull/14)** | 🔴 CLOSED | `MCP-001: відновлення каталогу MCP-інструментів для Cursor Cloud / GitHub OAuth / Streamable HTTP` | `fix/mcp-tools-catalog-20261031-192004` → `release/sec-001-20261031-084138` | ✅ Samengevoegd via gezamenlijke PR #16 (`0b0b67c`). |
| **[#13](https://github.com/Tarasevych/hub/pull/13)** | 🔴 CLOSED | `[DRAFT] Security review ORCH-001: untrusted test execution + upload ownership` | `fix/orch-001-audit-20261031-170250` → `feature/orch-001-20261031-112355` | ✅ Opgenomen in PR #16 (`1203048`). |
| **[#12](https://github.com/Tarasevych/hub/pull/12)** | 🟣 MERGED | `Add comprehensive backend modules and deployment documentation` | `release/sec-001-20261031-084138` → `voornaamst` | ✅ Samengevoegd op 04-11-2026. |
| **[#11](https://github.com/Tarasevych/hub/pull/11)** | 🔴 CLOSED | `ORCH-001 етапи 0–4 + незалежна й адверсарна перевірка: єдині правила, один конвеєр приймання...` | `feature/orch-001-20261031-112355` → `release/sec-001-20261031-084138` | ✅ Samengevoegd via gezamenlijke PR #16 (`7176e95`). |
| **[#10](https://github.com/Tarasevych/hub/pull/10)** | 📦 OPEN (Archief) | `Повний каталог з'єднувача як справжні дії без позначки у розробці` | `cursor/connector-functies-8d4d` → `claude/connector-v2-2026-10-15` | 📦 Historische PR van 15-10-2026 (code in snapshot `016093f`). |
| **[#9](https://github.com/Tarasevych/hub/pull/9)** | 📦 OPEN (Archief) | `Реальні дії з'єднувача: лист, Диск, календар, дошка, пошук, GitHub` | `cursor/connector-uitvoeren-8d4d` → `claude/connector-v2-2026-10-15` | 📦 Historische PR van 15-10-2026 (code in snapshot `016093f`). |
| **[#8](https://github.com/Tarasevych/hub/pull/8)** | 📦 OPEN (Archief) | `Окремі адреси з'єднувачів ШІ, нідерландські назви та крокове під'єднання з грантами` | `cursor/connector-integraties-8d4d` → `claude/connector-v2-2026-10-15` | 📦 Historische PR van 15-10-2026 (code in snapshot `016093f`). |
| **[#7](https://github.com/Tarasevych/hub/pull/7)** | 📦 OPEN (Archief) | `Гранулярні дозволи Доступ ШІ для під'єднаних агентів та чутливих даних` | `cursor/ai-agent-scopes-8d4d` → `cursor/mcp-spiegel-na-b-8d4d` | 📦 Historische PR van 14-10-2026 (code in snapshot `016093f`). |
| **[#6](https://github.com/Tarasevych/hub/pull/6)** | 📦 OPEN (Archief) | `Дошка ШІ-агентів, гранулярні дозволи Доступ ШІ та розумний переклад і контекст листів` | `cursor/ai-agent-board-8d4d` → `cursor/mcp-spiegel-na-b-8d4d` | 📦 Historische PR van 14-10-2026 (code in snapshot `016093f`). |
| **[#5](https://github.com/Tarasevych/hub/pull/5)** | 📦 OPEN (Archief) | `ШІ-переклад на місці, вижимка та міжскриньковий контекст листів і документів` | `cursor/ai-vertaling-context-8d4d` → `cursor/mcp-spiegel-na-b-8d4d` | 📦 Historische PR van 14-10-2026 (code in snapshot `016093f`). |
| **[#4](https://github.com/Tarasevych/hub/pull/4)** | 📦 OPEN (Archief) | `Дві веб-простори: обліковий запис без управління, технічний профіль без користувацького` | `cursor/mcp-spiegel-na-b-8d4d` → `claude/tech-profiel-2026-10-13` | 📦 Historische PR van 14-10-2026 (code in snapshot `016093f`). |
| **[#3](https://github.com/Tarasevych/hub/pull/3)** | 📦 OPEN (Archief) | `MCP-з'єднувач: відображення дверей (випуск, дошка, карта сервісів)` | `cursor/mcp-spiegel-tools-8d4d` → `claude/tech-profiel-2026-10-13` | 📦 Historische PR van 14-10-2026 (code in snapshot `016093f`). |
| **[#2](https://github.com/Tarasevych/hub/pull/2)** | 📦 OPEN (Archief) | `SSH-встановлення з’є в історії й аудиті` | `cursor/ssh-uitrol-audit-8d4d` → `cursor/terminal-etap-c-8d4d` | 📦 Historische PR van 13-10-2026 (code in snapshot `016093f`). |
| **[#1](https://github.com/Tarasevych/hub/pull/1)** | 📦 OPEN (Archief) | `Etap C: термінал у оглядачі (xterm), вимкнений standaard` | `cursor/terminal-etap-c-8d4d` → `claude/tech-profiel-2026-10-13` | 📦 Historische PR van 13-10-2026 (code in snapshot `016093f`). |

---

## 3. Volledig Register van GitHub Releases (18+ Releases)

Volgens de standaard **TRACE-001** (`B-007` / `B-008`) wordt elke release gepubliceerd in [GitHub Releases](https://github.com/Tarasevych/hub/releases) en bevat deze het installatie-archief `mijn-ruimte-<versie>.tar.gz`, de controlehash `.tar.gz.sha256` en (voor agentoverdrachten) het pakket `-overdracht.zip`:

| Nr. | Releasetag | Releasenaam | Datum (UTC) | Taak / Context |
|---|---|---|---|---|
| 1 | [`20261105-003823`](https://github.com/Tarasevych/hub/releases/tag/20261105-003823) | `IDENTITY-ACCOUNT · 20261105-003823` | 2026-11-05 00:38 | `IDENTITY-ACCOUNT` (Vooruitgave) |
| 2 | [`20261104-204906`](https://github.com/Tarasevych/hub/releases/tag/20261104-204906) | `IDENTITY-ACCOUNT · 20261104-204906` | 2026-11-04 20:49 | `IDENTITY-002` (`feature/identity-account-ui-20261104-180000`) |
| 3 | [`20261104-191935`](https://github.com/Tarasevych/hub/releases/tag/20261104-191935) | `IDENTITY-ACCOUNT · 20261104-191935` | 2026-11-04 19:19 | `IDENTITY-001` (`feature/identity-account-20261104-120000`) |
| 4 | [`20261104-164906`](https://github.com/Tarasevych/hub/releases/tag/20261104-164906) | `IDENTITY-ACCOUNT · 20261104-164906` | 2026-11-04 16:49 | `IDENTITY-ACCOUNT` (Vooruitgave) |
| 5 | [`20261104-160343`](https://github.com/Tarasevych/hub/releases/tag/20261104-160343) | `IDENTITY-ACCOUNT · 20261104-160343` | 2026-11-04 16:03 | `IDENTITY-ACCOUNT` (Vooruitgave) |
| 6 | [`20261104-160049`](https://github.com/Tarasevych/hub/releases/tag/20261104-160049) | `MAILFIT-001 · 20261104-160049 (unsigned)` | 2026-11-04 16:00 | `MAILFIT-001` (`fix/mailfit-001-20261104-110700`) |
| 7 | [`20261104-155548`](https://github.com/Tarasevych/hub/releases/tag/20261104-155548) | `MAILFIT-001 · 20261104-155548 (unsigned)` | 2026-11-04 15:55 | `MAILFIT-001` (CI-vooruitgave) |
| 8 | [`20261104-154942`](https://github.com/Tarasevych/hub/releases/tag/20261104-154942) | `MAILFIT-001 · 20261104-154942 (unsigned)` | 2026-11-04 15:49 | `MAILFIT-001` (CI-vooruitgave) |
| 9 | [`20261104-154114`](https://github.com/Tarasevych/hub/releases/tag/20261104-154114) | `IDENTITY-ACCOUNT · 20261104-154114` | 2026-11-04 15:41 | `IDENTITY-ACCOUNT` (Vooruitgave) |
| 10 | [`20261104-153759`](https://github.com/Tarasevych/hub/releases/tag/20261104-153759) | `IDENTITY-ACCOUNT · 20261104-153759` | 2026-11-04 15:38 | `IDENTITY-ACCOUNT` (Vooruitgave) |
| 11 | [`20261104-075953`](https://github.com/Tarasevych/hub/releases/tag/20261104-075953) | `MAILPOLISH-001 · 20261104-075953 (unsigned)` | 2026-11-04 08:00 | `MAILPOLISH-001` (`feature/mailpolish-001-20261104-084133` — in `voornaamst`) |
| 12 | [`20261104-063430`](https://github.com/Tarasevych/hub/releases/tag/20261104-063430) | `MAILMOB-001 · 20261104-063430 (unsigned)` | 2026-11-04 06:34 | `MAILMOB-001` (`feature/mailmob-001-20261104-073200` — in `voornaamst`) |
| 13 | [`20261103-211554`](https://github.com/Tarasevych/hub/releases/tag/20261103-211554) | `MAILORBIT-001 · 20261103-211554 (unsigned)` | 2026-11-03 21:16 | `MAILORBIT-001` (`feature/mailorbit-001-20261103-205354` — in `voornaamst`) |
| 14 | [`login-001-candidate-20261102-092316`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-092316) | `LOGIN-001 · Непідписаний кандидат 20261102-092316` | 2026-11-02 09:23 | `LOGIN-001` (`feature/login-001-20261101-184800-chatgpt`) |
| 15 | [`login-001-candidate-20261102-070214`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-070214) | `LOGIN-001 · Непідписаний кандидат 20261102-070214` | 2026-11-02 07:02 | `LOGIN-001` (CI-vooruitgave) |
| 16 | [`login-001-candidate-20261102-062359`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-062359) | `LOGIN-001 · Непідписаний кандидат 20261102-062359` | 2026-11-02 06:24 | `LOGIN-001` (CI-vooruitgave) |
| 17 | [`login-001-candidate-20261102-053006`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-053006) | `LOGIN-001 · Непідписаний кандидат 20261102-053006` | 2026-11-02 05:30 | `LOGIN-001` (CI-vooruitgave) |
| 18 | [`login-001-candidate-20261102-010425`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-010425) | `LOGIN-001 · Непідписаний кандидат 20261102-010425` | 2026-11-02 01:04 | `LOGIN-001` (CI-vooruitgave) |
| 19 | [`20261010-ux`](https://github.com/Tarasevych/hub/releases/tag/20261010-ux) | `mijn-ruimte-20261010-ux` | 2026-10-10 19:30 | Eerste basisrelease na de overstap naar self-hosting (`Latest`) |

---

<!-- HISTORIE-001:aanvulling-20261113 -->
## Aanvulling 13-11-2026: 122 takken, PR #28–#76, releases tot 20261113-121403

> Aanvulling HISTORIE-001; de tabellen hierboven tonen de stand van 04-11-2026 en zijn ongewijzigd. Voorganger en opvolger per tak staan in [KRONIEK-TAKKEN](./KRONIEK-TAKKEN.nl.md), die voortaan alleen wordt aangevuld door `scripts/geschiedenis/kroniek.mjs`.

| PR | Aangemaakt | Tak → basis | Status | Titel |
|---|---|---|---|---|
| [#28](https://github.com/Tarasevych/hub/pull/28) | 2026-11-05 | `feature/design-001-20261105-140000` → `feature/identity-account-ui-20261104-180000` | gesloten | DESIGN-001: оновити спільний дизайн і робочий стіл |
| [#29](https://github.com/Tarasevych/hub/pull/29) | 2026-11-05 | `feature/design-002-20261105-134500` → `integratie` | samengevoegd 2026-11-05 | DESIGN-002: продовження адаптивного оновлення інтерфейсу |
| [#30](https://github.com/Tarasevych/hub/pull/30) | 2026-11-05 | `claude/project-thread-99x4j9` → `integratie` | samengevoegd 2026-11-06 | ORCH-001: закриття задачі після PR #16/#17 і старі помилки пошуку, контрасту, мобільної верстки й тестів |
| [#31](https://github.com/Tarasevych/hub/pull/31) | 2026-11-05 | `integratie` → `voornaamst` | samengevoegd 2026-11-06 | DESIGN-002: Адаптивні поверхні й узгоджені порожні стани |
| [#32](https://github.com/Tarasevych/hub/pull/32) | 2026-11-05 | `claude/project-thread-ocqmeu` → `integratie` | samengevoegd 2026-11-06 | ZOEKDIEP-001: глибокі посилання пошуку, підрозділи хабу й доступ у каталозі |
| [#33](https://github.com/Tarasevych/hub/pull/33) | 2026-11-06 | `claude/project-thread-99x4j9` → `integratie` | samengevoegd 2026-11-06 | ORCH-001: старі помилки з перевірки перед злиттям PR #30 (тести, права тек, CSS-токени) |
| [#34](https://github.com/Tarasevych/hub/pull/34) | 2026-11-06 | `claude/project-thread-ocqmeu` → `integratie` | samengevoegd 2026-11-06 | ZOEKDIEP-001: стара хмара відкриває елемент з пошуку й поза bootstrap |
| [#35](https://github.com/Tarasevych/hub/pull/35) | 2026-11-06 | `claude/project-thread-ocqmeu` → `integratie` | samengevoegd 2026-11-06 | ZOEKDIEP-001: стара хмара більше не затирає resume після діплінка поза bootstrap |
| [#36](https://github.com/Tarasevych/hub/pull/36) | 2026-11-06 | `claude/project-thread-99x4j9` → `integratie` | samengevoegd 2026-11-06 | ORCH-001: Chrome-перевірка «Координація агентів» бере версію правил із beleid.json |
| [#37](https://github.com/Tarasevych/hub/pull/37) | 2026-11-06 | `feature/uitgave-001-20261106-081134` → `integratie` | open | UITGAVE-001: випуск 20261106-081134 з integratie (задача, журнал TRACE-001, workflow) |
| [#38](https://github.com/Tarasevych/hub/pull/38) | 2026-11-06 | `claude/project-thread-99x4j9` → `integratie` | samengevoegd 2026-11-06 | UITGAVE-001: пакувальник більше не ріже кириличний список змін посеред символу |
| [#39](https://github.com/Tarasevych/hub/pull/39) | 2026-11-06 | `feature/uitgave-001-20261106-092612` → `integratie` | samengevoegd 2026-11-06 | UITGAVE-001: випуск 20261106-092612 з integratie (друга спроба: задача, журнал TRACE-001, workflow) |
| [#40](https://github.com/Tarasevych/hub/pull/40) | 2026-11-06 | `claude/project-thread-3fl2lm` → `integratie` | samengevoegd 2026-11-06 | UITROL-UTF8-001: інсталятор обрізає AUTEUR/SAMENVATTING по цілому символу UTF-8 |
| [#41](https://github.com/Tarasevych/hub/pull/41) | 2026-11-06 | `feature/design-003-20261106-103743` → `integratie` | samengevoegd 2026-11-06 | DESIGN-003 · адаптивна дошка підключень ШІ та чотири канали Antigravity |
| [#42](https://github.com/Tarasevych/hub/pull/42) | 2026-11-06 | `feature/ext090-001-20261106-142448` → `integratie` | gesloten | EXT090-001 (замінено #43): розширення 0.9.2 і підтримка на сайті |
| [#43](https://github.com/Tarasevych/hub/pull/43) | 2026-11-06 | `feature/ext090-001-20261106-163840` → `integratie` | samengevoegd 2026-11-06 | EXT090-001: розширення 0.9.2 і підтримка на сайті (перезбірка на встановленій 20261106-142434) |
| [#44](https://github.com/Tarasevych/hub/pull/44) | 2026-11-07 | `feature/identiteit-003-account-atelier-20261107-190805` → `integratie` | samengevoegd 2026-11-07 | IDENTITEIT-003 · Оформлення облікового запису з безпечним поверненням |
| [#45](https://github.com/Tarasevych/hub/pull/45) | 2026-11-08 | `feature/identiteit-atelier-v49-nieuwste-20261108` → `integratie` | gesloten | Замінено запитом №46 · перенесення оформлення версії 49 |
| [#46](https://github.com/Tarasevych/hub/pull/46) | 2026-11-08 | `feature/identiteit-atelier-v49-20261108-071906` → `integratie` | samengevoegd 2026-11-08 | ІДЕНТИЧНІСТЬ-004 · точне оформлення версії 49 без повторення засобів доступу |
| [#47](https://github.com/Tarasevych/hub/pull/47) | 2026-11-08 | `fix/identiteit-005-20261108-083100` → `integratie` | samengevoegd 2026-11-08 | ІДЕНТИЧНІСТЬ-005 · завершити оформлення версії 49 для випуску |
| [#48](https://github.com/Tarasevych/hub/pull/48) | 2026-11-08 | `fix/trace-002-20261108-090548` → `integratie` | samengevoegd 2026-11-08 | TRACE-002 · усунути помилку перевірки походження випуску |
| [#49](https://github.com/Tarasevych/hub/pull/49) | 2026-11-08 | `fix/mobiel-001-20261108-100838` → `integratie` | samengevoegd 2026-11-08 | MOBIEL-001 · відновити охайне оформлення центру налаштувань на смартфонах |
| [#50](https://github.com/Tarasevych/hub/pull/50) | 2026-11-08 | `claude/project-thread-3y80yu` → `integratie` | samengevoegd 2026-11-09 | IDENTITEIT-006/007 · «Студія» та вигляд «Макет» за дизайном власника для центру облікового запису |
| [#51](https://github.com/Tarasevych/hub/pull/51) | 2026-11-08 | `feature/identiteit-006-20261108-162906` → `voornaamst` | open | ІДЕНТИЧНІСТЬ-004: відтворено оформлення версії 49 з чинними діями та перемикачем |
| [#52](https://github.com/Tarasevych/hub/pull/52) | 2026-11-09 | `feature/identiteit-007-20261109-051209` → `integratie` | samengevoegd 2026-11-09 | IDENTITEIT-007 · гілка випуску вигляду «Макет» центру облікового запису |
| [#53](https://github.com/Tarasevych/hub/pull/53) | 2026-11-09 | `feature/identiteit-007-20261109-055709` → `integratie` | samengevoegd 2026-11-09 | IDENTITEIT-007 · друга гілка випуску: перемикач вигляду видно з класичної сторінки |
| [#54](https://github.com/Tarasevych/hub/pull/54) | 2026-11-09 | `feature/identiteit-007-20261109-065225` → `integratie` | samengevoegd 2026-11-09 | IDENTITEIT-007 · третій випуск: «Макет» завжди в списку виглядів, перемикач функції з міграції |
| [#55](https://github.com/Tarasevych/hub/pull/55) | 2026-11-09 | `claude/project-thread-qtn620` → `integratie` | open | PERF-001 · швидший старт сторінок: менший бандл, менше запитів, стиснення |
| [#56](https://github.com/Tarasevych/hub/pull/56) | 2026-11-09 | `claude/project-thread-3y80yu` → `integratie` | open | IDENTITEIT-007 · міграція 0200: опис перемикача вкладається в межу CHECK (≤ 300 знаків) |
| [#57](https://github.com/Tarasevych/hub/pull/57) | 2026-11-09 | `claude/project-thread-4pq3u6` → `integratie` | gesloten | UITROL-001 · Модернізація оновлення: перевірка вимог, проба міграцій, конвеєр, термінал-вікно, зупинка власником |
| [#58](https://github.com/Tarasevych/hub/pull/58) | 2026-11-09 | `feature/uitrol-001-20261109-102608` → `integratie` | samengevoegd 2026-11-09 | UITROL-001 · гілка випуску: модернізоване оновлення + PERF-001 |
| [#59](https://github.com/Tarasevych/hub/pull/59) | 2026-11-09 | `feature/mailbg-001-20261109-161500` → `integratie` | samengevoegd 2026-11-09 | MAILBG-001 · живе тло пошти з лінзою та налаштуваннями |
| [#60](https://github.com/Tarasevych/hub/pull/60) | 2026-11-09 | `release/mailbg-001-samenvoegen-20261109-215500` → `integratie` | samengevoegd 2026-11-09 | MAILBG-001 · узгодити встановлену версію та випустити тло пошти |
| [#61](https://github.com/Tarasevych/hub/pull/61) | 2026-11-10 | `feature/huis-001-20261110-072933` → `integratie` | open | HUIS-001 · Розумний будинок «Живий дім»: клікабельний макет на сайті, специфікація дизайну, виправлення розділу «Дім» (етап 0) |
| [#62](https://github.com/Tarasevych/hub/pull/62) | 2026-11-10 | `fix/mailscan-002-20261110-082557` → `integratie` | samengevoegd 2026-11-10 | MAILSCAN-002 · добровільна перевірка адрес і живе рідинне тло пошти |
| [#63](https://github.com/Tarasevych/hub/pull/63) | 2026-11-10 | `feature/mailbg-001-aanraking-20261110` → `integratie` | samengevoegd 2026-11-10 | MAILBG-001 · зберегти лінзу після дотику та узгодити перевірки |
| [#64](https://github.com/Tarasevych/hub/pull/64) | 2026-11-10 | `integratie` → `feature/mailscan-002-uitgave-20261110-120000` | samengevoegd 2026-11-10 | MAILSCAN-002 · додати найновіші інтегровані зміни до випуску |
| [#65](https://github.com/Tarasevych/hub/pull/65) | 2026-11-11 | `feature/identiteit-008-accountmenu-v3-20261111-142500` → `integratie` | open | IDENTITEIT-008: меню облікового запису v3, виправлення пошти Google та відкрита агентна екосистема ШІ |
| [#66](https://github.com/Tarasevych/hub/pull/66) | 2026-11-11 | `feature/github-010-volledige-omgeving-20261111-210000` → `integratie` | open | GITHUB-010: повноцінне двостороннє робоче середовище GitHub та екосистемні мости · volledige tweerichtings-GitHub-werkruimte |
| [#67](https://github.com/Tarasevych/hub/pull/67) | 2026-11-12 | `fix/github-011-oauth-sleutelkluis-20261112-032000` → `integratie` | open | GITHUB-011: виправити зворотний виклик OAuth та однонатискове підключення GitHub при закритому сховищі ключів |
| [#68](https://github.com/Tarasevych/hub/pull/68) | 2026-11-12 | `fix/github-012-mobiele-weergave-20261112-041500` → `integratie` | open | GITHUB-012: повна адаптація мобільної, планшетної та настільної версій розділу GitHub у всіх 13 підрозділах і просторах |
| [#69](https://github.com/Tarasevych/hub/pull/69) | 2026-11-12 | `dependabot/npm_and_yarn/npm_and_yarn-78234950ac` → `voornaamst` | open | Bump fast-xml-parser from 5.11.2 to 5.12.0 in the npm_and_yarn group across 1 directory |
| [#70](https://github.com/Tarasevych/hub/pull/70) | 2026-11-12 | `fix/identiteit-009-mobiel-veiligheid-20261112-080000` → `integratie` | open | IDENTITEIT-009 · повна мобільна адаптація всіх трьох режимів id.tarasevych.com та зміцнення безпеки й швидкодії |
| [#71](https://github.com/Tarasevych/hub/pull/71) | 2026-11-12 | `fix/identiteit-010-aanmelden-ecosysteem-20261112-103500` → `integratie` | open | IDENTITEIT-010 · цілісний вхід на всіх піддоменах, єдиний сеанс простору, Telegram і сповіщення |
| [#72](https://github.com/Tarasevych/hub/pull/72) | 2026-11-12 | `feature/cloud-001-delen-mappen-20261112-174242` → `integratie` | open | CLOUD-001: завантаження тек і архівів у хмару, спільний доступ до папок і частин файлів та статистика посилань |
| [#73](https://github.com/Tarasevych/hub/pull/73) | 2026-11-12 | `claude/admiring-wozniak-gahlxr` → `integratie` | open | MCP-001 · R0+R1: схеми браузерних інструментів, Origin, CIMD, iss, план до MCP 2026-07-28 |
| [#74](https://github.com/Tarasevych/hub/pull/74) | 2026-11-12 | `feature/mcp-001-platform-20261112-210500` → `integratie` | open | MCP-001 · Повна підтримка протоколу MCP 2026-07-28 + 2025-11-25, безпека OAuth 2.1 та вбудована Студія-Інспектор (mcp.tarasevych.com) |
| [#75](https://github.com/Tarasevych/hub/pull/75) | 2026-11-13 | `fix/sec-002-20261112-121623` → `integratie` | open | SEC-002 · виправлення вразливостей за глибоким аудитом безпеки поверх версії 20261112-192752 |
| [#76](https://github.com/Tarasevych/hub/pull/76) | 2026-11-13 | `claude/optimistic-mayer-exvf2p` → `voornaamst` | open | IDENTITEIT-011: план доопрацювання вигляду «Макет» центру облікового запису |
