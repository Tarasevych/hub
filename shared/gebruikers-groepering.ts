// Виявлення та групування схожих облікових записів за іменем (з урахуванням транслітерації),
// адресою електронної пошти та спільним ідентифікатором особи.
// Detectie en groepering van vergelijkbare gebruikersaccounts op naam, e-mail en persoons-id.

export type GroepTaal = 'uk' | 'nl';

export type GroepReden =
  | 'person_ref'
  | 'email_alias'
  | 'email_local'
  | 'name_match'
  | 'name_email_match';

export type GroepSterkte = 'hoog' | 'midden';

export type GroepeerbareGebruiker = {
  id: string;
  email: string;
  name: string;
  personRef?: string;
  owner?: boolean;
  workspaceRole?: string;
  role?: string;
  adminRole?: string;
  status?: string;
};

export type GebruikersGroep<T extends GroepeerbareGebruiker = GroepeerbareGebruiker> = {
  id: string;
  titel: string;
  leden: T[];
  redenen: GroepReden[];
  sterkte: GroepSterkte;
  heeftEigenaar: boolean;
  rollen: string[];
};

export type GroeperingResultaat<T extends GroepeerbareGebruiker = GroepeerbareGebruiker> = {
  groepen: Array<GebruikersGroep<T>>;
  groepPerUserId: Map<string, GebruikersGroep<T>>;
  redenenPerUserId: Map<string, GroepReden[]>;
};

const ONZIN_NAMEN = new Set([
  'user',
  'admin',
  'ovner',
  'owner',
  'huest',
  'guest',
  'test',
  'akount',
  'acount',
  'koristuvach',
  'korystuvach',
  'koristuvac',
  'korystuvac',
  'administrator',
  'vlasnik',
  'vlasnyk',
  'hist',
  'anonim',
  'anonymous',
  'gebruiker',
  'beheerder',
  'eigenaar',
  'gast',
]);

const ONZIN_LOKAAL = new Set([
  'admin',
  'owner',
  'info',
  'hello',
  'support',
  'contact',
  'office',
  'beheer',
  'noreply',
  'test',
  'user',
  'mail',
  'team',
]);

const CYR_MAP: Record<string, string> = {
  щ: 'shch',
  ш: 'sh',
  ч: 'ch',
  ж: 'zh',
  х: 'kh',
  ц: 'ts',
  ю: 'iu',
  я: 'ia',
  є: 'ie',
  ї: 'i',
  й: 'i',
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  з: 'z',
  и: 'y',
  і: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  ь: '',
};

/** Перетворює кирилицю та діакритичні знаки до уніфікованої латиниці для порівняння імен. */
export function translitNaarLatijn(tekst: string): string {
  const schoon = String(tekst || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’ʼ`"]/g, '');

  let uit = '';
  for (const ch of schoon) {
    if (ch in CYR_MAP) {
      uit += CYR_MAP[ch];
    } else {
      uit += ch;
    }
  }

  return uit
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ph/g, 'f')
    .replace(/w/g, 'v')
    .replace(/qu/g, 'kv')
    .replace(/x/g, 'ks')
    .replace(/ck/g, 'k')
    .replace(/gh/g, 'h')
    .replace(/g/g, 'h')
    .replace(/j/g, 'i')
    .replace(/y/g, 'i')
    .replace(/([a-z])\1+/g, '$1');
}

function naamDelen(naam: string): { vol: string[]; initialen: string[] } {
  const lat = translitNaarLatijn(naam);
  const ruwe = lat
    .split(/[^a-z]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const vol: string[] = [];
  const initialen: string[] = [];
  for (const woord of ruwe) {
    if (woord.length === 1) {
      initialen.push(woord);
    } else if (!ONZIN_NAMEN.has(woord)) {
      vol.push(woord);
    }
  }
  return {
    vol: [...new Set(vol)].sort(),
    initialen: [...new Set(initialen)].sort(),
  };
}

/** Повертає нормалізований ключ імені (уніфіковані та впорядковані слова). */
export function normaliseerNaamSleutel(naam: string): string {
  const { vol } = naamDelen(naam);
  return vol.join(' ');
}

function emailDelen(email: string): {
  canoniek: string;
  lokaalBasis: string;
  lokaalGesorteerd: string;
  lokaalWoorden: string[];
} {
  const raw = String(email || '').trim().toLowerCase();
  const at = raw.indexOf('@');
  if (at <= 0 || at === raw.length - 1) {
    return { canoniek: '', lokaalBasis: '', lokaalGesorteerd: '', lokaalWoorden: [] };
  }
  const localRaw = raw.slice(0, at);
  let domain = raw.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  const plus = localRaw.indexOf('+');
  const localZonderPlus = plus >= 0 ? localRaw.slice(0, plus) : localRaw;
  const canonLocal = domain === 'gmail.com' ? localZonderPlus.replace(/\./g, '') : localZonderPlus;
  const canoniek = canonLocal ? `${canonLocal}@${domain}` : '';

  const lokaalLat = translitNaarLatijn(localZonderPlus);
  const basis = lokaalLat.replace(/[^a-z0-9]/g, '');
  const lokaalBasis = basis.length >= 5 && !ONZIN_LOKAAL.has(basis) ? basis : '';
  const woorden = [...new Set(lokaalLat.split(/[^a-z]+/).filter((w) => w.length >= 2 && !ONZIN_LOKAAL.has(w)))].sort();
  const lokaalGesorteerd = woorden.length >= 2 && woorden.join('').length >= 5 ? woorden.join('|') : '';

  return {
    canoniek,
    lokaalBasis,
    lokaalGesorteerd,
    lokaalWoorden: lokaalLat.split(/[^a-z]+/).filter(Boolean),
  };
}

function namenVerenigbaar(a: { vol: string[]; initialen: string[] }, b: { vol: string[]; initialen: string[] }): boolean {
  if (!a.vol.length || !b.vol.length) return true;
  if (a.vol.length >= 2 && b.vol.length >= 2) {
    const setB = new Set(b.vol);
    if (a.vol.length !== b.vol.length) return false;
    return a.vol.every((w) => setB.has(w));
  }
  const [klein, groot] = a.vol.length <= b.vol.length ? [a, b] : [b, a];
  const setGroot = new Set(groot.vol);
  if (!klein.vol.every((w) => setGroot.has(w))) return false;
  if (klein.initialen.length > 0 && groot.vol.length > klein.vol.length) {
    const rest = groot.vol.filter((w) => !klein.vol.includes(w));
    return klein.initialen.every((ini) => rest.some((w) => w.startsWith(ini)));
  }
  return true;
}

function pastNaamBijEmail(
  persoon: { vol: string[]; initialen: string[] },
  anderePersoon: { vol: string[]; initialen: string[] },
  mailInfo: { lokaalBasis: string; lokaalWoorden: string[] },
): boolean {
  if (persoon.vol.length < 2 || !mailInfo.lokaalBasis) return false;
  if (!namenVerenigbaar(persoon, anderePersoon)) return false;

  const heleNaam = persoon.vol.join('');
  if (heleNaam.length >= 5 && mailInfo.lokaalBasis.includes(heleNaam)) return true;

  const volleTreffers = persoon.vol.filter((w) => w.length >= 3 && mailInfo.lokaalBasis.includes(w));
  if (volleTreffers.length >= 2) return true;

  if (volleTreffers.length === 1 && volleTreffers[0].length >= 5) {
    const anderWoord = persoon.vol.find((w) => w !== volleTreffers[0]);
    if (anderWoord && mailInfo.lokaalWoorden.some((lw) => lw === anderWoord[0] || lw.startsWith(anderWoord[0] + volleTreffers[0]))) {
      return true;
    }
    if (anderWoord && (mailInfo.lokaalBasis === `${anderWoord[0]}${volleTreffers[0]}` || mailInfo.lokaalBasis === `${volleTreffers[0]}${anderWoord[0]}`)) {
      return true;
    }
  }
  return false;
}

const REDEN_PRIORITEIT: Record<GroepReden, number> = {
  person_ref: 0,
  email_alias: 1,
  email_local: 2,
  name_match: 3,
  name_email_match: 4,
};

/** Пояснення підстави групування обраною мовою сайту. */
export function redenLabel(lang: GroepTaal, reden: GroepReden): string {
  const nl = lang === 'nl';
  switch (reden) {
    case 'person_ref':
      return nl ? 'Zelfde persoons-id' : 'Однаковий ідентифікатор особи';
    case 'email_alias':
      return nl ? 'Zelfde e-mailbasis' : 'Спільна поштова адреса';
    case 'email_local':
      return nl ? 'Zelfde e-mailnaam op ander domein' : 'Спільне ім’я пошти на іншому домені';
    case 'name_match':
      return nl ? 'Zelfde of vergelijkbare naam' : 'Однакове чи співзвучне ім’я';
    case 'name_email_match':
      return nl ? 'Naam komt overeen met e-mailadres' : 'Ім’я збігається з адресою пошти';
  }
}

/** Знаходить і групує схожі облікові записи з переліку користувачів. */
export function groepeerVergelijkbareGebruikers<T extends GroepeerbareGebruiker>(
  gebruikers: readonly T[],
): GroeperingResultaat<T> {
  const n = gebruikers.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const verbind = (a: number, b: number, reden: GroepReden, kanten: Set<GroepReden>[]) => {
    kanten[a].add(reden);
    kanten[b].add(reden);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const kanten: Set<GroepReden>[] = Array.from({ length: n }, () => new Set<GroepReden>());
  const refs = gebruikers.map((u) => {
    const r = String(u.personRef || '').trim().toUpperCase();
    return r && r !== '—' ? r : '';
  });
  const mails = gebruikers.map((u) => emailDelen(u.email));
  const namen = gebruikers.map((u) => naamDelen(u.name));

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (refs[i] && refs[i] === refs[j]) {
        verbind(i, j, 'person_ref', kanten);
      }
      if (mails[i].canoniek && mails[i].canoniek === mails[j].canoniek) {
        verbind(i, j, 'email_alias', kanten);
      }
      if (
        (mails[i].lokaalBasis && mails[i].lokaalBasis === mails[j].lokaalBasis) ||
        (mails[i].lokaalGesorteerd && mails[i].lokaalGesorteerd === mails[j].lokaalGesorteerd)
      ) {
        verbind(i, j, 'email_local', kanten);
      }

      const sleutelI = namen[i].vol.join(' ');
      const sleutelJ = namen[j].vol.join(' ');
      if (sleutelI && sleutelI === sleutelJ) {
        if (namen[i].vol.length >= 2 || (namen[i].vol.length === 1 && sleutelI.length >= 4)) {
          verbind(i, j, 'name_match', kanten);
        }
      }

      if (pastNaamBijEmail(namen[i], namen[j], mails[j]) || pastNaamBijEmail(namen[j], namen[i], mails[i])) {
        verbind(i, j, 'name_email_match', kanten);
      }
    }
  }

  const perWortel = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const w = find(i);
    const lijst = perWortel.get(w);
    if (lijst) lijst.push(i);
    else perWortel.set(w, [i]);
  }

  const groepen: Array<GebruikersGroep<T>> = [];
  const groepPerUserId = new Map<string, GebruikersGroep<T>>();
  const redenenPerUserId = new Map<string, GroepReden[]>();

  let nr = 1;
  for (const indices of perWortel.values()) {
    if (indices.length < 2) continue;

    const redenSet = new Set<GroepReden>();
    for (const idx of indices) {
      const eigen = [...kanten[idx]].sort((a, b) => REDEN_PRIORITEIT[a] - REDEN_PRIORITEIT[b]);
      if (eigen.length) redenenPerUserId.set(gebruikers[idx].id, eigen);
      for (const r of eigen) redenSet.add(r);
    }
    const redenen = [...redenSet].sort((a, b) => REDEN_PRIORITEIT[a] - REDEN_PRIORITEIT[b]);

    const leden = indices
      .map((idx) => gebruikers[idx])
      .sort((a, b) => Number(Boolean(b.owner)) - Number(Boolean(a.owner)) || String(a.name || a.email).localeCompare(String(b.name || b.email)));

    const heeftEigenaar = leden.some((u) => Boolean(u.owner));
    const eigenaarLid = leden.find((u) => u.owner);
    const langsteNaam = [...leden]
      .filter((u) => String(u.name || '').trim())
      .sort((a, b) => String(b.name || '').trim().length - String(a.name || '').trim().length)[0];
    const titel = String(eigenaarLid?.name || langsteNaam?.name || leden[0].email || '').trim();

    const rollen = [...new Set(leden.map((u) => (u.owner ? 'owner' : String(u.workspaceRole || u.role || 'member'))))];
    const heeftAlleenEnkelNaam =
      redenen.length === 1 &&
      redenen[0] === 'name_match' &&
      leden.every((u) => naamDelen(u.name).vol.length <= 1);
    const sterkte: GroepSterkte = heeftAlleenEnkelNaam ? 'midden' : 'hoog';

    const groep: GebruikersGroep<T> = {
      id: `groep-${nr}`,
      titel,
      leden,
      redenen,
      sterkte,
      heeftEigenaar,
      rollen,
    };
    nr += 1;
    groepen.push(groep);
    for (const lid of leden) {
      groepPerUserId.set(lid.id, groep);
    }
  }

  return { groepen, groepPerUserId, redenenPerUserId };
}
