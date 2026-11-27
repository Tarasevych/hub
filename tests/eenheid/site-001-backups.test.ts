// SITE-001 (пункт 23): постійний сторож запасних копій бази даних і посібників відновлення.
// Перевіряє:
// 1) deploy/backup-maken.sh: розбір DATABASE_URL_SYSTEM у PG*-змінні без витоку в командний рядок, потокове шифрування age -R,
//    виключення таємниць із systeem.tar.gz, контрольні суми SHA256SUMS, атомарне перейменування .bezig-* і мітка KLAAR;
// 2) deploy/mijn-ruimte-backup.timer та .service: щоденний розклад 03:30 Persistent=true, ізоляція systemd і RestrictSUIDSGID=no (B-009);
// 3) deploy/installeer-app.sh: обов'язкова резервна копія бази перед міграціями (зупинка встановлення при збої backup);
// 4) сумісність аварійного відновлення з PostgreSQL 18 (deploy/archief-herstellen.sh, archief-maken.sh, ВІДНОВЛЕННЯ.uk.md, HERSTEL.nl.md — жодного застарілого postgresql-17, що відхиляє формат PG 18 1.16);
// 5) коректний синтаксис bash -n усіх сценаріїв резервного копіювання і відсутність заборонених літер.
// nl: permanente bewakingstest voor database-reservekopieën en herstelscripts op PostgreSQL 18 (punt 23).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-backups');

  const backupSh = readFileSync('deploy/backup-maken.sh', 'utf8');
  const timer = readFileSync('deploy/mijn-ruimte-backup.timer', 'utf8');
  const service = readFileSync('deploy/mijn-ruimte-backup.service', 'utf8');
  const installeer = readFileSync('deploy/installeer-app.sh', 'utf8');
  const herstellen = readFileSync('deploy/archief-herstellen.sh', 'utf8');
  const archiefMaken = readFileSync('deploy/archief-maken.sh', 'utf8');
  const docUk = readFileSync('deploy/ВІДНОВЛЕННЯ.uk.md', 'utf8');
  const docNl = readFileSync('deploy/HERSTEL.nl.md', 'utf8');

  check(
    'backup-maken.sh: потокове шифрування age, PG*-змінні (unset DUMP_URL), SHA256SUMS, атомарний перехід .bezig-* → KLAAR і виключення секретів',
    backupSh.includes('unset DUMP_URL') &&
      backupSh.includes('pg_dump --format=custom --compress=6 --no-owner --no-privileges | schrijf') &&
      backupSh.includes('age --encrypt --recipients-file "$ONTVANGER"') &&
      backupSh.includes("--exclude='*geheimen*'") &&
      backupSh.includes('> SHA256SUMS') &&
      backupSh.includes('date --iso-8601=seconds > "$doel/KLAAR"'),
  );

  check(
    'mijn-ruimte-backup.timer + .service: щоденний запуск 03:30 Persistent=true, ProtectSystem=strict, NoNewPrivileges=yes та RestrictSUIDSGID=no (B-009)',
    timer.includes('OnCalendar=*-*-* 03:30:00') &&
      timer.includes('Persistent=true') &&
      service.includes('NoNewPrivileges=yes') &&
      service.includes('ProtectSystem=strict') &&
      service.includes('RestrictSUIDSGID=no'),
  );

  check(
    'installeer-app.sh: виконує резервну копію перед міграціями (mijn-ruimte-backup.service) і зупиняє встановлення при подвійному збої',
    installeer.includes('voortgang backup 75') &&
      installeer.includes('systemctl start mijn-ruimte-backup.service') &&
      installeer.includes('fout "back-up mislukt (2 pogingen):'),
  );

  check(
    'archief-herstellen.sh, archief-maken.sh та посібники ВІДНОВЛЕННЯ.uk.md / HERSTEL.nl.md налаштовані на PostgreSQL 18 (без несумісного postgresql-17)',
    herstellen.includes('postgresql-18 postgresql-client-18') &&
      !herstellen.includes('postgresql-17') &&
      archiefMaken.includes('PostgreSQL 18') &&
      !archiefMaken.includes('PostgreSQL 17') &&
      docUk.includes('PostgreSQL 18') &&
      !docUk.includes('PostgreSQL 17') &&
      docNl.includes('PostgreSQL 18') &&
      !docNl.includes('PostgreSQL 17'),
  );

  const scripts = ['deploy/backup-maken.sh', 'deploy/archief-herstellen.sh', 'deploy/archief-maken.sh'];
  check(
    'синтаксис bash -n чистий у всіх сценаріях резервного копіювання та відновлення',
    scripts.every((s) => spawnSync('bash', ['-n', s], { encoding: 'utf8' }).status === 0),
  );

  const verboden = new RegExp('[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]');
  const zelf = readFileSync('tests/eenheid/site-001-backups.test.ts', 'utf8');
  check(
    'відсутність заборонених літер у змінених файлах відновлення і тесті',
    ![backupSh, herstellen, archiefMaken, docUk, docNl, zelf].some((t) => verboden.test(t)),
  );

  return einde();
}
