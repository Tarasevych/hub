> 🌐 **Taal / Мова:** [Українська](ВИПРОБУВАННЯ-4-ВАД-МОБІЛЬНОГО-ВХОДУ-HERSTEL-001.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Verificatieproeven voor vier mobiele aanmeld- en accountmenugebreken (`HERSTEL-001`)

## Doel

Dit document legt de analyse en de verificatieproeven vast voor vier weergave- en aanmeldgebreken van het mobiele aanmeldscherm (`hub.tarasevych.com`) en het venster «Accounts», vastgesteld aan de hand van drie schermafbeeldingen van de eigenaar van `25.11.2026` (`11:05:50`, `11:05:56`, `11:06:20`), met inachtneming van de onveranderlijke ontwerpeisen van de eigenaar (`K1-T1`, `K1-T3`, `K1-T4`). Het geautomatiseerde eenheidscontract staat in `tests/eenheid/herstel-001-aanmelden-mobiel-vier-gebreken.test.ts`.

---

## Overzicht van de vastgestelde gebreken en verificatiecontracten

### 1. Proef `T-1` — Gelijke hoogte van de taalpil `🇺🇦 укр.` en de thema- en profielknop rechtsboven (opname `11:05:50`, `K1-T1`)

- **Gebrek:** op een mobiel scherm (`<= 700 px`) werd de taalpil `.mr-sign-in-taal` (`🇺🇦 укр.` / `🇧🇪 NL`) in `.mr-sign-in-quick-controls` `44 px` hoog, hing de aangrenzende themaknop zonder rand of kaartvlak los in de lucht en had de ronde profielknop een kader van `38×38 px` — drie niet-passende vormen en hoogtes naast elkaar.
- **Oorzaak:** in `src/account-afgemeld-menu.css` verloor de selector voor `button.mr-sign-in-taal` van de algemene mobiele tikregel `min-height: var(--tik-hoogte-mobiel)` (`44 px`) met specificiteit `(0,3,1)` in `src/ontwerp/mobiel.css`, die in `src/main.tsx` later wordt geladen, terwijl het vlak en de rand niet op `38 px` waren gelijkgetrokken.
- **Hersteleis:** behoud de compacte taalpil met rechthoekige vlag en korte taalnaam (`<MoviPrapor taal={lang} /><b>{MOVA_NAAM[lang]}</b>` zonder de klasse `is-icoon`), die een compact uitklapmenu `.mr-sign-in-taal-menu` met volledige taalnamen en vinkje opent; breng `.mr-sign-in-taal`, `.mr-sign-in-thema` en `.canonical-avatar-trigger` op één gelijke zichtbare hoogte van `38 px` (boogstraal `19 px`), hetzelfde kaartvlak `var(--mr-login-card)`, rand `1px solid var(--mr-login-border)`, contrastkleur `var(--mr-login-ink)`, mobiele specificiteit `(0,4,1)` en een onzichtbaar aanraakvlak van `44 px` via `::after` (`inset: -3px`).

### 2. Proef `T-2` — Gelijke omvang van het Telegram- en Google-pictogram in de aanmeldknoppen (opname `11:05:50`)

- **Gebrek:** de twee hoofdknoppen («Aanmelden met Google» en «Aanmelden met Telegram») staan onder elkaar met hetzelfde drievoudige rooster `34px minmax(0,1fr) 34px`, maar de Google-knop toont links een rond medaillon van `34×34 px` terwijl de Telegram-knop een kleiner blauw cirkeltje van `22×22 px` toonde (`<TelegramLogo maat={22} />` binnen `.tga-aanmeld-logo` van `24–28 px`) dat op schermen `<= 380 px` niet mee schaalde.
- **Oorzaak:** in `src/aanmeld-herontwerp.css` is `.mr-sign-in-logo` `34×34 px` (`30×30 px` bij `<= 380 px`), terwijl `.tga-aanmeld-logo` kleiner was gebleven en `max-width: 100%; max-height: 100%` miste voor de ingebedde afmeting van `<Merk>`.
- **Hersteleis:** op het aanmeldscherm (`.canonical-signed-out.mr-sign-in`) hebben `.tga-aanmeld-logo` en het ronde Telegram-pictogram exact dezelfde buitendiameter als `.mr-sign-in-logo`: `34×34 px` (en `30×30 px` met `flex: 0 0 30px` en `max-width: 100%; max-height: 100%` bij `<= 380 px`).

### 3. Proef `T-3` — Venster «Accounts» (`AccountMenuV3`) op het aanmeldscherm: `+-baan`, taalnamen en themarij (opname `11:05:56`, `K1-T3`)

- **Gebrek:**
  1. In de compacte taalrij (`.am3-pref-row.is-lang-row`) stond de eerste knop met hoofdletter (`🇺🇦 Українська`), terwijl de tweede knop met kleine letter was afgekort (`🇧🇪 нід.`).
  2. In de themarij (`.am3-pref-row.is-theme-row`) werden op mobiele schermen breder dan `420 px` (zoals `432–460 CSS px`) het label `☀️ Тема`, 4 segmentknoppen (`🖥️`, `☀️`, `🌙`, `☀️ За добою`) en 2 ronde knoppen (`🌊` levende achtergrond en `🎨` kleurenpalet) op één krappe regel samengedrukt.
- **Oorzaak:** in `src/accountmenu-v3/AccountMenuV3.tsx` stond `'нід.'` met een kleine letter en in `src/accountmenu-v3/accountmenu-v3.css` gold de tweeregelige opmaak voor `.am3-pref-row.is-theme-row` alleen onder `@media (max-width: 420px)` in plaats van het hele mobiele bereik `<= 700 px`.
- **Hersteleis:** corrigeer de afkorting naar `'Нід.'` met hoofdletter in de compacte eenregelige taalschakelaar (`'Українська'` / `'Нід.'` voor `uk` en `'Oekr.'` / `'Nederlands'` voor `nl`), behoud de orbitale `+`-cirkel (`.am3-orbit-node.is-add`) altijd zichtbaar in elke toestand en pas de tweeregelige opmaak van `.is-theme-row` met verhoudingen `flex: 1 1 0` en `flex: 2.1 1 0` toe op `@media (max-width: 700px)`.

### 4. Proef `T-4` — Gelijkgetrokken opstart-profielicoon en behoud van de actieve aanmeldstatus met volledige zichtbaarheid van de laadindicatoren (opnamen `11:05:56` en `11:06:20`, `K1-T4`)

- **Gebrek:**
  1. Tijdens het opstarten had het profielicoon `.canonical-boot-account` in `#boot-shell` een afwijkende maat en afstand, waardoor het bij montage versprong ten opzichte van de profielknop van `38×38 px`.
  2. Bij het starten van een aanmelding via de knop «🔑 Aanmelden bij uw account» in het accountmenu (`onAddAccount` -> `startPrimaryRedirectLogin`) werd de markering `mr-aanmelden-bezig` niet gezet, waardoor na terugkeer van Google de aanmeldkaart met de knop «Aanmelding controleren…» verdween.
- **Oorzaak:** in het mobiele blok `@media (max-width: 700px)` van `index.html` week de maat van `.canonical-boot-account` af van de `38×38 px` van de bovenbalk op het aanmeldscherm, en `startPrimaryRedirectLogin` in `src/aanmeld-omleiding.ts` legde `mr-aanmelden-bezig` eerder niet vast bij `intent !== 'step-up'`.
- **Hersteleis:** trek de mobiele `.canonical-boot-account` in `index.html` gelijk op exact `38×38 px` (`top: 14px; right: 24px`), leg `mr-aanmelden-bezig` vast in `startPrimaryRedirectLogin` (met opruiming bij een omleidingsfout) en behoud alle drie de ontworpen laadonderdelen volledig zichtbaar zonder ze te verbergen: de voortgangsbalk `#tsv-voortgang`, de zwevende laadkapsel `#tsv-laad-kapsel` en het centrale draaiwiel `.canonical-boot-spin`.
