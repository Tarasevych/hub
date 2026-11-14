// Fase 3: delen van werkruimtes beslist uitsluitend op de rol IN DIE werkruimte (niet op de globale rol),
// scopeBlockIds worden gevalideerd, e-mailadressen van leden zijn verborgen voor kijkers,
// en uitnodigingslinks zijn eenmalig (optioneel gebonden aan een e-mailadres) met vervaldatum.
import { db } from '../server/platform';
import type { WorkspaceRole } from './rbac';
import { ROL_TEKST, type WerkruimteRol } from '../shared/werkruimte-rechten';
import { STANDAARD_LINK_DAGEN, dagenTekst, linkDagen } from '../shared/deel-links';
// IDENTITEIT-014: de rollentabel leeft in shared/werkruimte-rechten.ts (ook voor de interface); hier alleen heruitgevoerd,
// zodat backend/index.ts en de rest ongewijzigd importeren. / Таблиця ролей — у shared/werkruimte-rechten.ts.
export { werkruimteRol, magDelen, magRolBeheren, hoogsteRol, rollenUitLidmaatschappen } from '../shared/werkruimte-rechten';

export const UITNODIGING_GELDIG_MS = 7 * 24 * 60 * 60 * 1000;
/** Oude e-mailuitnodigingen (zonder verlooptOp) blijven ruimer geldig: createdAt + 30 dagen. */
export const OUDE_UITNODIGING_GELDIG_MS = 30 * 24 * 60 * 60 * 1000;

/** Geeft de gevalideerde lijst blok-id's terug, of null als er een id bij zit dat niet tot de werkruimte hoort. */
export async function scopeBlokkenControleren(workspaceId: string, invoer: unknown): Promise<string[] | null> {
  if (invoer === undefined || invoer === null) return [];
  if (!Array.isArray(invoer)) return null;
  const ids = [...new Set(invoer.map((v) => String(v || '').trim()).filter(Boolean))];
  if (ids.length > 200) return null;
  if (!ids.length) return [];
  const rijen = await db.get<{ workspaceId?: string }>('workspace_blocks', ids);
  if (rijen.length !== ids.length) return null;
  return rijen.every((rij) => rij && rij.workspaceId === workspaceId) ? ids : null;
}

export function emailMaskeren(email: string): string {
  const [naam, domein] = String(email || '').split('@');
  if (!domein) return '';
  return `${(naam || '').slice(0, 1)}***@${domein}`;
}
/** Kijkers zien geen volledige e-mailadressen van andere leden. */
export function ledenVoorWeergave<T extends { email: string; userId: string }>(leden: T[], rol: WorkspaceRole | null, eigenId: string): T[] {
  if (rol !== 'viewer') return leden;
  return leden.map((lid) => (lid.userId === eigenId ? lid : { ...lid, email: emailMaskeren(lid.email) }));
}

// ------------------------------------------------------------------------------------------------ meldingen (IDENTITEIT-014)
// Wie in een gedeelde ruimte iets met de rechten van een ANDER doet, laat die ander het weten in het meldingencentrum:
//   workspace_role_changed  → het lid wiens rol is gewijzigd;
//   workspace_access_revoked → het lid dat is verwijderd;
//   workspace_invite_accepted → wie de koppeling of de e-mailuitnodiging maakte.
// Тексти пояснюють наслідок (що людина тепер може чи не може), а не лише назву дії. Формат «uk / nl», як решта сповіщень безпеки.
//   workspace_share          → wie per adres toegang kreeg (herstel: vroeger alleen Oekraïens);
//   workspace_share_link_created → de maker van een privélink (een geheim dat de rol geeft aan wie hem als eerste opent).
//   workspace_share_link_revoked → de maker van een privélink die (door hemzelf of een beheerder) is ingetrokken (IDENTITEIT-015);
//   workspace_member_left    → de eigenaar van de ruimte, wanneer een lid zelf vertrekt (IDENTITEIT-015).
export type DeelMeldingSoort = 'workspace_role_changed' | 'workspace_access_revoked' | 'workspace_invite_accepted' | 'workspace_share' | 'workspace_share_link_created' | 'workspace_share_link_revoked' | 'workspace_member_left';
// «/» мінімізуємо: центр сповіщень ділить текст за першим « / » (src/canoniek-meldingen.ts, taalDeel). / Geen « / » in namen.
const kort = (v: unknown, fallback: string) => { const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s\/\s/g, ' – ').trim().slice(0, 80); return s || fallback; };
/**
 * Хто діяв — для тексту сповіщення: ім'я, а без імені — адреса. Людині, яка після цієї дії лише переглядає простір або вже не має
 * доступу, повна адреса не показується (так само, як у списку учасників для «Перегляду»: ledenVoorWeergave).
 * Wie handelde: naam, anders het adres; gemaskeerd voor wie nu alleen kijkt of geen toegang meer heeft.
 */
export const deelWie = (u: { name?: unknown; email?: unknown } | null | undefined, maskeren = false): string => {
  const naam = String(u?.name || '').trim(); if (naam) return naam;
  const email = String(u?.email || ''); return maskeren ? emailMaskeren(email) : email;
};
const GEVOLG: Record<WerkruimteRol, readonly [string, string]> = {
  owner: ['Ви керуєте простором.', 'U beheert de werkruimte.'],
  admin: ['Тепер ви можете запрошувати інших, змінювати їхні ролі й відкликати доступ.', 'U kunt nu anderen uitnodigen, hun rol wijzigen en toegang intrekken.'],
  member: ['Ви можете переглядати й редагувати блоки простору, але не запрошувати інших.', 'U kunt de blokken van de werkruimte bekijken en bewerken, maar niemand uitnodigen.'],
  viewer: ['Тепер ви можете лише переглядати простір; редагування вимкнено.', 'U kunt de werkruimte nu alleen bekijken; bewerken staat uit.'],
};
/** Titel en tekst van een deelmelding (puur; getest in tests/eenheid/identiteit-014-rechten.test.ts). */
export function deelMeldingTekst(soort: DeelMeldingSoort, d: { wie: unknown; ruimte: unknown; oud?: WerkruimteRol | null; nieuw?: WerkruimteRol | null; dagen?: number; zelf?: boolean }): { titel: string; tekst: string } {
  const wie = kort(d.wie, 'Учасник / Een lid'); const ruimte = kort(d.ruimte, '—');
  /* IDENTITEIT-015: looptijd uit de keuze (1/7/30), standaard 7 — dezelfde tekst als vroeger voor oude aanroepers */
  const dagen = linkDagen(d.dagen ?? STANDAARD_LINK_DAGEN) || STANDAARD_LINK_DAGEN;
  if (soort === 'workspace_share_link_revoked') {
    return {
      titel: 'Посилання-запрошення відкликано / Uitnodigingslink ingetrokken',
      tekst: d.zelf
        ? `Ви відкликали посилання-запрошення до простору «${ruimte}». Хто відкриє його тепер, доступу не отримає; учасники, які вже приєдналися, залишаються. / U trok een uitnodigingslink voor de werkruimte «${ruimte}» in. Wie hem nu opent, krijgt geen toegang; leden die al aansloten, blijven.`
        : `${wie} відкликає ваше посилання-запрошення до простору «${ruimte}». Хто відкриє його тепер, доступу не отримає; за потреби створіть нове. / «${wie}» trekt uw uitnodigingslink voor de werkruimte «${ruimte}» in. Wie hem nu opent, krijgt geen toegang; maak zo nodig een nieuwe.`,
    };
  }
  if (soort === 'workspace_member_left') {
    return {
      titel: 'Учасник вийшов зі спільного простору / Een lid heeft een gedeelde werkruimte verlaten',
      tekst: `${wie} виходить із простору «${ruimte}» і більше його не бачить. Блоки, які додала ця людина, тепер ваші. Щоб повернути доступ, потрібне нове запрошення. / «${wie}» verlaat de werkruimte «${ruimte}» en ziet haar niet meer. Blokken die deze persoon toevoegde, zijn nu van u. Om de toegang terug te geven is een nieuwe uitnodiging nodig.`,
    };
  }
  if (soort === 'workspace_role_changed') {
    const nieuw = d.nieuw || 'viewer'; const oud = d.oud || null; const [nUk, nNl] = ROL_TEKST[nieuw];
    const vanUk = oud ? `«${ROL_TEKST[oud][0]}» → «${nUk}»` : `«${nUk}»`; const vanNl = oud ? `«${ROL_TEKST[oud][1]}» → «${nNl}»` : `«${nNl}»`;
    return {
      titel: 'Вашу роль у спільному просторі змінено / Uw rol in een gedeelde werkruimte is gewijzigd',
      tekst: `${wie} змінює вашу роль у просторі «${ruimte}»: ${vanUk}. ${GEVOLG[nieuw][0]} Якщо це несподівано — зверніться до власника простору. / «${wie}» wijzigt uw rol in de werkruimte «${ruimte}»: ${vanNl}. ${GEVOLG[nieuw][1]} Komt dit onverwacht, neem dan contact op met de eigenaar van de werkruimte.`,
    };
  }
  if (soort === 'workspace_access_revoked') {
    return {
      titel: 'Ваш доступ до спільного простору відкликано / Uw toegang tot een gedeelde werkruimte is ingetrokken',
      tekst: `${wie} відкликає ваш доступ до простору «${ruimte}». Простір зникне з вашого списку; блоки, які ви додали, лишаються у власника. / «${wie}» trekt uw toegang tot de werkruimte «${ruimte}» in. De werkruimte verdwijnt uit uw lijst; blokken die u toevoegde, blijven bij de eigenaar.`,
    };
  }
  if (soort === 'workspace_share') {
    const rol = d.nieuw || 'viewer';
    return {
      titel: 'Новий спільний простір / Nieuwe gedeelde werkruimte',
      tekst: `${wie} надав вам доступ до простору «${ruimte}» з роллю «${ROL_TEKST[rol][0]}». ${GEVOLG[rol][0]} Якщо ви не чекали запрошення — просто не відкривайте простір або вийдіть із нього. / «${wie}» gaf u toegang tot de werkruimte «${ruimte}» als «${ROL_TEKST[rol][1]}». ${GEVOLG[rol][1]} Verwachtte u geen uitnodiging, open de werkruimte dan niet of verlaat haar.`,
    };
  }
  if (soort === 'workspace_share_link_created') {
    const rol = d.nieuw || 'viewer';
    return {
      titel: 'Створено посилання-запрошення / Uitnodigingslink gemaakt',
      tekst: `Ви створили одноразове посилання до простору «${ruimte}» з роллю «${ROL_TEKST[rol][0]}». Хто першим відкриє його й увійде, отримає цю роль; посилання діє ${dagenTekst('uk', dagen)}. Якщо це були не ви — захистіть вхід і перевірте учасників простору. / U maakte een eenmalige link naar de werkruimte «${ruimte}» met de rol «${ROL_TEKST[rol][1]}». Wie hem als eerste opent en zich aanmeldt, krijgt die rol; de link is ${dagenTekst('nl', dagen)} geldig. Was u dit niet, beveilig dan uw aanmelding en controleer de leden van de werkruimte.`,
    };
  }
  const rol = d.nieuw || 'viewer';
  return {
    titel: 'Запрошення до простору прийнято / Uitnodiging voor een werkruimte aangenomen',
    tekst: `${wie} тепер має доступ до простору «${ruimte}» з роллю «${ROL_TEKST[rol][0]}». Змінити роль чи відкликати доступ можна в списку учасників простору. / «${wie}» heeft nu toegang tot de werkruimte «${ruimte}» als «${ROL_TEKST[rol][1]}». Rol wijzigen of toegang intrekken kan in de ledenlijst van de werkruimte.`,
  };
}

export function uitnodigingVerlopen(lid: { verlooptOp?: number; createdAt?: number }, nu = Date.now()): boolean {
  const grens = Number(lid.verlooptOp || 0) || Number(lid.createdAt || 0) + OUDE_UITNODIGING_GELDIG_MS;
  return grens <= nu;
}

