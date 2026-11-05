> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./RUNBOOK-AUDIT-FIXES.uk.md) · **🇳🇱 Nederlands** ([origineel](./RUNBOOK-AUDIT-FIXES.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Runbook: audit-fixes uitrollen (branch `beveiliging-fixes-audit`)

Doel: de release met de audit-fixes (A1–A10, zie `SECURITY-NOTES.md` §3d) uitrollen met na elke stap een
terugweg. Deze release bevat ook alles van fase 2 + 3 (`RUNBOOK-FASE-2-3.md`); is die nog niet live, dan lopen
bij stap 3 ook de migraties 0003–0006 mee en geldt daarnaast §0 (pg_hba) en §4–9 van dat runbook.

Alle opdrachten als `root` op de VM (`ssh … beheer@<VM-IP>`, daarna `sudo -i`). Nooit waarden van
geheimen tonen of kopiëren (`cat geheimen.env` niet doen; de scripts tonen alleen namen en lengtes).
Tijden in de logs zijn UTC tenzij anders vermeld.

Volgorde in het kort: **back-up → tarball controleren → `AUDIT_IP_PEPPER` → app installeren (migraties 0007 +
0008) → rollen instellen → env splitsen (`migratie.env`) → auditbeheerder → geheimenarchief vernieuwen →
verificatie.** Terugdraaien: §9 (eerst `env-samenvoegen`!).

## 0. Vooraf

- [ ] Huidige release en schemastand noteren:
  ```
  /srv/mijn-ruimte/current/deploy/installeer-app.sh lijst
  runuser -u postgres -- psql -d mijnruimte -Atc "select version from app.schema_migrations order by 1"
  ```
- [ ] Verse back-up (`installeren` maakt er zelf ook een):
  ```
  systemctl start mijn-ruimte-backup.service && journalctl -u mijn-ruimte-backup -n 20 --no-pager
  ls -l /srv/backups/mijn-ruimte/ | tail -3        # nieuwste map met KLAAR
  ```
- [ ] Alleen als de databaserollen nog niet bestaan (fase 2 nog niet uitgerold): pg_hba-controle uit
      `RUNBOOK-FASE-2-3.md` §0.
- [ ] Google (aanbevolen, kan ook later): Google Auth Platform → project → **Settings** → **Advanced Settings** →
      **Session age claims** aanzetten. Zonder dit stuurt Google geen `auth_time` en telt opnieuw aanmelden bij
      Google **niet** als step-up (faalt dicht); step-up met een TOTP-code werkt dan wel. Google levert
      `auth_time` mogelijk alleen voor een gepubliceerde/geverifieerde OAuth-app.
- [ ] Niet aanzetten bij de uitrol: `AUTH_POORT_AFDWINGEN`, `ACCOUNT_DEFINITIEF_WISSEN`, RLS (`rls-aan`).

## 1. Tarball naar de VM en controleren

Op de pc (of waar de tarball staat):
```
scp mijn-ruimte-beveiliging-fixes-audit-<stempel>-<sha>.tar.gz{,.sha256} beheer@<VM-IP>:/tmp/
```
Op de VM:
```
cd /tmp && sha256sum -c mijn-ruimte-beveiliging-fixes-audit-*.tar.gz.sha256        # moet "OK" geven
rm -rf /root/bron-audit-fixes && mkdir -p /root/bron-audit-fixes
tar -xzf mijn-ruimte-beveiliging-fixes-audit-*.tar.gz -C /root/bron-audit-fixes
cat /root/bron-audit-fixes/mijn-ruimte/BRON-COMMIT                                  # commit van de release
```

## 2. `AUDIT_IP_PEPPER` aanmaken (verplicht)

```
/root/bron-audit-fixes/mijn-ruimte/deploy/geheimen-aanvullen.sh
grep -c '^AUDIT_IP_PEPPER=' /etc/mijn-ruimte/geheimen.env                           # 1
```
Het script voegt alleen ontbrekende sleutels toe (bestaande blijven ongewijzigd) en toont geen waarden. De nieuwe
app start niet zonder deze pepper (≥ 32 tekens) en `installeren` weigert vooraf. Oude `ip_hash`-waarden in
`app.audit` zijn daarna niet meer te koppelen aan nieuwe (geen gegevensverlies). De huidige release negeert de
variabele.

## 3. App installeren (migraties 0007 en 0008 lopen automatisch)

```
/root/bron-audit-fixes/mijn-ruimte/deploy/installeer-app.sh installeren /root/bron-audit-fixes/mijn-ruimte
```
Wat er gebeurt: bouwen (`npm ci`, build) → back-up → migraties (met `geheimen.env` + `migratie.env` als die
bestaat) → `rechten.sql` → `current` omzetten → herstart → gezondheidscontrole; faalt die, dan automatisch terug
naar de vorige release.

- `0007` wijzigt de gegenereerde kolom `owner_id` (`SET EXPRESSION`): **herschrijft `app.records` één keer**
  (korte exclusieve lock; bij de huidige omvang seconden). Verder policy's, `users`-trigger, hulpfuncties.
- `0008`: `app.audit_beheerders`, nieuwe `audit_toevoegen`/`audit_verwijderen`. Alleen toevoegend.
- `rechten.sql` haalt INSERT op `app.audit`/`audit_kop`/`audit_beheerders` weg bij app- en systeemrol en maakt de
  unieke index `records_een_eigenaar`. Staat er in de uitvoer een **WARNING over meerdere eigenaren**, dan wordt de
  index overgeslagen; de server zet de verouderde eigenaar bij het starten terug naar `member` en stap 4
  (`instellen`) maakt de index alsnog.

Controle:
```
curl -s http://127.0.0.1:8080/__gezondheid                                          # {"ok":true,"db":true}
runuser -u postgres -- psql -d mijnruimte -Atc "select version from app.schema_migrations order by 1"   # t/m 0008
journalctl -u mijn-ruimte -n 50 --no-pager | grep -E 'eigenaar|DATABASE_URL|AUDIT_IP_PEPPER|FOUT|Error'
```
Een waarschuwing `DATABASE_URL… staat in de app-omgeving` is hier nog verwacht (weg na stap 5).

## 4. Databaserollen instellen (idempotent)

```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh instellen
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh status
```
Ook nodig als de rollen al bestonden: Postgres krijgt nu alleen een SCRAM-verifier (geen wachtwoord in SQL of
log); bestaande wachtwoorden worden hergebruikt. Mislukt de gezondheidscontrole, dan zet het script de oude
toestand terug. Verwacht: `afdwingen=uit`, `force_rls=t`, drie rollen, `DATABASE_URL_APP/_SYSTEM=geheimen.env`.

## 5. Omgeving splitsen: `migratie.env`

```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh env-splitsen
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh status
ls -l /etc/mijn-ruimte/migratie.env                                                 # -rw------- root root
```
`DATABASE_URL` (oude eigenaarsrol) en `DATABASE_URL_MIGRATIE` gaan naar `/etc/mijn-ruimte/migratie.env`; de
diensten `mijn-ruimte`, `-cron@`, `-backup` laden alleen `geheimen.env`. Herstart + gezondheidscontrole; mislukt
die, dan zet het script beide bestanden automatisch terug. Nogmaals uitvoeren doet niets.
Verwacht in `status`: `DATABASE_URL=migratie.env`, `DATABASE_URL_MIGRATIE=migratie.env`,
`DATABASE_URL_APP=geheimen.env`, `DATABASE_URL_SYSTEM=geheimen.env`, `AUDIT_IP_PEPPER=geheimen.env`,
`audit_insert_app=false audit_insert_system=false`.

## 6. Auditbeheerder aanwijzen

Alleen accounts in `app.audit_beheerders` mogen oude auditregels verwijderen (daarnaast: super/security-admin,
step-up, reden, ouder dan 24 u). De app kan deze lijst niet wijzigen.
```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh audit-beheerder <OWNER_EMAIL>
# intrekken: … audit-beheerder-weg <e-mail|user-id>
```

## 7. Geheimenarchief vernieuwen (offline back-up)

`migratie.env` hoort nu bij de geheimen. Maak een nieuw versleuteld archief (alleen de publieke sleutel staat op
de VM) en zet het op de vaste plek op de pc (`R:\mijn-ruimte-reservekopie\geheimen\geheimen-<stempel>\`, zie
`HERSTEL.md` §3):
```
st=$(date +%Y%m%d-%H%M%S); cd /
tar -cpf - etc/mijn-ruimte/geheimen.env etc/mijn-ruimte/migratie.env etc/cloudflared/*.json \
  | age -R /etc/mijn-ruimte/backup-ontvanger.age.pub > /root/geheimen-$st.tar.age
sha256sum /root/geheimen-$st.tar.age > /root/geheimen-$st.tar.age.sha256
```
Ophalen met `scp` naar de pc, daar controleren (`Get-FileHash`), daarna op de VM `shred -u /root/geheimen-$st.*`.

## 8. Verificatie

```
D=/srv/mijn-ruimte/current/deploy
$D/db-rollen-instellen.sh status
curl -s http://127.0.0.1:8080/__gezondheid
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/        # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/api//owner/session/bootstrap   # 404
systemctl cat mijn-ruimte | grep EnvironmentFile                                     # alleen geheimen.env
journalctl -u mijn-ruimte -n 50 --no-pager | grep -E 'DATABASE_URL|AUDIT_IP_PEPPER|FOUT|Error'   # leeg
runuser -u postgres -- psql -d mijnruimte -Atc "select has_table_privilege('mijnruimte_system','app.audit','INSERT'), has_table_privilege('mijnruimte_app','app.audit','INSERT')"   # f|f
runuser -u postgres -- psql -d mijnruimte -Atc "select indexname from pg_indexes where indexname='records_een_eigenaar'"   # 1 regel
runuser -u postgres -- psql -d mijnruimte -Atc "select count(*) from app.records where tbl='users' and data->>'role'='owner'"   # 1
systemctl start mijn-ruimte-backup.service && journalctl -u mijn-ruimte-backup -n 20 --no-pager   # moet slagen
systemctl list-timers 'mijn-ruimte-*'
```
Rooktest in de browser (hub, id, admin, mail, cloud):
1. Aanmelden met Google; een werkruimte, mail en cloud openen.
2. Een gevoelige actie (bv. gegevensexport, kluis onthullen of een gebruiker blokkeren in admin): er verschijnt een vraag om een
   **TOTP-code**. Code invoeren → de actie gaat door. Leeg laten → doorsturen naar Google (opnieuw wachtwoord);
   daarna de actie zelf nog eens uitvoeren. Werkt de Google-route niet (geen `auth_time`, zie §0), gebruik TOTP.
3. Een deellink maken en weer intrekken; als kijker geen inhoud kunnen wijzigen.
4. Een paar dagen later: `db-rollen-instellen.sh status` → `app.rls_audit` hoort leeg te blijven (dan pas
   eventueel `rls-aan`, zie `RUNBOOK-FASE-2-3.md` §4–5).

## 9. Terugdraaien

Volgorde is belangrijk: **eerst de omgeving samenvoegen, dan de app.** De vorige release start niet zonder
`DATABASE_URL` in `geheimen.env`.

1. Omgeving terug naar één bestand:
   ```
   /srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh env-samenvoegen
   ```
2. App terug naar de vorige release:
   ```
   /srv/mijn-ruimte/current/deploy/installeer-app.sh terugdraaien            # of: terugdraaien <release uit 'lijst'>
   ```
   Migraties worden niet teruggedraaid en dat hoeft niet: 0007/0008 zijn compatibel (de vorige release roept
   `app.audit_toevoegen` met dezelfde handtekening aan; de policy's laten de oude rol door; de `users`-trigger
   geldt alleen voor `mijnruimte_app`). Auditregels verwijderen kan dan alleen nog voor accounts in
   `app.audit_beheerders`.
3. Alleen als de vorige release van vóór fase 2 is (bv. `auth-fase-1`) of als de rollen het probleem zijn:
   `db-rollen-instellen.sh terugdraaien` (dit voegt zelf ook eerst samen) — vóór stap 2 uitvoeren.
4. `AUDIT_IP_PEPPER` mag blijven staan (de oude release negeert hem).
5. Pas als het écht moet (schema terug): herstel uit de back-up van vóór stap 3 volgens `HERSTEL.md` (gegevens
   van na die back-up gaan verloren; daarna `instellen` opnieuw).

## 10. Noodgevallen

- **Step-up blokkeert iets dringends:** `echo 'STAP_OP_UIT=1' >> /etc/mijn-ruimte/geheimen.env && systemctl restart mijn-ruimte`;
  daarna de regel weer weghalen (`sed -i '/^STAP_OP_UIT=/d' /etc/mijn-ruimte/geheimen.env`) en herstarten.
- **Google-step-up werkt niet omdat Google geen `auth_time` stuurt** en TOTP is niet ingesteld: tijdelijk
  `STAP_OP_GOOGLE_ZONDER_AUTH_TIME=1` (zelfde manier; zwakker: telt een expliciete `prompt=login`-ronde binnen
  5 minuten). Liever: Session age claims aanzetten (§0).
- **Eigenaar per ongeluk geblokkeerd** (het eigenaarsadres is niet meer uitgezonderd):
  ```
  runuser -u postgres -- psql -d mijnruimte -c "update app.records set data = jsonb_set(data, '{status}', '\"approved\"') where tbl = 'users' and lower(data->>'email') = lower('<OWNER_EMAIL>')"
  ```
  Daarna opnieuw aanmelden (bestaande sessies zijn bij het blokkeren al ingetrokken).
- **Tweede eigenaar-account nodig** (bv. ander Google-adres): `OWNER_EMAIL` aanpassen en herstarten; de server
  zet het oude account terug naar `member`. Twee accounts met rol `owner` tegelijk kan niet (unieke index).

## 11. Vervolgrelease: juridische pagina's + A11 (geen migratie, geen omgevingswijziging)

Bovenop de live audit-fixes-release. Geen nieuwe migratie, geen nieuwe variabelen; alleen de app.
```
cd /tmp && sha256sum -c mijn-ruimte-beveiliging-fixes-audit-*.tar.gz.sha256
rm -rf /root/bron-audit-fixes && mkdir -p /root/bron-audit-fixes
tar -xzf mijn-ruimte-beveiliging-fixes-audit-<stempel>-<sha>.tar.gz -C /root/bron-audit-fixes
cat /root/bron-audit-fixes/mijn-ruimte/BRON-COMMIT
/root/bron-audit-fixes/mijn-ruimte/deploy/installeer-app.sh installeren /root/bron-audit-fixes/mijn-ruimte
```
Verificatie:
```
for h in hub id; do for p in /privacy /terms; do
  curl -s -o /dev/null -w "$h$p %{http_code} %{content_type}\n" -H "Host: $h.tarasevych.com" http://127.0.0.1:8080$p; done; done   # 200 text/html
curl -s -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/privacy | grep -c -E 'Limited Use|Privacybeleid'      # ≥ 2
curl -s -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/privacy | grep -ci noindex                            # 0
curl -s -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/ | grep -c noindex                                    # 1 (SPA blijft noindex)
curl -s -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/robots.txt                                            # Allow /privacy$, /terms$, Disallow /
curl -sI -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/privacy | grep -i content-security-policy
curl -s -o /dev/null -w '%{http_code}\n' https://hub.tarasevych.com/privacy                                       # 200 via Cloudflare
```
A11 (RLS-telling voor serverrijen): oude tellingen eerst wissen, daarna mail en API-platform een paar keer gebruiken:
```
runuser -u postgres -- psql -d mijnruimte -c "delete from app.rls_audit where tbl in ('provider_endpoint_verifications_v1','oauth_pkce_v1','mail_endpoint_verifications_v1')"
# … na gebruik (mail openen, Google-account in mail koppelen/starten, API-platform openen):
runuser -u postgres -- psql -d mijnruimte -c "select route, tbl, actie, aantal, laatst from app.rls_audit order by laatst desc limit 30"
```
Verwacht: geen nieuwe rijen voor deze drie tabellen. In de Google Cloud Console (OAuth-merk) als URL's invullen:
`https://hub.tarasevych.com/privacy` en `https://hub.tarasevych.com/terms`.
Terug: `installeer-app.sh terugdraaien` (geen omgevings- of schemastap nodig).
