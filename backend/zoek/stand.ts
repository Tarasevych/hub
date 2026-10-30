// ZOEKEN — DE ECHTE STAND PER BRON (Z2). Geen vlag die iemand «aan» zet: de stand wordt elke keer afgeleid uit
//   (1) de koppeling zelf (live uit de bestaande integratie: Google-momentopname, GitHub /user, IMAP-tabel, de lade-poort),
//   (2) de wachtrij (app.zoek_wachtrij: wachtend/bezig, laatste fout),
//   (3) app.zoek_bron_stand (laatste poging/succes/fout, voortgang, versie, aantal — geteld door de kern) en
//   (4) de sleutelkluis (0092): een dichte sleutel = «очікує входу», geen fout.
// De namen zijn die van shared/zoek-model.ts (BRON_STANDEN): niet_gekoppeld | indexeert | gedeeltelijk | fout | klaar.
import type { ZoekBron, BronStandNaam, ZoekBronStand } from '../../shared/zoek-model';
import type { WachtTelling } from './wachtrij';

export type KoppelFeit = { verbonden: boolean; fout?: string; opmerking?: string };
export type StandRij = { stand: BronStandNaam | ''; voortgang: number; aantal: number; laatsteOk: number; laatstePoging: number; fout: string; versie: string; wachtReden: string; volledigOp: number };
export const WACHT_SLEUTEL = 'SLEUTELKLUIS_GESLOTEN';
export const WACHT_LADE = 'LADE_NIET_ACTIEF';

/** Wat het scherm toont: de kernstand + wat Z2 erbij weet (koppeling, wachtrij, uitleg uk/nl). */
export type BronStandVolledig = ZoekBronStand & {
  verbonden: boolean; wachtend: number; bezig: number; opmerking?: string;
  /** Waarom er (nog) niet geïndexeerd wordt: SLEUTELKLUIS_GESLOTEN (na inloggen gaat het verder), LADE_NIET_ACTIEF, … */
  wachtReden: string;
  uitleg: { uk: string; nl: string };
};

const UITLEG: Record<BronStandNaam, { uk: string; nl: string }> = {
  niet_gekoppeld: { uk: 'Джерело не підключене: підключіть його на сторінці служби, і індекс з’явиться сам.', nl: 'Bron niet gekoppeld: koppel haar op de pagina van de dienst en de index volgt vanzelf.' },
  indexeert: { uk: 'Індексація триває; результати вже доступні частково й поповнюються.', nl: 'Indexeren loopt; resultaten zijn al gedeeltelijk beschikbaar en groeien aan.' },
  gedeeltelijk: { uk: 'Проіндексовано частково: частина елементів ще чекає (див. причину).', nl: 'Gedeeltelijk geïndexeerd: een deel wacht nog (zie de reden).' },
  fout: { uk: 'Остання спроба завершилась помилкою; повтор заплановано автоматично.', nl: 'De laatste poging mislukte; een nieuwe poging is automatisch gepland.' },
  klaar: { uk: 'Індекс актуальний.', nl: 'De index is actueel.' },
};
const WACHT_UITLEG: Record<string, { uk: string; nl: string }> = {
  [WACHT_SLEUTEL]: { uk: 'Ключ шифрування закритий: індексація продовжиться після вашого входу на сайт.', nl: 'De versleutelingssleutel is dicht: indexeren gaat verder na uw aanmelding op de site.' },
  [WACHT_LADE]: { uk: 'Технічний простір зараз не активний: індексація продовжиться, коли ви його увімкнете.', nl: 'De technische ruimte is nu niet actief: indexeren gaat verder zodra u haar aanzet.' },
};

export function standAfleiden(bron: ZoekBron, k: KoppelFeit, rij: StandRij | null, w: WachtTelling, nu = Date.now()): BronStandVolledig {
  const r: StandRij = rij || { stand: '', voortgang: 0, aantal: 0, laatsteOk: 0, laatstePoging: 0, fout: '', versie: '', wachtReden: '', volledigOp: 0 };
  // De recentste fout: uit de bronstand óf uit de wachtrij (een item dat definitief 'fout' ging).
  const foutOp = r.fout ? r.laatstePoging : 0;
  const [fout, foutTijd] = w.laatsteWachtFoutOp > foutOp ? [w.laatsteWachtFout, w.laatsteWachtFoutOp] : [r.fout, foutOp];
  const basis = {
    bron, verbonden: k.verbonden, aantal: r.aantal, voortgang: r.voortgang, wachtend: w.wachtend, bezig: w.bezig,
    laatsteOk: r.laatsteOk, laatstePoging: r.laatstePoging, versie: r.versie, bijgewerktOp: Math.max(r.laatstePoging, r.laatsteOk, foutTijd),
    wachtReden: r.wachtReden || '', ...(k.opmerking ? { opmerking: k.opmerking } : {}),
  };
  const met = (stand: BronStandNaam, f = ''): BronStandVolledig => ({ ...basis, stand, fout: f, uitleg: basis.wachtReden && WACHT_UITLEG[basis.wachtReden] ? WACHT_UITLEG[basis.wachtReden] : UITLEG[stand] });
  if (k.fout) return met('fout', k.fout);
  if (!k.verbonden) return met('niet_gekoppeld', fout);
  if (r.wachtReden) return met(r.aantal > 0 ? 'gedeeltelijk' : 'indexeert', '');
  if (w.wachtend + w.bezig > 0 || r.stand === 'indexeert') return met('indexeert', fout);
  if (fout && foutTijd >= r.laatsteOk) return met(r.aantal > 0 ? 'gedeeltelijk' : 'fout', fout);
  if (r.stand === 'gedeeltelijk' || r.stand === 'fout') return met(r.stand, fout);
  if (!r.laatsteOk) return met('indexeert', '');
  void nu;
  return met('klaar', '');
}
