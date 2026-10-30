// UI-014 fase 2B: blijvende status per melding (shared/meldingen-v2/status.ts), tellers = lijstlengtes, groepen ×N krijgen allemaal
// dezelfde status, uitstel komt terug bovenaan, opschonen (nooit beveiliging), export zonder geheimen, migratie 0196.
import { readFileSync } from 'node:fs';
import { groepeer, type V2Melding } from '../../shared/meldingen-v2/groepering';
import { legeRegels, zetRegel } from '../../shared/meldingen-v2/beleid';
import { exportRijen, historieLijst, legeStatus, naarCsv, normaliseerStatus, opschonen, pasStatusToe, tabLijst, tabTellers, TABS, verborgenReden, verborgenTelling, zetStatus, zonderGeheimen, STATUS_MAX } from '../../shared/meldingen-v2/status';
import { checker } from './hulp/nep-google';

const NU = Date.parse('2026-10-30T09:00:00+01:00');
const DAG = 86400_000;
const m = (id: string, o: Partial<V2Melding> = {}): V2Melding => ({ id, dienst: 'post', ernst: 'info', titel: `Melding ${id}`, tijd: NU - 60_000, gelezen: false, ...o });

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-status-20261030');
  const ms: V2Melding[] = [
    ...[1, 2, 3].map((i) => m(`a:w${i}`, { dienst: 'ai', soort: 'command.fs.write', titel: 'Запис файлу', ernst: 'fout', tijd: NU - i * 3600_000 })),
    m('s:n1', { ernst: 'aandacht', titel: 'Пошта не синхронізується', vraagtActie: true }),
    m('s:n2', { dienst: 'identity', soort: 'security_warning', titel: 'Новий вхід', ernst: 'aandacht' }),
    m('s:n3', { dienst: 'cloud', ernst: 'succes', titel: 'OneDrive синхронізовано' }),
    m('s:n4', { dienst: 'agenda', titel: 'Нагадування', tijd: NU - 5 * DAG }),
    m('s:n5', { dienst: 'huis', titel: 'Світло', categorie: 'huis' }),
  ];
  const regels = zetRegel(legeRegels(), { dienst: 'huis' }, 'uit', NU);
  const bouw = (st = legeStatus()) => groepeer(pasStatusToe(ms, st, NU), regels, NU);
  const telKlopt = (gs: ReturnType<typeof bouw>, o = {}) => { const t = tabTellers(gs, NU, o); return TABS.every((x) => t[x] === tabLijst(gs, x, NU, o).length); };

  let st = legeStatus();
  let gs = bouw(st);
  check('groep ×3 «Запис файлу» = één item', gs.filter((g) => g.hoofd.titel === 'Запис файлу').length === 1 && gs.find((g) => g.hoofd.titel === 'Запис файлу')!.aantal === 3);
  check('tellers = lijstlengtes (begin)', telKlopt(gs) && telKlopt(gs, { toonVerborgen: true }));
  // Groep oplossen via alle leden
  const schrijf = gs.find((g) => g.hoofd.titel === 'Запис файлу')!;
  st = zetStatus(st, { ids: schrijf.leden.map((x) => x.id), status: 'opgelost', hoe: 'kaart' }, 'eigenaar', NU);
  check('opgelost: ALLE drie onderliggende records krijgen dezelfde status (met wie/wanneer/hoe)', ['a:w1', 'a:w2', 'a:w3'].every((id) => st.items[id]?.s === 'opgelost' && st.items[id].door === 'eigenaar' && st.items[id].op === NU && st.items[id].hoe === 'kaart'));
  gs = bouw(st);
  const t1 = tabTellers(gs, NU);
  check('opgelost: in «Вирішені», niet meer in «Важливі»/«Непрочитані»', tabLijst(gs, 'opgelost', NU).some((g) => g.hoofd.titel === 'Запис файлу') && !tabLijst(gs, 'belangrijk', NU).some((g) => g.hoofd.titel === 'Запис файлу') && !tabLijst(gs, 'ongelezen', NU).some((g) => g.hoofd.titel === 'Запис файлу'));
  check('tellers = lijstlengtes (na opgelost)', telKlopt(gs), JSON.stringify(t1));
  // Bulk: archief van twee
  st = zetStatus(st, { ids: ['s:n1', 's:n4'], status: 'archief', hoe: 'bulk' }, 'eigenaar', NU);
  gs = bouw(st);
  check('bulk archief: beide in «Архів», nergens anders', tabLijst(gs, 'archief', NU).length === 2 && !tabLijst(gs, 'alle', NU).some((g) => ['s:n1', 's:n4'].includes(g.hoofd.id)) && st.items['s:n1'].hoe === 'bulk');
  check('tellers = lijstlengtes (na bulk)', telKlopt(gs));
  // Uitstel
  st = zetStatus(st, { ids: ['s:n2'], status: 'uitgesteld', hoe: 'kaart', tot: NU + 3600_000 }, 'eigenaar', NU);
  gs = bouw(st);
  check('uitgesteld: uit alle tabs zolang het loopt', TABS.every((x) => !tabLijst(gs, x, NU).some((g) => g.hoofd.id === 's:n2')));
  const later = groepeer(pasStatusToe(ms, st, NU + 2 * 3600_000), regels, NU + 2 * 3600_000);
  const alleLater = tabLijst(later, 'alle', NU + 2 * 3600_000);
  check('uitgesteld voorbij: terug, ongelezen en BOVENAAN', alleLater[0]?.hoofd.id === 's:n2' && alleLater[0].ongelezen === 1, alleLater.map((g) => g.hoofd.id).join());
  check('uitstel ≤ 30 dagen', zetStatus(legeStatus(), { ids: ['x:1'], status: 'uitgesteld', hoe: 'kaart', tot: NU + 400 * DAG }, 'e', NU).items['x:1'].tot === NU + 30 * DAG);
  check('uitstel in het verleden wordt genegeerd', !zetStatus(legeStatus(), { ids: ['x:1'], status: 'uitgesteld', hoe: 'kaart', tot: NU - 1 }, 'e', NU).items['x:1']);
  // Terug naar nieuw
  const terug = zetStatus(st, { ids: ['s:n1'], status: 'nieuw', hoe: 'kaart' }, 'e', NU);
  check('«Повернути в нові» haalt het record weg', !terug.items['s:n1']);
  // Verborgen door regels
  const v = verborgenTelling(bouw(), NU);
  check('verborgen: regel «uit» (huis) en standaard-stil succes (OneDrive) geteld', v.regel === 1 && v.stil === 1 && v.totaal === 2, JSON.stringify(v));
  check('verborgen: tonen = in «Усі» met reden', tabLijst(bouw(), 'alle', NU, { toonVerborgen: true }).filter((g) => verborgenReden(g)).length === 2 && !tabLijst(bouw(), 'alle', NU).some((g) => verborgenReden(g)));
  check('beveiliging is nooit «verborgen»', verborgenReden(groepeer([m('s:z', { soort: 'security_warning', ernst: 'succes' })], zetRegel(legeRegels(), { dienst: 'post' }, 'uit', NU), NU)[0]) === null);
  // Opschonen
  let o = zetStatus(legeStatus(), { ids: ['s:oud', 's:bev'], status: 'opgelost', hoe: 'kaart', beveiliging: ['s:bev'] }, 'e', NU - 31 * DAG);
  o = zetStatus(o, { ids: ['s:vers'], status: 'opgelost', hoe: 'kaart', beveiliging: [] }, 'e', NU - 2 * DAG);
  const r1 = opschonen(o, NU);
  check('opschonen: opgelost > 30 d → archief (automatisch), vers blijft', r1.stand.items['s:oud'].s === 'archief' && r1.stand.items['s:oud'].hoe === 'automatisch' && r1.stand.items['s:vers'].s === 'opgelost' && r1.gearchiveerd === 2);
  check('opschonen: beveiliging wordt ook gearchiveerd (niet gewist)', r1.stand.items['s:bev'].s === 'archief' && r1.stand.items['s:bev'].beveiliging === true);
  const r2 = opschonen(r1.stand, NU + 31 * DAG);
  check('opschonen: archief nog eens > termijn → opgeruimd, MAAR nooit beveiliging', r2.stand.items['s:oud'].opgeruimd === true && !r2.stand.items['s:bev'].opgeruimd && r2.opgeruimd === 1, JSON.stringify(r2.stand.items));
  const onbekend = opschonen(opschonen(zetStatus(legeStatus(), { ids: ['s:x'], status: 'opgelost', hoe: 'kaart' }, 'e', NU - 100 * DAG), NU - 60 * DAG).stand, NU);
  check('opschonen: onbekend of beveiliging → nooit opgeruimd (veilig)', !onbekend.stand.items['s:x'].opgeruimd);
  check('opgeruimd: niet in «Архів», wél in de geschiedenis', (() => { const st2 = r2.stand; const g2 = groepeer(pasStatusToe([m('s:oud')], st2, NU), legeRegels(), NU); return tabLijst(g2, 'archief', NU).length === 0 && historieLijst(pasStatusToe([m('s:oud')], st2, NU), {}).length === 1; })());
  check('bewaartermijn instelbaar (7 d)', opschonen({ ...zetStatus(legeStatus(), { ids: ['s:a'], status: 'opgelost', hoe: 'kaart' }, 'e', NU - 8 * DAG), bewaarDagen: 7 }, NU).gearchiveerd === 1);
  // Normaliseren
  const n = normaliseerStatus({ items: { 'ok:1': { s: 'opgelost', op: NU + 99 * DAG, door: 'x' }, 'slecht id!': { s: 'opgelost' }, 'ok:2': { s: 'weg' }, 'ok:3': { s: 'archief', op: NU, opgeruimd: true } }, bewaarDagen: 'x' }, NU);
  check('normaliseren: ongeldige id/status weg, tijd niet in de toekomst, standaard 30 d, opgeruimd alleen bij beveiliging=false', Object.keys(n.items).join() === 'ok:1,ok:3' && n.items['ok:1'].op === NU && n.bewaarDagen === 30 && !n.items['ok:3'].opgeruimd);
  const groot = normaliseerStatus({ items: Object.fromEntries(Array.from({ length: STATUS_MAX + 50 }, (_, i) => [`g:${i}`, { s: i === 0 ? 'archief' : 'gelezen', op: NU - (STATUS_MAX - i) * 1000, beveiliging: i === 0 }])) }, NU);
  check(`begrensd op ${STATUS_MAX}, beveiliging blijft`, Object.keys(groot.items).length === STATUS_MAX && !!groot.items['g:0']);
  // Zoeken/filter/export
  const h = historieLijst(ms, { ernst: ['fout'], dienst: ['ai'] });
  check('geschiedenis: filter ernst+bron', h.length === 3 && h.every((x) => x.ernst === 'fout'));
  check('geschiedenis: periode', historieLijst(ms, { vanaf: NU - DAG }).every((x) => x.tijd >= NU - DAG) && historieLijst(ms, { vanaf: NU - DAG }).length === ms.length - 1);
  check('geschiedenis: zoeken', historieLijst(ms, { zoek: 'onedrive' }).length === 1);
  const geheim = zonderGeheimen('Код: 123456 token=abcDEF ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 https://id.tarasevych.com/x?code=geheim eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcdefghij');
  check('export: geen tokens/codes/query-strings', !/123456|abcDEF|ghp_|code=geheim|eyJhbGci/.test(geheim) && geheim.includes('https://id.tarasevych.com/x'), geheim);
  const rijen = exportRijen([m('s:t', { technischeTekst: 'SECRET_X', link: '/a?token=1', tekst: 'wachtwoord: hunter2' })], legeStatus());
  check('export: geen technische tekst, geen link, wachtwoord verborgen', !JSON.stringify(rijen).includes('SECRET_X') && !JSON.stringify(rijen).includes('token=1') && !JSON.stringify(rijen).includes('hunter2'));
  const csv = naarCsv(exportRijen([m('s:c', { titel: '=SOM(A1), "x"' })], legeStatus()));
  check('CSV: kop + formule-injectie geneutraliseerd + aanhalingstekens', csv.startsWith('\uFEFFid,tijd') && csv.includes(`"'=SOM(A1), ""x"""`), csv.split('\n')[1]);
  // Migratie + route
  const mig = readFileSync('migrations/0196_melding_status_rls.sql', 'utf8');
  check('0196: alleen RLS-groep voorkeuren, idempotent', /array_append\(tabellen, 'melding_status_v1'\)/.test(mig) && /NOT \('melding_status_v1' = ANY\(tabellen\)\)/.test(mig) && !/CREATE TABLE|DROP/i.test(mig));
  const be = readFileSync('backend/meldingen-status.ts', 'utf8');
  check('route: sessie verplicht, eigenaar goedgekeurd', be.includes("auth.user.status !== 'approved'") && be.includes("'POST /api/owner/meldingen/status/zetten'"));
  check('UI-teksten: geen Engels in nieuwe knoppen', !/>\s*(Archive|Snooze|Resolved|Export|Select)\s*</.test(readFileSync('src/meldingen/v2/MeldingenV2.tsx', 'utf8') + readFileSync('src/meldingen/v2/HistorieV3.tsx', 'utf8')));
  return einde();
}
