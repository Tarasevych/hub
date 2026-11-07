> 🌐 **Taal / Мова:** [Українська](АРХІТЕКТУРА-ПРИВАТНОСТІ-ХМАРИ-М7.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](INDEX.nl.md)

# Volledige Cloud-integratie — M7: Cryptografische bescherming van de gegevenseigenaar

**28-10-2026 · DEVELOPMENT ALLEEN · installatieverbod · basis M6**

## 1. Onschendbare vertrouwensgrens

**Het gebruikersaccount kan op zichzelf geen wiskundige geheime sleutel zijn.** Naam, e-mailadres, cookies, OAuth en zelfs een reguliere passkey-handtekening bevestigen uitsluitend de identiteit; een versleutelingssleutel mag nooit worden afgeleid uit een openbaar account-ID of een inlogwachtwoord.

Privégegevens worden beschermd met een willekeurige 256-bits sleutel die **op het apparaat** wordt gegenereerd. De eigenaar heeft hier toegang toe via een 256-bits recovery-secret of, indien de uitgebreide WebAuthn PRF-functie beschikbaar is, via een geverifieerde PRF-respons van de bijbehorende passkey. De server ontvangt uitsluitend een versleutelde kopie van de hoofdsleutel. Het account koppelt deze sleutel aan een specifieke combinatie van identity + space; **authenticatie en ontsleuteling zijn twee afzonderlijke factoren**.

**Belangrijke beperking:** een webserver die de JS-pagina beheert, kan deze in theorie vervangen, het recovery-secret of de PRF-uitvoer onderscheppen tijdens het ontgrendelen, of een ontsleuteld bestand uit het paginageheugen lezen. Zolang er geen onafhankelijk verifieerbare/ondertekende client, transparantie van codelevering, XSS-isolatie en een onafhankelijke audit zijn, **kan bescherming tegen een kwaadwillende beheerder met rechten om servercode te wijzigen niet worden gegarandeerd**. Zelfs ondertekening van JS beschermt zonder afzonderlijk vertrouwensanker niet tegen het vervangen van de HTML-pagina die naar een ander script verwijst.

## 2. TWEE modi, beide met een eerlijke toelichting

| | Privé versleutelde kluis (Vault) | Systeemeigen bestanden van Google/Dropbox/Microsoft enz. |
|---|---|---|
| Waar wordt versleuteld | In de vertrouwde client **vóór** het uploaden | Bij de aanbieder volgens diens eigen regels |
| Wat ziet onze server bij COPY | Cijfertekst, grootte, technische ID's, verzoekfrequentie | Kan onversleutelde bytes en het OAuth-token verwerken tijdens een BFF-bewerking |
| Ziet de aanbieder het origineel | Nee, uitsluitend cijfertekst (mits geüpload naar de E2EE-kluis) | Ja, als het een systeemeigen bronbestand betreft |
| Voorvertoning | Alleen na ontgrendeling in de client | Systeemeigen voorvertoning mogelijk; afhankelijk van de API |
| Achtergrondoverdrachten zonder gebruiker | Alleen kopiëren van cijfertekst (mits vooraf toegestaan) | Vereisen gedelegeerde toegang; mag geen zero-knowledge worden genoemd |
| Delen | Vereist een apart client-side E2EE-deelschema en ontvangerssleutels | Volgens de regels van de betreffende aanbieder |
| Sleutelherstel | Uitsluitend via door de gebruiker beheerde recovery of ondersteunde passkey-PRF | Niet van toepassing op systeemeigen providerinhoud |

## 3. Geïmplementeerde M7-modules

- `src/cloud/versleutelde-kluis-m7.mjs` — WebCrypto AES-256-GCM, willekeurige DEK per bestand, AAD met `accountId + space + fileId + revision`, willekeurige IV voor elke bewerking, versleuteling van naam/MIME in metadata, SHA-256 van versleutelde delen; offline herstel via HKDF SHA-256 vanuit een willekeurig 256-bits recovery-secret; voorwaardelijke binding aan een vooraf **geverifieerde** WebAuthn PRF-respons; gestreamde versleuteling van begrensde blokken (<=4 MiB).
- `backend/cloud-m7-blinde-overdracht.mjs` — draagt uitsluitend `ufw-vault-v1` versleutelde blokken over volgens stage -> verify -> publish, controleert eigenaar/ruimte en herhaalt de autorisatie bij elk blok; **MOVE en verwijdering van het origineel worden geweigerd**; onbepaalde status -> review, nooit automatisch verwijderen. `target` implementeert een abstract staging-contract; echte provideradapters moeten nog worden aangesloten.
- `backend/cloud-m7-privacy-beleid.mjs` — eerlijke classificatie van `encrypted_vault` en `provider_native`, weigering voor systeemeigen bewerkingen op de E2EE-kluis die nog niet worden ondersteund; voor systeemeigen bestanden is een afzonderlijke user-presence lease vereist.
- `backend/cloud-m7-sessie-lease.mjs` — begrenzing op owner/space/connection, bewerking, omvang, geldigheidsduur en gebruikersaanwezigheid (gebruiker presence). **Vervangt geen echte serverautorisatie en beschermt niet tegen een beheerder met toegang tot de runtime.**
- `scripts/cloud-volledige-uitgave-poort.mjs` — 12 nieuwe kritieke blokkades toegevoegd. Retourneert `BLOCKED` zolang bewijs ontbreekt.

**Geen van deze modules is gekoppeld aan de publieke API of de productie-OAuth-opslag.** Dit is een bewuste keuze: integratie in M4/M6 moet vóór activering een audit van ACL's en vertrouwensgrenzen doorlopen.

## 4. Waarom de eerdere M4-opslag van OAuth-tokens geen zero-knowledge is

`backend/cloud-verbinding-m4-pg.ts` voert AES-256-GCM uit met de sleutel `CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1` op de server. Dit beschermt geheimen in de database tegen veel aanvallen, **maar een systeembeheerder met toegang tot deze sleutel of de runtime kan ze ontsleutelen**. Zolang tokens volgens dit schema worden bewaard, moet dit daarom `server-managed delegated access` worden genoemd en niet `zero-knowledge`.

Toekomstig strenger model voor privéverbindingen: client-side verzegeling van het refresh-token onder de gebruikerssleutel; de server bewaart alleen cijfertekst; de gebruiker ontgrendelt en delegeert een smalle, kortlopende toestemming voor één bewerking aan de BFF. Sommige aanbieders en browsers ondersteunen geen directe CORS en achtergrond-OAuth. De server **kan tijdens een live BFF-verzoek het access-token en de inhoud ontvangen**; daarom mag een strikte E2EE-garantie uitsluitend worden afgegeven voor de privékluis (Vault) en niet voor willekeurige systeemeigen bestanden.

## 5. Betrouwbaarheid, snelheid en compatibiliteit

- Een bestand wordt opgedeeld in geauthenticeerde blokken tot 4 MiB; indien nodig versleutelt de client deze één voor één zonder het volledige bestand in het werkgeheugen (RAM) te laden.
- De UI mag direct na drag-and-drop een geslaagde **plaatsing in de wachtrij** tonen, maar mag pas "Overgedragen" weergeven na daadwerkelijke serververificatie én clientverificatie.
- Server-side ondoorzichtige COPY draagt versleutelde blokken over zonder ze te ontsleutelen; adapters moeten gecontroleerde parallellie, providerspecifieke snelheidslimieten (rate limits), backpressure, een persistente PostgreSQL-wachtrij, idempotentie, revisiecontrole en intrekking van toegang tijdens de overdracht ondersteunen.
- API-providers (Drive/Graph/Dropbox/WebDAV/S3/Box/pCloud/GitHub) *unificeren* hun rechtenmodel niet voor 100%; de capability-engine meldt welke acties daadwerkelijk zijn toegestaan en verzint geen functies.
- Als een gebruiker een E2EE-bestand in de webeditor van een aanbieder wil bewerken, moet hij de onversleutelde tekst (plaintext) tijdelijk voor de aanbieder openstellen of het bestand bewerken in onze vertrouwde client; dit verschil mag niet worden verhuld.

## 6. Verplichte beveiliging release gate

1. Onafhankelijke crypto-audit (uniciteit van GCM-nonces, HKDF-contextscheiding, AAD/replay, volledige correctheid van de verwerking van stroomblokken).
2. Versiebeheerschema en *anti-rollback*: de server mag een bestand niet ongemerkt vervangen door een oude maar geldige cijfertekst. Vereist client-side controle van monotone versies of bevestigde logboeken.
3. Onafhankelijke clientintegriteit: ondertekende applicatie/extensie of verifieerbaar codeleveringsmechanisme; CSP, Trusted Types, origin-isolatie en onafhankelijke audit van XSS/supply-chain.
4. WebAuthn PRF: live verificatie van specifieke browsers en apparaten; server-side WebAuthn-assertieverificatie, UV=verplicht, binding van rpId/origin/challenge/credential. Bij afwezigheid van PRF: offline herstel.
5. E2EE-delen: geverifieerde sleutels van de ontvanger, intrekking van toegang met herversleuteling voor toekomstige toegang; beloof geen intrekking van reeds ontsleutelde kopieën.
6. Beheer van recovery en sleutelrotatie, hersteltest op een ander apparaat. Zonder een door de gebruiker beheerde sleutel is gegevensherstel door beheerders **onmogelijk**.
7. Systeemeigen providertokenflow: permanente opslag van uitsluitend vastgelegde cijfertekst waar dat is toegezegd; verbod op tokens in logboeken/URL's; afzonderlijke BFF-tests tijdens gedelegeerde sessies.
8. Controles op echte accounts van elke ondersteunde aanbieder, echte grote overdrachten met foutscenario's, throttling, herhaling en rate limits.
9. PostgreSQL-staging, E2E op Chrome/Firefox/Safari, multi-tab/multi-device, browserviewer voor versleutelde documenten en WCAG-toegankelijkheid.
10. Node.js 24+ typecheck/build/E2E en 100% controle van M1–M6 na integratie. Geen enkele `DEPLOY` voordat aan alle punten is voldaan.

## 7. Gereedheidsvoorwaarde

M7 is een **werkend cryptografisch prototype en een fail-closed servergrens**, geen gevalideerd high-security productie-cryptosysteem. Zelfs geslaagde unittests vervangen geen onafhankelijke audit. De huidige vrijgavepoort blijft op `BLOCKED`.
