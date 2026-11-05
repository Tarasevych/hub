> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./CLOUD-M9-IMPLEMENTATION-20261028.uk.md) · **🇳🇱 Nederlands** ([origineel](./CLOUD-M9-IMPLEMENTATION-20261028.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Cloud Full Integration M9 — S3/DAV-mappen en veilige grote uploads

**Basis:** geïsoleerde kopie `cloud-full-integration-m8`, afgeleid van `mijn-ruimte-20261027-212158`. Dit is DEVELOPMENT ONLY, geen productie. De huidige status van de productieserver na dit archief is niet geverifieerd.

## Wat er daadwerkelijk is gebouwd

1. `backend/cloud-m9-xml.ts` — smalle structurele XML-parser voor metadata met limieten van 1 MiB, 3000 knooppunten, 24 diepteniveaus en een verbod op DTD/ENTITY/CDATA/PI. Leest DAV-multistatus en S3-XML op basis van QName en namespace-URI. **Vervangt geen volledige XML-parser voor algemeen gebruik**; vereist onafhankelijke beoordeling en provider-fixtures.
2. `backend/cloud-m9-directory.ts` — `NextcloudDirectory`, `S3CompatibleDirectory('s3')`, `S3CompatibleDirectory('backblaze-b2')`; server-side geverifieerde account-resolvers; WebDAV PROPFIND Depth:1; AWS S3 ListObjectsV2 met SigV4 en B2 S3-compatibele subset; `encoding-type=url`; geïsoleerde S3-cursors; groottelimieten, DNS/SSRF-beveiliging voor Nextcloud via extern beleid en beveiligde netwerkconfiguratie; `redirect:'error'`.
3. `backend/cloud-m9-directory-composition.ts` — fabriek voor 11 maptypen met expliciete injectie van tokens, regio's, accounts en egress-beleid. Deze fabriek voegt niet automatisch routes toe in productie. Voor werking zijn de actieve M8-coördinator + M4/M6-autorisatie en geverifieerde accounts vereist.
4. `backend/cloud-m9-upload-sessies.ts` — gecontroleerde overdracht van één blok tegelijk voor Microsoft Graph en Dropbox; exacte `Content-Range` / Dropbox-offset; verzoeken sturen geen Graph-toegangstoken mee naar de upload-sessie-URL; status `uploaded_not_verified` na de laatste commit in plaats van "geslaagd"; een onbepaald netwerkresultaat vereist verificatie.
5. `backend/cloud-m9-checkpoints-pg.ts` en `migrations/0122_cloud_m9_upload_checkpoints.sql` — server-side versleutelde sessie-capabilities, atomaire CAS op vorige offset + owner/space/account/provider/source revision/lease, en quarantaine van verlopen leases. Voer de migratie niet uit in productie zonder controle van rollen en schemacompatibiliteit.
6. Instabiliteit in tests van M7 en M8 verholpen: het wijzigen van het laatste teken van een base64url-reeks veranderde niet altijd de gedecodeerde byte. Het wijzigen van het eerste teken zorgt voor een deterministische corruptiecontrole.
7. Script `scripts/cloud-volledige-uitgave-poort.mjs` uitgebreid van 73 naar **84** live-criteria; de status blijft `BLOCKED`.

## Resultaat

- `node --test tests/eenheid/cloud-*test.mjs`: **228 PASS / 0 FAIL**, modulaire mock-tests.
- `node scripts/kaart-controle.mjs --stil`: exit 0 (historische waarschuwingen blijven behouden).
- `node scripts/cloud-volledige-uitgave-poort.mjs`: exit 2 `BLOCKED`, 84/84 onbevestigd.
- TypeScript-transpilatie van nieuwe modules slaagt; **dit is geen volledige tsc-typecheck**.
- Geen live OAuth, echte API-E2E, volledige Node24-build, staging-migratie of beveiligingsaudit.

## Beveiligingsgrenzen en openstaande taken

- De server kan technisch toegang hebben tot OAuth-tokens en systeemeigen onversleutelde bestanden. AES-256-GCM-versleuteling van de upload-capability in PostgreSQL biedt geen garantie tegen een beheerder met controle over de server. Voor de privékluis (Vault) zijn een onafhankelijke client, controle van codeherkomst en een afzonderlijk sleutelherstelmodel vereist.
- De volgende fase moet na een onderbreking een gecontroleerde hercontrole van `nextExpectedRanges` en de Dropbox-offset bij de providers toevoegen, in plaats van blindelings te hervatten. Verlopen leases worden momenteel alleen in quarantaine geplaatst.
- De achtergrondworker die uploadsessies aanmaakt, grote bestanden gestreamd inleest en M9 koppelt aan M4-accountgrants, is **nog niet aangesloten**. M9 vormt een gefaseerde kern, geen live bestandsengine.
- De eindstatus `uploaded_not_verified` moet een onafhankelijke read-back/checksum doorlopen en mag pas daarna overgaan naar een geverifieerde kopie; het origineel mag niet worden verwijderd zonder voorwaardelijke verwijdering met bevestigde revisie.
- De systeemeigen `NextcloudTransport.stat` uit het oude M3 gebruikt reguliere expressies voor het parsen van WebDAV-XML. Deze moet vóór een live-uitgave worden overgezet naar de geverifieerde XML-module. **De aanwezigheid van M9-directory lost deze technische schuld niet automatisch op.**
- Willekeurige Nextcloud-servers vereisen een echte DNS-rebind/SSRF-firewall op netwerkniveau, niet enkel een URL-controle.
- S3-pseudomappen, B2-beperkingen op applicatiesleutels, SharePoint-tenantrechten en GitHub-repositories moeten provider-bewust blijven: beloof geen niet-beschikbare functionaliteit.
- Volledige mapping van ACL's, versies, delen, grote bestanden voor alle 11 typen, synchronisatie tussen tabbladen/browsers en UI-E2E zijn nog niet afgerond. Activeer de publieke Cloud niet.

## Publieke protocolbronnen

- AWS S3 ListObjectsV2: https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
- Backblaze B2 S3-subset: https://www.backblaze.com/apidocs/introduction-to-the-s3-compatible-api
- Nextcloud WebDAV: https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/index.html
- Microsoft Graph uploadsessies: https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0
- Dropbox session append: https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload-session-append-v-2
- Dropbox session finish: https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload-session-finish

## Aanbevolen vervolg (M10)

1. Voer op een afzonderlijke staging-omgeving met Node.js 24+ en een test-PostgreSQL alle migraties M1–M9, de rollback en een volledige `npm ci; npm run typecheck:server; npm run build` uit.
2. Vervang de M3 DAV regex-stat door de structurele parser en voer provider-fixtures uit.
3. Koppel het PostgreSQL-sessiecheckpoint aan een trust-scoped worker, versleutelde sessie-bootstrap, throttling/rate limits, retry-beleid en herstelreconciliatie.
4. Autoriseer twee verschillende accounts van dezelfde provider en voer echte COPY-bewerkingen uit met read-back SHA-256 en intrekking tijdens overdracht; bevestig move-conflicten.
5. Verifieer de uitwisseling tussen browsers, tabbladen en apparaten, de rol van het technische profiel en nul datalekken tussen gebruikers.
6. Externe cryptografische en beveiligingsaudit. Sta pas daarna een kandidaat voor één volledige Cloud-release toe.
