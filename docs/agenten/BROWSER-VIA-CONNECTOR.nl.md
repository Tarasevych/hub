> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./BROWSER-VIA-CONNECTOR.uk.md) · **🇳🇱 Nederlands** ([origineel](./BROWSER-VIA-CONNECTOR.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# De browser via de connector van «Mijn Ruimte» — voor elke AI-agent

Stand: 23.10.2026 (extensie 0.7.0, migratie 0110). Voor de eigenaar van een BYOS-server en voor ontwikkelaars van agenten. Alles draait op de server
van de eigenaar en in zijn browser; geen externe diensten, geen hosting door derden.

## 1. Wat het is

Elke agent die gekoppeld is aan onze connector (`https://mcp.<uw-domein>/<agent>`: `claude`, `gpt`, `grok`, `gemini`, `copilot`, `cursor`),
krijgt **dezelfde browserhulpmiddelen**. Die werken via de extensie «Mijn Ruimte» in de browser van de eigenaar — in twee gescheiden sloten:

| Slot | Wat de agent ziet | Hoe het geopend wordt | Langste termijn |
|---|---|---|---|
| **Privé** (`…_gebruiker`) | alleen uw eigen pagina's: hub, mail, cloud, ai, id, github, huis, mcp (nooit admin.\*, api.\*) | «Toegang openen» + bevestiging van de aanmelding (passkey, code of Google) | 1 jaar (naar uw keuze en beleid) |
| **Technisch** (`…_beheer`) | alleen tabbladen met een **actief** technisch profiel, op de beheerhosts die u hebt gekozen | «Ontgrendelen met passkey» in het technisch profiel | 1 jaar; elk technisch verzoek vereist nog steeds een actief profiel in het tabblad |

Het verschil tussen agenten zit **alleen in uw toestemmingen**, en niet in de reeks hulpmiddelen (test `connector-browser-gelijk-20261022`).

## 2. Eén bedieningsplek: mcp.\*/agents → «Browser en agenten» (`#browser`)

Op één scherm:
1. **Sloten** — stand, resterende tijd, termijn (15 min, 1 u, 4 u, tot het einde van de technische activering, tot de browser sluit, tot uitloggen,
   tot intrekken, 1 week, 1 maand, 6 maanden, 1 jaar), pagina's, «Toegang openen» / «Vergrendelen».
   **Een herstart van de browser** maakt geen einde aan «tot uitloggen», «tot intrekken» en termijnen van een week tot een jaar (de server bewaart de ontgrendeling
   en stuurt haar opnieuw). Korte termijnen (15 min, 1 u, 4 u, tot het einde van de technische activering) en «tot de browser sluit» eindigen
   wanneer de browser gesloten wordt: extensie 0.7.0 meldt bij elke verbinding een browsersessie-id (`chrome.storage.session`),
   een andere id = browser herstart → de server trekt in (`browser-gesloten`). Een update of herladen van de extensie begint ook
   een nieuwe sessie. Als Chrome op de achtergrond blijft draaien na het sluiten van vensters, is de browser nog niet gesloten. **Uitloggen op de site maakt altijd
   een einde — aan elke termijn** in beide sloten (waaronder uitloggen in één tabblad en wisselen van account in een tabblad).
2. **Matrix** mogelijkheid × agent (`alle` + zes agenten) voor elk slot: lezen, navigatie, klikken/typen, schermafdruk,
   console/netwerk, diepe diagnose (alleen technisch), scripts (alleen technisch). Snelle sets: «Alles toestaan voor ontwikkeling»
   (met waarschuwing), «Alleen lezen», «Blokkeren». Schakelaars «zonder bevestiging per actie» en «namen zoals chrome-devtools-mcp».
   Ruimer opslaan vraagt een bevestiging van de aanmelding; een lopende ontgrendeling wordt meteen opnieuw ondertekend — de agent hoeft niets te herhalen.
3. **Wat er verder nog toegestaan moet zijn** — voor elke agent: de rechten van zijn connector (hoeveel van de browserhulpmiddelen u hem hebt gegeven in het venster
   «Toestaan») en welke hulpmiddelen zijn uitgeschakeld door de modus (site-instellingen of uw ondertekende AI-beleid in admin → «AI-toegang»).
   Het opslaan van de matrix zet zelf riskante browserhulpmiddelen aan voor de toegestane mogelijkheden («met bevestiging» of zonder) —
   als er een ondertekend AI-beleid geldt, beslist dat beleid en toont het scherm alleen zijn beslissing.
4. **Laatste weigeringen aan agenten** — uit het journaal, in gewone taal, met de rij/kolom die ontbreekt.

### Volledige keten voor één aanroep
`connectorrechten (venster «Toestaan»)` → `levende kant (technisch — alleen met een actief profiel en de dienst «AI-koppeling»)` →
`modus van het hulpmiddel (ondertekend AI-beleid, anders site-instellingen)` → `ontgrendeling van het slot (termijn, pagina's)` ∩ `extensiebeleid
(eigenaar / users.manage)` ∩ **`matrix voor deze agent`** → `de extensie controleert nogmaals handtekening, slot, tabbladprofiel, host, account`.

## 3. Stap voor stap (voor elke agent)

1. Installeer extensie 0.7.0 (mcp.\*/agents → «Browserextensie») en koppel het slot / de sloten.
2. Koppel de agent op zijn adres (tabblad «Gekoppelde AI»), zet in het venster «Toestaan» de groep **«Browser»** aan — in het privé- en/of
   technische gedeelte.
3. «Browser en agenten»: vink de mogelijkheden aan voor deze agent (of voor «alle»), klik op «Opslaan».
4. Open het slot voor de gewenste termijn. Voor technisch: activeer het technisch profiel in het tabblad.
5. De agent roept `tools/list` aan en ziet de browserhulpmiddelen.

## 4. Namen van hulpmiddelen

Volledige naam v2: `<essentie>_<agent>_mcp_tarasevych_com_<gebruiker|beheer>`, bijvoorbeeld `lezen_pagina_claude_mcp_tarasevych_com_gebruiker`.

| Intern | Essentie (v2) | chrome-devtools-mcp | Mogelijkheid |
|---|---|---|---|
| browser_list_tabs | tonen_tabbladen | list_pages | lezen |
| browser_snapshot | lezen_pagina | take_snapshot | lezen |
| browser_scroll | scrollen_pagina | — | lezen |
| browser_wait_for_text | wachten_op_tekst | wait_for | lezen |
| browser_get_diagnostics, browser_audit | tonen_diagnose, tonen_pagina_audit | performance_start_trace / _stop_trace (→ prestatie-audit) | lezen |
| browser_console, browser_network | lezen_console, lezen_netwerk | list_console_messages, get_console_message, list_network_requests, get_network_request | console/netwerk (samen met «lezen»: oude leestoestemmingen werken zoals voorheen, de matrix vereist daarnaast de rij «Console en netwerk») |
| browser_open, browser_history, browser_pages | openen_pagina, navigeren_geschiedenis, beheren_tabbladen | navigate_page, navigate_page_history, new_page, select_page, close_page | navigatie |
| browser_click, browser_type, browser_hover, browser_fill_form, browser_select_option, browser_press_key, browser_invoke_action | klikken_element, typen_tekst, aanwijzen_element, invullen_formulier, kiezen_optie, drukken_toets, uitvoeren_site_actie | click, fill, hover, fill_form, press_key | klikken/typen |
| browser_screenshot | maken_schermafdruk | take_screenshot | schermafdruk |
| browser_get_deep_diagnostics | uitvoeren_diepe_diagnose | — | diepe diagnose (alleen technisch, pakket «diagnose») |
| browser_script | uitvoeren_script (alleen `_beheer`) | evaluate_script | scripts (alleen technisch, pakket «diagnose», vinkje in de matrix) |

## 5. Voorbeelden van aanroepen (JSON-RPC, `POST https://mcp.<domein>/<agent>`, `Authorization: Bearer <OAuth-token>`)

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lezen_pagina_claude_mcp_tarasevych_com_gebruiker","arguments":{}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"take_snapshot","arguments":{"slot":"prive"}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"click","arguments":{"uid":"12_k3x9a"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"fill","arguments":{"uid":"7_1h2p","value":"Привіт"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"navigate_page","arguments":{"url":"https://mail.tarasevych.com/"}}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"evaluate_script_beheer","arguments":{"function":"() => document.title"}}}
```
- `uid` — uit het veld `controls[].uid` van het antwoord op `take_snapshot`/`lezen_pagina_…` (formaat `<index>_<naamhash>`); `name` (zichtbaar opschrift) kan ook.
- Een kale naam (`take_snapshot`) gaat naar het technische slot als de technische kant leeft en is toegestaan, anders naar het privéslot; `"slot":"prive"`
  of het achtervoegsel `_gebruiker` / `_beheer` kiest expliciet. Na een weigering in een automatisch gekozen slot geeft het antwoord een tip hoe u het andere slot kiest.
- Argumenten van chrome-devtools-mcp die wij niet hebben (`format`, `fullPage`, `dblClick`, `pageSize`, navigatie-`timeout`…), worden genegeerd,
  en het antwoord vermeldt eerlijk «Ignored arguments …». `wait_for.timeout` (ms) → seconden (1–15). `select_page.pageIdx` = nummer in `list_pages`.

## 6. Weigeringen en wat te doen

| Code | Wat het betekent | Waar op te lossen |
|---|---|---|
| `EXTENSIE_VERGRENDELD` | slot is vergrendeld, termijn is verstreken of het beleid heeft het slot uitgeschakeld | «Browser en agenten» → slotkaart → «Toegang openen» |
| `EXTENSIE_CAP` | mogelijkheid zit niet in de ontgrendeling of in de matrix voor deze agent | matrix: rij (mogelijkheid) × kolom (agent) |
| `EXTENSIE_AGENT` | voor deze agent is in de matrix niets toegestaan | matrix: kolom van de agent of «alle» |
| `EXTENSIE_HOST` | adres valt buiten de pagina's van de ontgrendeling | slotkaart → «Pagina's» |
| `EXTENSIE_PROFIEL` | tabblad staat niet in de technische modus | activeer het technisch profiel in het tabblad |
| `EXTENSIE_RUIMTE` / `TECH_PROFILE_OFF` | hulpmiddel van het andere slot / technische kant niet actief | technisch profiel, dienst «AI-koppeling» |
| `EXTENSIE_SCRIPT` | scripts: geen technisch slot, extensie < 0.7.0 of zonder vinkje «Scripts» | matrix, pakket «diagnose» |
| `PERMISSION_OFF` | connectorrechten van deze agent bevatten het hulpmiddel niet | «Gekoppelde AI» → venster «Toestaan» |
| `NOT_SUPPORTED` | naam uit chrome-devtools-mcp die wij bewust niet ondersteunen | in de tekst staat de lijst van wat er wel is |
| `TERMIJN_VEREIST_UPDATE` | lange termijn voor extensie < 0.7.0 | werk de extensie bij |

Elke weigering bevat het exacte schermadres: `https://mcp.tarasevych.com/agents#browser`.

## 7. Compatibiliteit met chrome-devtools-mcp

Ondersteund (dezelfde grenzen als onze namen): `list_pages, select_page, new_page, close_page, navigate_page, navigate_page_history,
take_snapshot, take_screenshot, click, hover, fill, fill_form, press_key, wait_for, list_console_messages, get_console_message,
list_network_requests, get_network_request, evaluate_script, performance_start_trace, performance_stop_trace`.
Bewust niet ondersteund (met uitleg in het antwoord): `emulate, emulate_cpu, emulate_network, resize_page, upload_file, handle_dialog,
drag, performance_analyze_insight, take_memory_snapshot`.
Verschillen: de paginasnapshot is JSON (url, koppen, tekst, `controls[{uid, role, name}]`, site-acties), geen tekstuele a11y-boom;
`press_key` ondersteunt alleen navigatietoetsen (Enter, Escape, Tab, pijltjes, PageUp/Down, Home, End); `evaluate_script` werkt alleen in het technische slot
en alleen zonder element-`args`; «trace» is een prestatie-audit, geen trace-opname.
**Niet online geverifieerd:** de lijst met namen en parameters van chrome-devtools-mcp komt uit kennis van de openbare repository
`ChromeDevTools/chrome-devtools-mcp` (versies tot 2025). Nieuwe namen uit latere versies krijgen `UNKNOWN_TOOL`.

## 8. Zijpaneel van de extensie

Extensie 0.7.0 heeft in het zijpaneel de chat «AI voor u — naast dit tabblad»: het slot volgt het profiel van het actieve tabblad,
het verzoek gaat met het slottoken naar `POST /api/owner/agents/extensie/chat` (zonder cookie), het model ziet alleen de browserhulpmiddelen en handelt
alleen in deze browser, via dezelfde poorten (matrix — kolom «alle»). Vereist: een open slot, het recht «API-platform», een Anthropic-sleutel
in de kluis van de site, en voor het technische slot een actief technisch profiel.

## 9. Wat er nooit gebeurt
De extensie leest geen wachtwoorden, betaalvelden, cookies, opslag of inhoud van verzoeken; opent geen externe sites; een privé-agent ziet geen
technische tabbladen; een technische agent ziet geen privétabbladen; een agent van de ene gebruiker krijgt nooit het slot van een ander (test `extensie-matrix-20261022`).
