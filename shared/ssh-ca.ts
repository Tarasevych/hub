// SSH-certificaat voor één uur (architectuur 14.10.2026, etap C deel 2).
// De site vraagt alleen; root (deploy/ssh-ca/mijn-ruimte-ssh-ca.sh) tekent. Een vlag verbergt de knop en geeft nooit dit recht:
// dat blijft terminal.servers in een actief technisch profiel, plus de schakelaar ssh-ca die standaard uit staat.
import type { HelpLagen } from './tech-rollen';

export const SSH_CA_MINUTEN = 60;
export const SSH_CA_PRINCIPAL = 'beheer';
/** Alleen de knop. Afwezig of uit = verborgen. */
export const SSH_CA_VLAG = 'ssh-certificaat';
/** OpenSSH ed25519-publieke sleutel: 51 byte wireformaat → 68 tekens base64, zonder commentaar of opties. */
export const PUBLIEK_RE = /^ssh-ed25519 [A-Za-z0-9+/]{68}$/;
const IDENT_RE = /^[A-Za-z0-9._@-]{1,64}$/;

export function publiekeSleutel(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return PUBLIEK_RE.test(s) ? s : null;
}

/** Commentaar op het certificaat (Key ID), nooit de principal. Vreemde tekens vallen weg. */
export function identiteitVan(email: string | undefined): string {
  const lokaal = String(email || '').split('@')[0] || '';
  const s = lokaal.replace(/[^A-Za-z0-9._@-]/g, '').slice(0, 64);
  return IDENT_RE.test(s) ? s : 'mijn-ruimte';
}

export function schakelaarAan(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { 'ssh-ca'?: unknown })['ssh-ca'] === true;
}

export const HELP_SSH: HelpLagen = {
  wat: ['Сертифікат SSH на одну годину для входу на цей сервер як beheer. Приватний ключ лишається на вашому комп’ютері: сюди вставляєте лише публічний рядок ssh-ed25519.',
    'Een SSH-certificaat van één uur om op deze server in te loggen als beheer. De privésleutel blijft op uw computer: hier plakt u alleen de publieke regel ssh-ed25519.'],
  gevolg: ['Сертифікат згасає сам через годину. Постійного ключа на сервері не з’являється. Лише термінал (permit-pty), без пересилання портів, агента чи екрана.',
    'Het certificaat dooft zelf na een uur. Er komt geen vaste sleutel op de server. Alleen een terminal (permit-pty), zonder poort-, agent- of schermdoorsturing.'],
  risico: ['Поки сертифікат дійсний, ним можна відкрити сеанс SSH як beheer. Підпис відбувається лише якщо root увімкнув перемикач ssh-ca і довірив CA в sshd вручну.',
    'Zolang het certificaat geldig is, opent het een SSH-sessie als beheer. Ondertekenen gebeurt alleen als root de schakelaar ssh-ca aanzette en de CA met de hand in sshd vertrouwde.'],
  dev: ['Root-служба mijn-ruimte-ssh-ca. Прапорець ssh-certificaat лише ховає кнопку. Право — terminal.servers в активному технічному профілі та підтвердження входу. Скрипт не змінює sshd_config і не вмикає перемикач. Принципал лише beheer, -O clear -O permit-pty, -V -5m:+60m. Запит не обирає принципал, термін чи опції.',
    'Root-dienst mijn-ruimte-ssh-ca. De vlag ssh-certificaat verbergt alleen de knop. Het recht is terminal.servers in een actief technisch profiel plus bevestiging van de aanmelding. Het script wijzigt sshd_config niet en zet de schakelaar niet aan. Principal alleen beheer, -O clear -O permit-pty, -V -5m:+60m. Het verzoek kiest geen principal, duur of opties.'],
};
