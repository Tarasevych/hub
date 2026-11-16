// UITROL-002 · Продовження встановлення з місця обриву (власник, 16.11.2026) · Installatie hervatten waar ze stokte.
//
// Проблема: після технічного збою на етапі встановлення (збірка, міграції, зупинка власником, тайм-аут) сайт видаляв архів з
// сервера, тож «Спробувати знову» означало завантажити той самий файл ще раз — трафік, час і очікування марнувалися, хоча з
// архівом усе було гаразд. Тепер:
//   • архів ЛИШАЄТЬСЯ на сервері після збою, який не стосується самого пакета (mislukt, verlopen без відповіді root, зупинка);
//     після відхилення сервером за вмістом (geweigerd) чи власником (afgewezen) — ні: такий пакет більше не придатний;
//   • коли власник обирає той самий файл, браузер рахує SHA-256 локально; збіг із збереженим архівом (sha256 + розмір + версія)
//     означає, що завантажувати не треба — сервер ще раз перераховує SHA-256 збереженого файлу й одразу переходить до перевірки
//     та схвалення (passkey потрібен знову: кожне встановлення схвалюється окремо);
//   • root зберігає зібрану теку випуску, якщо збій стався ПІСЛЯ збірки, і за того самого SHA-256 пропускає копіювання, npm ci
//     та збірку (див. deploy/installeer-app.sh, функції hervat_*).
//
// Probleem: na een technische fout tijdens het installeren (bouwen, migraties, stop door de eigenaar, time-out) verwijderde de site
// het archief van de server; «opnieuw proberen» betekende hetzelfde bestand nog eens uploaden. Nu blijft het archief bewaard na een
// fout die niets met het pakket zelf te maken heeft; kiest de eigenaar hetzelfde bestand, dan herkent de browser het aan de SHA-256
// en gaat het zonder upload verder. Zuiver (geen DOM, geen fetch); getest in tests/eenheid/uitrol-hervatten.test.ts.

/** Hoe lang een bewaard archief van een mislukte installatie op de server blijft (daarna ruimt opruimenVoorstellen het op). */
export const HERVAT_LIMIETEN = Object.freeze({ bewaarDagen: 7 });

/** Statussen van een voorstel waarbij het archief na de uitkomst op de server mag blijven voor een hervatting. */
export const HERVAT_STATUSSEN: ReadonlySet<string> = new Set(['mislukt', 'verlopen', 'afgebroken']);

/**
 * Uitkomstcodes waarbij het pakket zelf NIET de oorzaak was. Alleen dan is het zinvol het archief te bewaren: een pakket dat
 * root om zijn inhoud weigerde (handtekening, manifest, versie) is na een tweede poging nog net zo fout.
 */
const TECHNISCHE_CODES: ReadonlySet<string> = new Set(['INSTALLATIE_MISLUKT', 'GESTOPT', 'ONDERBROKEN', 'AFGEBROKEN', 'GEEN_UITKOMST', 'ROOK_TERUGGEDRAAID', 'NAZORG_TERUGGEDRAAID']);

/**
 * Mag het archief van dit voorstel na deze uitkomst op de server blijven?
 *   status 'mislukt'    + technische code → ja (de installatie stokte, het pakket is in orde)
 *   status 'verlopen'   + GEEN_UITKOMST   → ja (root begon nooit; het pakket is in orde)
 *   status 'afgebroken' + GESTOPT         → ja (de eigenaar stopte vóór het begin)
 *   geweigerd / afgewezen / geinstalleerd → nee
 */
export function pakketBewarenNaUitkomst(status: string, code: string): boolean {
  if (!HERVAT_STATUSSEN.has(status)) return false;
  return TECHNISCHE_CODES.has(String(code || '').toUpperCase());
}

export type HervatVoorstel = { id: string; versie: string; status: string; bytes: number; sha256: string; bijgewerktOp?: string; aangemaaktOp: string; beslistOp?: string; uitkomstCode: string; uitkomst: { uk?: string; nl?: string; reden?: string } | null; pakketAanwezig?: boolean };

/**
 * Het voorstel waarvan het archief op de server ligt en dat EXACT dit bestand is (sha256 + grootte + versie): dan hoeft er niets
 * geüpload te worden. De jongste wint als er meer zijn. Zonder `pakketAanwezig` (de server bevestigde niet dat het bestand er nog
 * ligt) telt het niet: de browser mag nooit aannemen dat een bestand er is.
 */
export function hervatKandidaat<T extends HervatVoorstel>(voorstellen: readonly T[], bestand: { sha256: string; bytes: number; versie: string }): T | undefined {
  const sha = String(bestand.sha256 || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha) || !(bestand.bytes > 0)) return undefined;
  return [...voorstellen]
    .filter((v) => v.pakketAanwezig === true && HERVAT_STATUSSEN.has(v.status) && v.sha256 === sha && Number(v.bytes) === bestand.bytes && v.versie === bestand.versie)
    .sort((a, b) => Date.parse(b.bijgewerktOp || b.aangemaaktOp) - Date.parse(a.bijgewerktOp || a.aangemaaktOp))[0];
}

/** Alle voorstellen met een bewaard archief (voor de lijst «Невдалі спроби з архівом на сервері» als er nog geen bestand gekozen is). */
export function hervatbareVoorstellen<T extends HervatVoorstel>(voorstellen: readonly T[]): T[] {
  return voorstellen.filter((v) => v.pakketAanwezig === true && HERVAT_STATUSSEN.has(v.status));
}

/**
 * De stap waar het de vorige keer stokte, uit de uitkomsttekst van root («in stap «bouwen»» / «на кроці «міграції»»); leeg als
 * onbekend. Alleen voor de uitleg op het scherm — de server beslist nooit op grond hiervan.
 */
export function stapUitUitkomst(uitkomst: { uk?: string; nl?: string } | null | undefined, lang: 'uk' | 'nl' = 'nl'): string {
  const t = lang === 'uk' ? `${uitkomst?.uk || ''} ${uitkomst?.nl || ''}` : `${uitkomst?.nl || ''} ${uitkomst?.uk || ''}`;
  const m = /(?:in stap|на кроці|під час «|tijdens «)\s*«([^»]{1,40})»/i.exec(t) || /«([^»]{1,40})»/.exec(uitkomst?.nl || '');
  return m ? m[1] : '';
}

/** Tekst voor het paneel «архів уже на сервері» (uk/nl), met datum, stap en reden van de vorige poging. */
export function hervatUitleg(lang: 'uk' | 'nl', v: HervatVoorstel, datumTekst: string): { kop: string; uitleg: string } {
  const stap = stapUitUitkomst(v.uitkomst, lang);
  const reden = (lang === 'uk' ? v.uitkomst?.uk : v.uitkomst?.nl) || v.uitkomst?.reden || v.uitkomstCode || '';
  if (lang === 'uk') return {
    kop: 'Цей архів уже є на сервері — повторно завантажувати не потрібно.',
    uitleg: `SHA-256 збігається з архівом спроби від ${datumTekst}${stap ? `, яка обірвалася на кроці «${stap}»` : ', яка не завершилася'}.${reden ? ` Причина: ${reden}` : ''} Сервер ще раз звірить контрольну суму збереженого файлу, повторить перевірку й попросить ваш passkey — кожне встановлення схвалюється окремо.`,
  };
  return {
    kop: 'Dit archief staat al op de server — opnieuw uploaden is niet nodig.',
    uitleg: `De SHA-256 is gelijk aan het archief van de poging van ${datumTekst}${stap ? `, die stokte in stap «${stap}»` : ', die niet werd afgemaakt'}.${reden ? ` Reden: ${reden}` : ''} De server vergelijkt de controlesom van het bewaarde bestand opnieuw, herhaalt de controle en vraagt uw passkey: elke installatie wordt apart goedgekeurd.`,
  };
}
