> 🌐 **Taal / Мова:** [Українська](ІНСТРУКЦІЯ-ЕТАПІВ-2-3.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Runbook: beveiliging fase 2 + 3 uitrollen (branch `beveiliging-fase-2-3`)

Doel: de release met `owner_id`, RLS (eerst in audit-modus), drie databaserollen, centrale auth-poort,
append-only audit, step-up en de fase-3-punten veilig uitrollen — **zonder iemand buiten te sluiten** en met
een terugweg na elke stap. Elke stap is los te doen; tussen stap 3, 4 en 5 mag gerust dagen zitten.

Alle opdrachten als `root` op de VM (`ssh … beheer@<VM-IP>`, daarna `sudo -i`). Geen waarden van
geheimen kopiëren of tonen. Tijden in de logs zijn UTC tenzij anders vermeld.

## 0. Vooraf

- [ ] Huidige release noteren: `deploy/installeer-app.sh lijst` (live: `20261003-210718`, commit `da8b0d0`).
- [ ] Verse back-up: `systemctl start mijn-ruimte-backup.service && journalctl -u mijn-ruimte-backup -n 20`
      (map `/srv/backups/mijn-ruimte/<datum>` met `KLAAR`). `installeren` maakt er zelf ook een.
- [ ] Postgres laat wachtwoord-login via TCP toe voor de nieuwe rollen. Controle:
      `grep -E '^host\s+all\s+all\s+127\.0\.0\.1/32\s+scram-sha-256' /etc/postgresql/17/main/pg_hba.conf`
      (Debian-standaard). Staat er iets anders (bv. alleen `mijnruimte`), voeg dan vóór stap 3 toe:
      `host mijnruimte mijnruimte_migrator,mijnruimte_app,mijnruimte_system 127.0.0.1/32 scram-sha-256`
      en `systemctl reload postgresql`.
- [ ] Niet aan zetten bij de uitrol: `AUTH_POORT_AFDWINGEN`, `ACCOUNT_DEFINITIEF_WISSEN`.
      **Let op:** vanaf de audit-fixes (`deploy/DRAAIBOEK-AUDITHERSTEL.nl.md`) is `AUDIT_IP_PEPPER` wél verplicht
      (`deploy/geheimen-aanvullen.sh`); die release bevat ook alles van fase 2 + 3.

## 1. Tarball naar de VM en controleren

Op de pc (of waar de tarball staat):
```
scp mijn-ruimte-beveiliging-fase-2-3-<stempel>-<sha>.tar.gz{,.sha256} beheer@<VM-IP>:/tmp/
```
Op de VM:
```
cd /tmp && sha256sum -c mijn-ruimte-beveiliging-fase-2-3-*.tar.gz.sha256      # moet "OK" geven
rm -rf /root/bron-fase-2-3 && mkdir -p /root/bron-fase-2-3
tar -xzf mijn-ruimte-beveiliging-fase-2-3-*.tar.gz -C /root/bron-fase-2-3
cat /root/bron-fase-2-3/mijn-ruimte/BRON-COMMIT                              # commit van de release
```

## 2. App installeren (migraties 0003–0006 lopen automatisch)

```
/root/bron-fase-2-3/mijn-ruimte/deploy/installeer-app.sh installeren /root/bron-fase-2-3/mijn-ruimte
```
Wat er gebeurt: bouwen → back-up → migraties → `current` omzetten → herstart → gezondheidscontrole; faalt die,
dan automatisch terug naar de vorige release.

- `0003` voegt `owner_id` toe als STORED-kolom: **herschrijft `app.records` één keer** (korte exclusieve lock;
  bij de huidige omvang seconden). Daarna `0004` (RLS-policy's, afdwingen = `uit`), `0005`, `0006` (audit) —
  allemaal alleen toevoegend en idempotent. De vorige release werkt met dit schema (de policy's laten elke rol
  behalve `mijnruimte_app` door).
- Na de start zet de server een oude eigenaar (rol `owner` met een ander adres dan `OWNER_EMAIL`) terug naar `member`.

Controle:
```
curl -s http://127.0.0.1:8080/__gezondheid
runuser -u postgres -- psql -d mijnruimte -Atc "select version from app.schema_migrations order by 1"   # t/m 0006
journalctl -u mijn-ruimte -n 50 | grep -E 'eigenaar|auth-poort|rls-audit|FOUT|Error'
```
Rooktest in de browser: aanmelden met Google op hub/id/admin, een werkruimte openen, mail en cloud openen.

Let op (verwacht gedrag, geen fout):
- Gevoelige acties geven **403 `STEP_UP_REQUIRED`** als de laatste Google-aanmelding ouder is dan 5 minuten
  (wachtwoord, ontkoppelen, telefoon, toegangsbeleid, kluis onthullen, beheerrollen/-beleid/-gebruikers,
  audit verwijderen, gegevensexport, account verwijderen). De UI heeft hier nog geen dialoog voor: **afmelden,
  opnieuw met Google aanmelden en de actie binnen 5 minuten herhalen** (of TOTP via `/api/owner/access/stap-op`).
  Noodschakelaar als dit iets dringends blokkeert: `STAP_OP_UIT_TOT=<ISO-tijdstip, hoogstens 24 uur vooruit>` in `geheimen.env`
  + `systemctl restart mijn-ruimte` (daarna weer verwijderen; na het tijdstip gaat de step-up vanzelf weer aan). Zolang hij aan staat,
  meldt de server dat (logboek, journaal, melding aan de eigenaar, «Захист»). De oude vorm `STAP_OP_UIT=1` heeft geen einde: niet meer gebruiken.
- API-platform/kluis alleen nog voor de eigenaar of accounts met recht `api-platform` (identiteitsbeheer).
- Bestaande gedeelde links blijven geldig tot ze verlopen; nieuwe links zijn eenmalig.

## 3. Databaserollen instellen

```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh instellen
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh status
```
`instellen` maakt `mijnruimte_migrator`, `mijnruimte_app`, `mijnruimte_system` (wachtwoorden op de VM gemaakt,
nooit getoond, bij herhalen hergebruikt), zet eigendom/rechten en `FORCE ROW LEVEL SECURITY`, schrijft
`DATABASE_URL_MIGRATIE/_APP/_SYSTEM` in `/etc/mijn-ruimte/geheimen.env`, herstart en controleert
(Host-hub + `/__gezondheid`). Mislukt de controle, dan haalt het script de variabelen weer weg en zet de oude
toestand terug.

Verwacht in `status`: `afdwingen=uit`, `force_rls=t`, drie rollen (`mijnruimte_system(bypassrls)`), alle drie
variabelen `gezet`.

Controle back-up met de systeemrol (pg_dump als oude rol werkt niet meer onder FORCE RLS):
`systemctl start mijn-ruimte-backup.service && journalctl -u mijn-ruimte-backup -n 20` → moet slagen.

> Na een herstel uit een back-up (`HERSTEL.md`) of een major-upgrade van Postgres: `instellen` opnieuw draaien.

## 4. RLS audit-modus verifiëren (enkele dagen normaal gebruik)

In audit-modus weigert RLS niets; de app noteert in `app.rls_audit` wat `aan` zou weigeren
(route, tabel, actie, aantal, eerste/laatste keer — geen id's of inhoud).

```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh status
journalctl -u mijn-ruimte --since "-24h" | grep -c '\[rls-audit\]'
```
- **Leeg** (geen rijen behalve eventueel `anoniem-2xx`, zie stap 6) na een paar dagen gebruik van alle diensten
  (hub, mail, cloud, foto's, agenda, delen, beheer, API) = klaar om af te dwingen.
- **Rijen aanwezig**: niet afdwingen. Noteer route + tabel + actie en laat de code aanpassen (meestal een bewuste
  systeemstap die `alsSysteem` nodig heeft, of een ontbrekende `owner_id`-bron).
- Optioneel opnieuw beginnen met tellen na een fix: `runuser -u postgres -- psql -d mijnruimte -c "truncate app.rls_audit"`.

## 5. RLS afdwingen (en terug)

```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh rls-aan     # direct actief, geen herstart
```
Direct daarna: aanmelden, werkruimte, mail, cloud, delen en admin controleren; `journalctl -u mijn-ruimte -f`
kijken naar `42501` / `row-level security` / 403/500-pieken.

Terug naar audit-modus (direct, geen herstart, geen gegevensverlies):
```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh rls-uit
```
De schakelaar staat in de database (`app.rls_instellingen`); de app zelf kan hem niet omzetten.

## 6. Auth-poort afdwingen

Standaard meldt de vangrail alleen: een anonieme 2xx-respons van een route die niet in `PUBLIEKE_ROUTES`
(`server/platform/auth-poort.ts`) staat, geeft een logregel `[auth-poort]` en een rij in `app.rls_audit`
met actie `anoniem-2xx`.

Verifiëren (enkele dagen):
```
journalctl -u mijn-ruimte --since "-72h" | grep '\[auth-poort\]' | sort | uniq -c | sort -rn | head
runuser -u postgres -- psql -d mijnruimte -c "select route, aantal, laatst from app.rls_audit where actie='anoniem-2xx' order by laatst desc"
```
- Elke gemelde route beoordelen: hoort hij echt publiek te zijn (bv. een nieuwe webhook) → aan `PUBLIEKE_ROUTES`
  laten toevoegen met reden; anders is het precies het lek dat de poort dichtzet.
- Leeg → afdwingen:
```
grep -q '^AUTH_POORT_AFDWINGEN=' /etc/mijn-ruimte/geheimen.env \
  && sed -i 's/^AUTH_POORT_AFDWINGEN=.*/AUTH_POORT_AFDWINGEN=1/' /etc/mijn-ruimte/geheimen.env \
  || echo 'AUTH_POORT_AFDWINGEN=1' >> /etc/mijn-ruimte/geheimen.env
systemctl restart mijn-ruimte && sleep 2 && curl -s http://127.0.0.1:8080/__gezondheid
```
  Daarna afgemeld de start-/aanmeldpagina's openen (moeten werken) en een paar API-routes zonder cookie
  proberen (moeten 401 geven).
- Terug: de regel verwijderen (`sed -i '/^AUTH_POORT_AFDWINGEN=/d' /etc/mijn-ruimte/geheimen.env`) en herstarten.

## 7. Later, bewust: definitief wissen na 30 dagen

Verwijderde accounts zijn 30 dagen te herstellen. De opruimjob (elk uur) meldt daarna alleen wat hij zou wissen:
`journalctl -u mijn-ruimte-cron@opruimen.service | grep 'verlopen accountverwijderingen'`. Pas na een geslaagde
hersteltest van een back-up `ACCOUNT_DEFINITIEF_WISSEN=1` in `geheimen.env` zetten (onomkeerbaar: inhoud,
identiteiten en bestanden van dat account weg, grafsteen zonder persoonsgegevens; audit blijft).

## 8. Terugdraaien

Volgorde is belangrijk: **eerst de rollen, dan de app.**

1. Alleen RLS-problemen: `db-rollen-instellen.sh rls-uit` (stap 5) — vaak genoeg.
2. Alleen auth-poort-problemen: `AUTH_POORT_AFDWINGEN` verwijderen + herstart (stap 6).
3. Rollen terug:
   ```
   /srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh terugdraaien
   ```
   Haalt de drie variabelen uit `geheimen.env`, geeft eigendom terug aan de oude rol, `NO FORCE`, afdwingen `uit`,
   herstart. De rollen blijven ongebruikt bestaan (onschadelijk; met de hand weg te halen als `postgres`
   na `REASSIGN/DROP OWNED`, niet nodig).
4. App terug naar de vorige release:
   ```
   /srv/mijn-ruimte/current/deploy/installeer-app.sh terugdraaien            # of: terugdraaien 20261003-210718
   ```
   Migraties worden **niet** teruggedraaid; dat is ook niet nodig: `0003–0006` zijn toevoegend, de oude
   release negeert `owner_id`, de policy's laten de oude rol door (`rls_vrij()`), en `app.audit` /
   `audit_kop` blijven gewoon staan. Nieuwe auditregels van de nieuwe release blijven bewaard.
5. Pas als het écht moet (schema terug): herstel uit de back-up van vóór stap 2 volgens `HERSTEL.md` — gegevens
   van na die back-up gaan dan verloren.

## 9. Na afloop

- `db-rollen-instellen.sh status`, `systemctl list-timers 'mijn-ruimte-*'`, een back-up laten lopen.
- In `BEVEILIGINGSNOTITIES.nl.md` §3c staat per punt wat er veranderde; bekende beperkingen in §4.
