// Agenda v3 (vlag agenda-v3, 28.10.2026): pure rekenhulp en sleutels. Loopt met TZ=Europe/Brussels (zie scripts/eenheidstests.mjs-aanroep).
import { readFileSync } from 'node:fs';
import type { AgendaItem } from '../../shared/agenda-model';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { agendaSleutel, filterItems, heleDagItems, itemsOpDag, kleurVoor, leesAdres, opPlaatselijkeDag, PALET, plusDagen, schrijfAdres, tijdblokken, verschuif, wandMinuten } from '../../src/agenda/v3/agenda-tijd';
import { sleutelVoor } from '../../src/agenda/v3/idempotentie';
import { checker } from './hulp/nep-google';

const item = (o: Partial<AgendaItem>): AgendaItem => ({ id: 'google:hoofd:x', bron: 'google', agendaId: 'hoofd', agendaNaam: 'Werk', titel: 'Overleg', locatie: '', beschrijving: '',
  begin: '2026-10-28T09:00:00+01:00', einde: '2026-10-28T10:00:00+01:00', heleDag: false, etag: '"1"', schrijfbaar: true, deelnemers: [], herhaling: null, status: 'confirmed', ...o } as AgendaItem);

export async function main(): Promise<number> {
  const { check, einde } = checker('agenda-v3-20261028');
  const brussel = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Brussels';
  check('tijdzone van de test is Europe/Brussels (anders zeggen de DST-toetsen niets)', brussel);

  // Dag en wandklok
  const a = item({});
  check('op dag: een afspraak met tijd valt op haar plaatselijke dag en niet op de dag erna', opPlaatselijkeDag(a, '2026-10-28') && !opPlaatselijkeDag(a, '2026-10-29'));
  const nacht = item({ begin: '2026-10-28T23:00:00+01:00', einde: '2026-10-29T01:00:00+01:00' });
  check('op dag: over middernacht staat op beide dagen', opPlaatselijkeDag(nacht, '2026-10-28') && opPlaatselijkeDag(nacht, '2026-10-29'));
  const hele = item({ heleDag: true, begin: '2026-10-28', einde: '2026-10-29' });
  check('hele dag: komt in de rij «hele dag», niet in het uurraster', heleDagItems([hele, a], '2026-10-28').length === 1 && tijdblokken([hele], '2026-10-28').length === 0);
  check('wandklok: 09:00 in Brussel = 540 minuten', wandMinuten(new Date('2026-10-28T08:00:00Z'), '2026-10-28') === 540);
  check('wandklok: ervoor 0, erna 1440', wandMinuten(new Date('2026-10-27T08:00:00Z'), '2026-10-28') === 0 && wandMinuten(new Date('2026-10-30T08:00:00Z'), '2026-10-28') === 1440);
  // DST: 25.10.2026 — 03:00 zomertijd wordt 02:00 wintertijd. Een afspraak om 09:00 (UTC+1) staat op de 09:00-lijn.
  const dst = item({ begin: '2026-10-25T08:00:00Z', einde: '2026-10-25T09:00:00Z' });
  const [b] = tijdblokken([dst], '2026-10-25');
  check('DST (wintertijd 25.10): 09:00 staat op 540 minuten, hoogte 60', b?.boven === 540 && b?.hoogte === 60);
  const zomer = item({ begin: '2026-03-29T07:00:00Z', einde: '2026-03-29T08:00:00Z' });
  check('DST (zomertijd 29.03): 09:00 CEST staat op 540 minuten', tijdblokken([zomer], '2026-03-29')[0]?.boven === 540);
  const andereZone = item({ begin: '2026-10-28T09:00:00-04:00', einde: '2026-10-28T10:00:00-04:00' });
  check('andere tijdzone: 09:00 New York = 14:00 in Brussel', tijdblokken([andereZone], '2026-10-28')[0]?.boven === 840);

  // Overlap en minimum
  const x = item({ id: 'google:hoofd:a' }), y = item({ id: 'google:hoofd:b', begin: '2026-10-28T09:30:00+01:00', einde: '2026-10-28T11:00:00+01:00' }), z = item({ id: 'google:hoofd:c', begin: '2026-10-28T12:00:00+01:00', einde: '2026-10-28T12:05:00+01:00' });
  const bl = tijdblokken([z, y, x], '2026-10-28');
  const per = (id: string) => bl.find((q) => q.item.id === id)!;
  check('overlap: twee banen naast elkaar', per('google:hoofd:a').banen === 2 && per('google:hoofd:b').banen === 2 && per('google:hoofd:a').baan !== per('google:hoofd:b').baan);
  check('overlap: losse afspraak krijgt één baan; minimaal 20 minuten hoog', per('google:hoofd:c').banen === 1 && per('google:hoofd:c').hoogte === 20);
  check('volgorde per dag: op begintijd', itemsOpDag([z, x], '2026-10-28')[0].id === 'google:hoofd:a');

  // Herhaling: de server geeft elke keer als eigen item; die vallen elk op hun dag
  const reeks = [0, 7, 14].map((n) => item({ id: `google:hoofd:r_${n}`, begin: `${plusDagen('2026-10-19', n)}T10:00:00+0${n === 0 ? 2 : 1}:00`, einde: `${plusDagen('2026-10-19', n)}T11:00:00+0${n === 0 ? 2 : 1}:00`, herhaling: { freq: 'WEEKLY' } as never }));
  check('herhaling: wekelijks over de wintertijdwissel blijft om 10:00', ['2026-10-19', '2026-10-26', '2026-11-02'].every((d) => tijdblokken(reeks, d)[0]?.boven === 600));

  // Filters en kleur
  const ics = item({ id: 'ics:5:u1', bron: 'ics', agendaId: '5', agendaNaam: 'Schoolvakanties', titel: 'Herfstvakantie', schrijfbaar: false });
  check('sleutel per agenda', agendaSleutel(a) === 'google:hoofd' && agendaSleutel(ics) === 'ics:5');
  check('filter: verborgen agenda valt weg', filterItems([a, ics], '', new Set(['ics:5'])).length === 1);
  check('zoeken: zonder hoofdletters of accenten, ook op agendanaam', filterItems([a, ics], 'SCHOOL', new Set()).length === 1 && filterItems([item({ titel: 'Café' })], 'cafe', new Set()).length === 1);
  check('kleur: vast per sleutel, eigen kleur gaat voor', kleurVoor('ics:5') === kleurVoor('ics:5') && PALET.includes(kleurVoor('x')) && kleurVoor('x', '#123456') === '#123456');

  // Adresregel
  check('adres: mobiel standaard dag, breed standaard maand', leesAdres('', true, '2026-10-28').weergave === 'dag' && leesAdres('', false, '2026-10-28').weergave === 'maand');
  check('adres: ongeldige datum → vandaag', leesAdres('?datum=2026-02-31', false, '2026-10-28').datum === '2026-10-28' && leesAdres('?weergave=week&datum=2026-02-03', false).datum === '2026-02-03');
  check('adres: schrijven behoudt andere parameters', schrijfAdres('?ruimte=tech', { weergave: 'week', datum: '2026-10-28' }) === '?ruimte=tech&weergave=week&datum=2026-10-28');
  check('stap: maand van 31 januari → 1 februari; week +7; dag -1',
    verschuif({ weergave: 'maand', datum: '2026-01-31' }, 1) === '2026-02-01' && verschuif({ weergave: 'week', datum: '2026-10-28' }, 1) === '2026-11-04' && verschuif({ weergave: 'dag', datum: '2026-03-01' }, -1) === '2026-02-28');

  // Idempotentie
  let n = 0; const maak = () => `s${++n}`; const g = new Map<string, string>();
  const s1 = sleutelVoor(g, 'maak|x', maak), s2 = sleutelVoor(g, 'maak|x', maak), s3 = sleutelVoor(g, 'maak|y', maak);
  check('idempotentie: dezelfde poging (netwerkfout, opnieuw) = dezelfde sleutel; andere invoer = nieuwe', s1 === s2 && s1 !== s3);
  g.delete('maak|x');
  check('idempotentie: na een antwoord van de server een nieuwe sleutel', sleutelVoor(g, 'maak|x', maak) !== s1);

  // Vlag en bron
  const u = VLAG_UITLEG['agenda-v3'];
  check('vlag: uitleg in het Oekraïens en Nederlands', Boolean(u && u.naam[0] && u.naam[1] && u.wat[0] && u.gevolg[1]));
  const mig = readFileSync('migrations/0125_agenda_v3_vlag.sql', 'utf8');
  check('vlag: migratie zet hem standaard UIT', /'agenda-v3'/.test(mig) && /false,\s*false/.test(mig) && /ON CONFLICT \(sleutel\) DO NOTHING/.test(mig));
  const oud = readFileSync('src/agenda/Agenda.tsx', 'utf8');
  check('poort: zonder vlag de oude agenda; v3 lui geladen', /useAgendaV3\(\)/.test(oud) && /lazy\(\(\) => import\('\.\/v3\/AgendaPagina'\)\)/.test(oud) && /function AgendaOud/.test(oud));
  const v3 = ['AgendaPagina.tsx', 'onderdelen/GebeurtenisBewerker.tsx', 'onderdelen/VerbindingenLade.tsx', 'onderdelen/Terugkoppeling.tsx'].map((f) => readFileSync(`src/agenda/v3/${f}`, 'utf8')).join('\n');
  check('v3: niets verzonnen (geen Math.random, geen voorbeelddata)', !/Math\.random/.test(v3) && !/lorem|dummy/i.test(v3));
  check('v3: conflictpaneel, uitbreiding en sync-merken bestaan', ["data-agenda-conflict='1'", 'data-agenda-conflict-overnemen', 'data-agenda-conflict-overschrijven', 'data-agenda-uitbreiden', 'data-agenda-sync'].every((m) => v3.includes(m)));
  return einde();
}
