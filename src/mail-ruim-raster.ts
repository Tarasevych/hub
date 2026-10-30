// Режим «Громіздкий» (аудит пошти 18.10.2026, тред «Задача: привести до ладу режим Громіздкий»).
//
// Проблема: у «Громіздкому» блоки рядка (аватар, відправник, тема, уривок, вкладення, дата) стояли у flex-потоці з переносом.
// Кожен рядок рахував ширини сам → тема й уривок починалися в різних місцях, довге ім'я забирало майже всю ширину.
//
// Рішення: ОДНАКОВА сітка для всіх рядків. Ширини колонок не залежать від вмісту рядка (фіксована ширина аватара, відправник —
// частка ширини списку з межами, текст — fr, дата — фіксована), тому в усіх рядках колонки збігаються. Порядок блоків з
// редактора щільності (blockOrder) зберігається: колонки йдуть у тому ж порядку. Тема й уривок, що стоять поруч у режимі
// «один під одним», ділять одну колонку (тема — рядок 1, уривок — рядок 2), щоб обидва починалися в одній точці.
// Вкладення — окремий рядок під текстом, від першої текстової колонки до кінця. Нічого не прибирається.
//
// Тільки змінні CSS; саму сітку вмикає src/mail-rij-2026-10-18.css (лише bulky і лише ширше 720 px — мобільна сітка своя).
import type { MailDensityProfile, MailRowBlock } from './mail-dichtheid-profiel';

type Kolom = 'avatar' | 'sender' | 'subject' | 'snippet' | 'copy' | 'date';
const SPOOR: Record<Kolom, string> = {
  avatar: 'var(--mail-bulky-avatar,40px)',
  sender: 'minmax(0,var(--mail-bulky-sender,22%))',
  subject: 'minmax(0,2fr)',
  snippet: 'minmax(0,3fr)',
  copy: 'minmax(0,1fr)',
  date: 'var(--mail-bulky-date,6.75rem)',
};

export type BulkyRaster = { kolommen: Kolom[]; vars: Record<string, string> };

const zichtbaar = (p: MailDensityProfile, b: MailRowBlock) =>
  b === 'avatar' ? p.showAvatar
    : b === 'sender' ? p.showSenderName || p.showSenderEmail
      : b === 'subject' ? p.showSubject
        : b === 'snippet' ? p.showSnippet
          : b === 'date' ? p.dateMode !== 'hidden'
            : false;

/** Сітка «Громіздкого» з профілю: колонки за порядком блоків і змінні CSS для кожного блоку. */
export function mailBulkyRaster(p: MailDensityProfile): BulkyRaster {
  const volgorde = p.blockOrder.filter((b) => b !== 'attachments' && zichtbaar(p, b));
  const kolommen: Kolom[] = [];
  const kolom: Partial<Record<MailRowBlock, number>> = {};
  const rij: Partial<Record<MailRowBlock, number>> = {};
  for (let i = 0; i < volgorde.length; i++) {
    const b = volgorde[i], n = volgorde[i + 1];
    const paar = (b === 'subject' && n === 'snippet') || (b === 'snippet' && n === 'subject');
    if (paar && p.subjectSnippetLayout === 'stacked') {
      kolommen.push('copy');
      kolom[b] = kolom[n] = kolommen.length;
      rij[b] = 1; rij[n] = 2;
      i++;
      continue;
    }
    kolommen.push(b as Kolom);
    kolom[b] = kolommen.length;
    rij[b] = 1;
  }
  const regels = kolommen.includes('copy') ? 2 : 1;
  const tekst = kolommen.map((k, i) => (k === 'copy' || k === 'subject' || k === 'snippet' ? i + 1 : 0)).filter(Boolean);
  const naSender = (kolom.sender ?? kolom.avatar ?? 0) + 1;
  const bijlageVan = tekst.length ? tekst[0] : Math.min(naSender, Math.max(1, kolommen.length));
  const bijlageTot = tekst.length ? tekst[tekst.length - 1] + 1 : kolommen.length + 1;
  const vars: Record<string, string> = {
    '--mail-bulky-cols': kolommen.length ? kolommen.map((k) => SPOOR[k]).join(' ') : 'minmax(0,1fr)',
    '--mail-bulky-span': `1 / span ${regels}`,
    '--mail-bulky-r-attach': String(regels + 1),
    '--mail-bulky-c-attach': `${bijlageVan} / ${Math.max(bijlageVan + 1, bijlageTot)}`,
  };
  for (const b of ['avatar', 'sender', 'subject', 'snippet', 'date'] as const) {
    if (kolom[b]) vars[`--mail-bulky-c-${b}`] = String(kolom[b]);
  }
  vars['--mail-bulky-r-subject'] = String(rij.subject ?? 1);
  vars['--mail-bulky-r-snippet'] = String(rij.snippet ?? 1);
  return { kolommen, vars };
}

/** Мінімальні розміри тексту в «Громіздкому» (px): помітно більші за «Звичайний» (14 / 14.5 / 13 / 13). */
export const BULKY_MIN_TEKST = { sender: 15.5, email: 12.5, subject: 16, snippet: 14.5, date: 13.5 } as const;
/** Аватар у «Громіздкому»: помітний, але не домінує. */
export const BULKY_AVATAR = { min: 36, max: 44 } as const;
