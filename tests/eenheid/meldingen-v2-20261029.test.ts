// UI-007 Meldingen v2 (vlag meldingen-v2): leveringsbeleid, groepering, tellers, technische ruis, privacy van accounts, migraties.
import { readFileSync } from 'node:fs';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { isBeschermd, levering, legeRegels, modusUitTypeVoorkeur, normaliseerRegels, zetNietStoren, zetRegel, MAX_NIET_STOREN_MS } from '../../shared/meldingen-v2/beleid';
import { accountWeergave, accountsPerAanbieder, filter, groepeer, indeling, ontdubbel, tellers, type V2Melding } from '../../shared/meldingen-v2/groepering';
import { checker } from './hulp/nep-google';

const NU = Date.parse('2026-10-29T12:00:00Z');
let n = 0;
const m = (o: Partial<V2Melding>): V2Melding => ({ id: `s:${++n}`, dienst: 'post', ernst: 'info', titel: 'Iets', tijd: NU - n * 60_000, gelezen: false, ...o });

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-v2-20261029');
  const leeg = legeRegels();

  // --- groepering: honderden herhaalde start/einde-meldingen van één proces → één item
  const ronde: V2Melding[] = [];
  for (let i = 0; i < 60; i++) {
    ronde.push(m({ dienst: 'post', soort: 'adrescontrole', procesId: 'adrescontrole', fase: 'start', titel: `Перевірку адрес розпочато (${i})`, ernst: 'info', tijd: NU - (i * 2 + 1) * 60_000 }));
    ronde.push(m({ dienst: 'post', soort: 'adrescontrole', procesId: 'adrescontrole', fase: 'einde', titel: `Перевірку адрес завершено (${i})`, ernst: 'succes', tijd: NU - i * 2 * 60_000 }));
  }
  const g1 = groepeer(ronde, leeg, NU);
  check('120 start/einde-regels van één proces worden 1 item', g1.length === 1 && g1[0].aantal === 120, `${g1.length} items`);
  const t1 = tellers(g1);
  check('geslaagd achtergrondwerk telt niet in de bel (stil)', t1.bel === 0 && t1.aandacht === 0, JSON.stringify(t1));

  // --- echte fout gaat niet verloren door latere statusupdates zonder succes
  const fout = [m({ procesId: 'sync-1', dienst: 'cloud', ernst: 'fout', titel: 'Синхронізація не вдалася', tijd: NU - 5 * 60_000 }), m({ procesId: 'sync-1', dienst: 'cloud', ernst: 'info', fase: 'bezig', titel: 'Синхронізація триває', tijd: NU - 60_000 })];
  const g2 = groepeer(fout, leeg, NU);
  check('open fout blijft zichtbaar na een latere voortgangsregel', g2[0].openFout && g2[0].ernst === 'fout');
  check('open fout telt als «потребує уваги» en in de bel', tellers(g2).aandacht === 1 && tellers(g2).bel === 1);
  const opgelost = groepeer([...fout, m({ procesId: 'sync-1', dienst: 'cloud', ernst: 'succes', titel: 'Синхронізовано', tijd: NU })], leeg, NU);
  check('latere geslaagde ronde lost de fout op', !opgelost[0].openFout && tellers(opgelost).aandacht === 0);

  // --- gelezen ≠ opgelost
  const verzoek = groepeer([m({ dienst: 'identity', soort: 'toegang_verzoek', ernst: 'aandacht', vraagtActie: true, gelezen: true, titel: 'Запит на доступ' })], leeg, NU);
  check('gelezen verzoek blijft «потребує дії»', verzoek[0].toestand === 'actie' && tellers(verzoek).aandacht === 1 && tellers(verzoek).bel === 0);
  const afgehandeld = groepeer([m({ dienst: 'identity', ernst: 'aandacht', vraagtActie: true, toestand: 'opgelost', titel: 'Запит' })], leeg, NU);
  check('opgelost verzoek vraagt geen aandacht meer', tellers(afgehandeld).aandacht === 0);

  // --- duplicaatbescherming
  check('zelfde id telt één keer (laatste versie wint)', ontdubbel([m({ id: 's:dup', titel: 'a', tijd: 1 }), m({ id: 's:dup', titel: 'b', tijd: 2 })]).length === 1);

  // --- beleid: vier modi, specifiek wint, DND, bescherming
  let r = zetRegel(leeg, { dienst: 'post' }, 'stil', NU);
  r = zetRegel(r, { dienst: 'post', account: 'werk@voorbeeld.be' }, 'prioriteit', NU + 1);
  const gewoon = levering(r, { dienst: 'post', account: 'prive@voorbeeld.be' }, 'normaal', NU);
  const werk = levering(r, { dienst: 'post', account: 'werk@voorbeeld.be' }, 'normaal', NU);
  check('dienstregel «Тихе»: geen teller, wel geschiedenis', gewoon.modus === 'stil' && !gewoon.teller && gewoon.centrum && !gewoon.geluid);
  check('accountregel wint van dienstregel (Пріоритетне: geluid+banner)', werk.modus === 'prioriteit' && werk.geluid && werk.banner && werk.teller);
  const uit = levering(zetRegel(leeg, { account: 'x@y.be' }, 'uit', NU), { dienst: 'post', account: 'x@y.be' }, 'normaal', NU);
  check('«Вимкнене»: niet in het centrum', !uit.centrum && !uit.teller);
  const besch = levering(zetRegel(leeg, { dienst: 'identity' }, 'uit', NU), { dienst: 'identity', categorie: 'beveiliging' }, 'normaal', NU);
  check('beveiliging kan niet onder «Звичайне» zakken', besch.beschermd && besch.centrum && besch.teller && besch.modus === 'normaal');
  check('bevestigingsverzoek is beschermd', isBeschermd({ vraagtBevestiging: true }) && isBeschermd({ soort: 'passkey_verwijderd' }) && !isBeschermd({ soort: 'mail_ontvangen' }));
  const dnd = zetNietStoren(werk ? r : r, 60, NU);
  const tijdensDnd = levering(dnd, { dienst: 'post', account: 'werk@voorbeeld.be' }, 'normaal', NU + 60_000);
  check('Не турбувати: geen geluid/banner, teller blijft', !tijdensDnd.geluid && !tijdensDnd.banner && tijdensDnd.teller && tijdensDnd.gedempt === 'niet-storen');
  check('Не турбувати verloopt vanzelf', levering(dnd, { dienst: 'post', account: 'werk@voorbeeld.be' }, 'normaal', NU + 61 * 60_000).geluid);
  check('Не турбувати maximaal 7 dagen', normaliseerRegels({ nietStoren: { tot: NU + 30 * 86400_000, sinds: NU } }, NU).nietStoren!.tot === NU + MAX_NIET_STOREN_MS);
  check('normalisatie weigert rommel en regels zonder doel', normaliseerRegels({ regels: [{ modus: 'stil' }, { dienst: '<script>', modus: 'stil' }, { dienst: 'post', modus: 'hard' }, { dienst: 'post', modus: 'uit' }] }, NU).regels.length === 1);
  check('oude typevoorkeur → modus', modusUitTypeVoorkeur({ geluid: true, opduiken: true, tonen: true }) === 'prioriteit' && modusUitTypeVoorkeur({ geluid: false, opduiken: false, tonen: true }) === 'stil' && modusUitTypeVoorkeur({ geluid: false, opduiken: false, tonen: false }) === 'uit');

  // --- honderden meldingen: tellers per item, niet per regel
  const veel: V2Melding[] = [];
  for (let i = 0; i < 163; i++) veel.push(m({ dienst: ['post', 'cloud', 'ai'][i % 3], soort: `soort${i % 9}`, titel: `Подія ${i % 9}`, ernst: i % 41 === 0 ? 'fout' : 'succes', tijd: NU - i * 1000 }));
  const gv = groepeer(veel, leeg, NU), tv = tellers(gv);
  check('163 regels → hooguit 9 items', gv.length <= 9 && tv.regels === 163, `${gv.length} items, bel ${tv.bel}`);
  check('bel ≤ aantal items (geen 129 meer)', tv.bel <= gv.length);
  check('filter «Важливі» toont alleen wat aandacht vraagt', filter(gv, 'belangrijk', {}).every((g) => g.openFout || g.ernst === 'aandacht' || g.toestand === 'actie' || g.levering.modus === 'prioriteit'));
  check('zoeken vindt op bron en tekst', filter(gv, 'alle', { zoek: 'подія 3' }).length === 1);

  // --- technische ruis
  check('«extensie ontgrendeld» is technisch', indeling(m({ titel: 'Extensie ontgrendeld' })) === 'technisch');
  check('herhaalpoging is technisch', indeling(m({ titel: 'Повторна спроба 3 з 12' })) === 'technisch');
  check('interne code is technisch', indeling(m({ titel: 'MAIL_SYNC_TOKEN_EXPIRED' })) === 'technisch');
  check('fout met actie blijft voor de gebruiker', indeling(m({ titel: 'MAIL_SYNC_TOKEN_EXPIRED', ernst: 'fout', link: '/mail/accounts' })) === 'gebruiker');
  check('gewone melding blijft voor de gebruiker', indeling(m({ titel: 'Новий лист від Анни' })) === 'gebruiker');
  check('technische sfeer nooit in het gewone centrum', indeling(m({ sfeer: 'technisch', titel: 'Нове' })) === 'technisch');

  // --- meerdere accounts van één aanbieder
  const acc = [m({ aanbieder: 'google', account: 'pavlo@gmail.com' }), m({ aanbieder: 'google', account: 'werk@bedrijf.be', accountLabel: 'Робочий' })];
  const per = accountsPerAanbieder(acc);
  check('twee Google-accounts herkend', per.get('google') === 2);
  check('label wint (privacy)', accountWeergave(acc[1], true, false) === 'Робочий');
  check('zonder label bij meerdere accounts: gemaskeerd adres', accountWeergave(acc[0], true, false) === 'p…@gmail.com');
  check('volledig adres alleen op verzoek', accountWeergave(acc[0], true, true) === 'pavlo@gmail.com');
  check('één account zonder label: geen adres', accountWeergave(m({ aanbieder: 'google', account: 'a@b.be' }), false, false) === null);

  // --- vlag, migraties, route
  check('vlag meldingen-v2 heeft uitleg', !!VLAG_UITLEG['meldingen-v2']);
  const m142 = readFileSync('migrations/0142_meldingen_v2_vlag.sql', 'utf8'), m143 = readFileSync('migrations/0143_melding_regels_rls.sql', 'utf8');
  check('0142 zet vlag standaard UIT', /'meldingen-v2'[\s\S]*false, false/.test(m142) && /ON CONFLICT/.test(m142));
  check('0143 voegt tbl toe aan RLS-groep voorkeuren (idempotent)', /melding_regels_v1/.test(m143) && /NOT \('melding_regels_v1' = ANY/.test(m143));
  const be = readFileSync('backend/meldingen-regels.ts', 'utf8');
  check('regels-route vraagt sessie + vlag, user-id uit sessie', /requireSession/.test(be) && /MELDINGEN_V2_UIT/.test(be) && !/b\.userId|body\.userId/.test(be));
  const cnc = readFileSync('src/CanoniekMeldingencentrum.tsx', 'utf8');
  check('zonder vlag: oud paneel ongewijzigd bereikbaar', /\{v2 \? \(\s*<MeldingenV2\s[\s\S]*\) : \(\s*<>\s*<header>/.test(cnc) && /unreadCount = v2Model \? /.test(cnc));
  return einde();
}
