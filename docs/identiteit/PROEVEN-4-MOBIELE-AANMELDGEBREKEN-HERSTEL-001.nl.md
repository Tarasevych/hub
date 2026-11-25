> 🌐 **Taal / Мова:** [Українська](ВИПРОБУВАННЯ-4-ВАД-МОБІЛЬНОГО-ВХОДУ-HERSTEL-001.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Verificatieproeven voor vier mobiele aanmeld- en accountmenugebreken (`HERSTEL-001`)

## Doel

Dit document legt de analyse en de verificatieproeven vast voor vier weergave- en aanmeldgebreken van het mobiele aanmeldscherm (`hub.tarasevych.com`) en het venster «Accounts», vastgesteld aan de hand van drie schermafbeeldingen van de eigenaar van `25.11.2026` (`11:05:50`, `11:05:56`, `11:06:20`). Het geautomatiseerde eenheidscontract staat in `tests/eenheid/herstel-001-aanmelden-mobiel-vier-gebreken.test.ts`.

---

## Overzicht van de vastgestelde gebreken en verificatiecontracten

### 1. Proef `T-1` — Hoogte van de taalpil `🇺🇦 укр.` rechtsboven op mobiel (opname `11:05:50`)

- **Gebrek:** op een mobiel scherm (`<= 700 px`) wordt de taalpil `.mr-sign-in-taal` (`🇺🇦 укр.`) in `.mr-sign-in-quick-controls` `44 px` hoog in plaats van de beoogde `32 px`, waardoor zij groter en zwaarder oogt dan de aangrenzende themaknop (`38×38 px`) en de ronde profielknop (`38×38 px`).
- **Oorzaak:** in `src/account-afgemeld-menu.css` heeft de selector `.canonical-chrome .mr-sign-in-quick-controls button.mr-sign-in-taal` specificiteit `(0,3,1)` — exact gelijk aan de algemene mobiele tikregel `min-height: var(--tik-hoogte-mobiel)` (`44 px`) in `src/ontwerp/mobiel.css`, die in `src/main.tsx` later wordt geladen en de hoogte van `32 px` overschrijft.
- **Hersteleis:** de mobiele selector voor `button.mr-sign-in-taal` heeft een specificiteit strikt hoger dan `(0,3,1)` (ten minste `(0,4,1)` of `(0,5,0)`), behoudt een zichtbare hoogte van `32 px` en biedt via `::after` een onzichtbaar aanraakvlak van ten minste `44 px`.

### 2. Proef `T-2` — Gelijke omvang van het Telegram- en Google-pictogram in de aanmeldknoppen (opname `11:05:50`)

- **Gebrek:** de twee hoofdknoppen («Aanmelden met Google» en «Aanmelden met Telegram») staan onder elkaar met hetzelfde drievoudige rooster `34px minmax(0,1fr) 34px`, maar de Google-knop toont links een rond medaillon van `34×34 px` terwijl de Telegram-knop een aanzienlijk kleiner blauw cirkeltje van `22×22 px` toont (`<TelegramLogo maat={22} />` binnen `.tga-aanmeld-logo` van `24–28 px`).
- **Oorzaak:** in `src/aanmeld-herontwerp.css` is `.mr-sign-in-logo` `34×34 px` (`30×30 px` bij `<= 380 px`), terwijl `.tga-aanmeld-logo` in `src/telegram-aanmelden/telegram.css` en `src/telegram-aanmelden/AanmeldTelegram.tsx` kleiner is gebleven.
- **Hersteleis:** op het aanmeldscherm (`.canonical-signed-out.mr-sign-in`) hebben `.tga-aanmeld-logo` en het ronde Telegram-pictogram dezelfde buitendiameter als `.mr-sign-in-logo`: `34×34 px` (en `30×30 px` bij `<= 380 px`).

### 3. Proef `T-3` — Venster «Accounts» (`AccountMenuV3`) op het aanmeldscherm vóór aanmelding (opname `11:05:56`)

- **Gebrek:**
  1. In de taalrij (`.am3-pref-row.is-lang-row`) staat de eerste knop voluit met hoofdletter (`🇺🇦 Українська`), terwijl de tweede knop is ingekort tot een kleine-letterafkorting (`🇧🇪 нід.`).
  2. In de themarij (`.am3-pref-row.is-theme-row`) worden op een smal telefoonscherm het label `☀️ Тема`, 4 segmentknoppen (`🖥️`, `☀️`, `🌙`, `☀️ За добою`) en 2 ronde knoppen (`🌊` levende achtergrond en `🎨` kleurenpalet) op één krappe regel samengedrukt.
  3. In de kop vóór aanmelding (`!displayUser && visibleRows.length === 0`) verschijnen twee knoppen voor dezelfde aanmeldactie: een gestippelde `+`-cirkel naast het lege profielsilhouet `👤` én de hoofdknop «🔑 Aanmelden bij uw account» onder de titel.
- **Oorzaak:** in `src/accountmenu-v3/AccountMenuV3.tsx` staat vast `uk ? 'нід.' : 'Nederlands'` geprogrammeerd en tekent de rechtervleugel `.am3-orbit-wing.is-right` altijd de `+`-knop, ook wanneer er nog geen gebruiker is aangemeld en er geen bewaarde accounts zijn.
- **Hersteleis:** gelijkwaardige taalnamen met hoofdletter zonder het afgekorte `нід.`, geen dubbele `+`-knop naast het lege profielsilhouet bij `!displayUser && visibleRows.length === 0`, en een passende opmaak van de themarij op mobiele schermen.

### 4. Proef `T-4` — Vermijden van een drievoudige laadindicator en behoud van de actieve aanmeldstatus (opnamen `11:05:56` en `11:06:20`)

- **Gebrek:**
  1. Tijdens het laden of bij terugkeer na aanmelding (`11:06:20`) draaien op een leeg donker scherm drie laadindicatoren tegelijk: de bovenste voortgangsbalk (`#tsv-voortgang` op `36%`), de bovenste laadkapsel `( ⟳ ) Завантаження...` (`#tsv-laad-kapsel`) en het grote draaiwiel in het midden (`.canonical-boot-spin` / `.canonical-checking-spinner`).
  2. Rechtsboven verdwijnen tijdens deze toestand de taal- en themaknop en verandert de ronde profielknop van omvang en positie.
  3. Bij het starten van een aanmelding via de knop «🔑 Aanmelden bij uw account» in het accountmenu (`onAddAccount` -> `startPrimaryRedirectLogin`) wordt de markering `mr-aanmelden-bezig` niet gezet, waardoor na terugkeer van Google de aanmeldkaart met de knop «Aanmelding controleren…» verdwijnt.
- **Oorzaak:** `startPrimaryRedirectLogin` in `src/aanmeld-omleiding.ts` legt `mr-aanmelden-bezig` niet vast bij `intent === 'login'`, en `index.html` plus `src/navigatie-snel.ts` tonen de laadkapsel `#tsv-laad-kapsel` bovenop een leeg scherm dat al een middenspinner (`#boot-shell` of `.canonical-signed-out.checking`) toont.
- **Hersteleis:** een aanroep van `startPrimaryRedirectLogin` met `intent === 'login'` legt altijd `mr-aanmelden-bezig` vast, en zolang `#boot-shell` of `.canonical-signed-out.checking` al een centraal draaiwiel toont, dupliceert `#tsv-laad-kapsel` geen tweede draaiwiel op het lege scherm.
