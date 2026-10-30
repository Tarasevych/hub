// Admin → «Діагностика» → «Скарга користувача»: de beheerder kiest een gebruiker en ziet wat die gebruiker op de site ervaart, ZONDER inhoud.
//
// Wat wél: accountstatus, aantal en soort actieve sessies (apparaat/browser-label, laatste activiteit), aantal acties en mislukkingen
// (alleen de actielabels uit het logboek, geen details), koppelingen (aantal OAuth-verbindingen met clientnaam, lokale agenten, mislukte
// wachtrijmails) en de laatste diagnoseuitslag van de diensten die de gebruiker de laatste 24 uur raakte.
// Wat NIET: mailteksten, bestandsnamen, IP-adressen, tokens, auditdetails, wachtwoorden of sessie-ids.
//
// De beoordeling (`beoordeelGebruiker`) is een zuivere functie: invoer in, bevindingen uit — getest zonder server of database.
import { db } from '../server/platform/db';
import { getPool } from '../server/platform/pg';
import { auditLijst } from '../server/platform/audit';
import { FAIL_RE, dienstNaam, labelVan, sectieNaam, sectieVan, sessieActief, veiligeFoto, weergaveNaam, type Gebruiker, type Sessie } from './beheer-overzicht-kern';
import { isControleId, type Stand, type Tekst } from '../shared/beheer-diagnostiek';

const SESSIE_TABEL = 'owner_service_sessions_v1';
const sys = () => getPool('systeem');
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const DAG = 86_400_000;

export type Bevinding = { ernst: 'fout' | 'let-op' | 'info'; code: string; tekst: Tekst; stap?: Tekst };
export type GebruikerKort = { id: string; naam: string; email: string; foto: string; status: string };
export type DienstStand = { dienst: string; naam: Tekst; stand: Stand | 'nooit'; acties: number; mislukt: number };
export type GebruikerCheck = {
  nu: number;
  gebruiker: GebruikerKort & { rol: string; aangemaakt: number };
  sessies: { actief: number; totaal: number; laatsteActiviteit: number; apparaten: string[] };
  acties: { dag: number; weekMislukt: number; dagMislukt: number; recent: Array<{ t: number; label: Tekst; sectie: Tekst; dienst: string; mislukt: boolean }> };
  koppelingen: { oauth: Array<{ client: string; n: number; laatst: number }>; agenten: { verbonden: number; totaal: number }; mailMislukt: number; mailVast: number };
  diensten: DienstStand[];
  bevindingen: Bevinding[];
};

export type BeoordeelInvoer = {
  nu: number; status: string; sessiesActief: number; sessiesTotaal: number; laatsteActiviteit: number;
  dagActies: number; dagMislukt: number; weekMislukt: number;
  oauthActief: number; mailMislukt: number; mailVast: number; agentenStil: number;
  diensten: DienstStand[];
};

/** Zuiver: wat valt de beheerder op? Geordend: fout → let-op → info. */
export function beoordeelGebruiker(i: BeoordeelInvoer): Bevinding[] {
  const b: Bevinding[] = [];
  if (i.status && !['approved', 'active'].includes(i.status)) {
    b.push({ ernst: 'fout', code: 'ACCOUNT_STATUS', tekst: [`Обліковий запис має статус «${i.status}» — вхід, найімовірніше, заблокований.`, `Het account heeft status «${i.status}» — aanmelden is waarschijnlijk geblokkeerd.`],
      stap: ['Відкрийте «Користувачі та доступ» і перевірте запит або блокування.', 'Open «Gebruikers en toegang» en controleer de aanvraag of blokkade.'] });
  }
  if (i.sessiesActief === 0) {
    b.push({ ernst: 'let-op', code: 'GEEN_SESSIE', tekst: ['Активних сесій немає: користувач зараз не ввійшов (або сесія протермінована).', 'Er zijn geen actieve sessies: de gebruiker is niet aangemeld (of de sessie is verlopen).'],
      stap: ['Попросіть увійти знову; якщо вхід не вдається — перегляньте «Журнал» за цим користувачем.', 'Vraag opnieuw aan te melden; lukt dat niet, bekijk dan het «Журнал» voor deze gebruiker.'] });
  }
  if (i.dagActies >= 5 && i.dagMislukt / i.dagActies > 0.3) {
    b.push({ ernst: 'fout', code: 'VEEL_MISLUKT', tekst: [`За добу ${i.dagMislukt} з ${i.dagActies} дій завершились невдало.`, `In de afgelopen dag mislukten ${i.dagMislukt} van de ${i.dagActies} acties.`],
      stap: ['Відкрийте «Журнал», відфільтруйте за цим користувачем і результатом «невдало» — там видно, які саме дії падають.', 'Open het «Журнал», filter op deze gebruiker en resultaat «mislukt» — daar ziet u welke acties falen.'] });
  } else if (i.dagMislukt > 0) {
    b.push({ ernst: 'let-op', code: 'ENKELE_MISLUKT', tekst: [`За добу невдалих дій: ${i.dagMislukt}.`, `Mislukte acties in de afgelopen dag: ${i.dagMislukt}.`] });
  }
  if (i.mailVast > 0) b.push({ ernst: 'fout', code: 'MAIL_VAST', tekst: [`У черзі пошти застрягло листів: ${i.mailVast}.`, `In de mailwachtrij zitten ${i.mailVast} mails vast.`], stap: ['Перевірте «Діагностика» → «Пошта» → «Черга запланованих листів».', 'Controleer «Діагностика» → «E-mail» → «Wachtrij met geplande mails».'] });
  if (i.mailMislukt > 0) b.push({ ernst: 'let-op', code: 'MAIL_MISLUKT', tekst: [`Невдалих відправлень пошти за добу: ${i.mailMislukt}.`, `Mislukte mailverzendingen in de afgelopen dag: ${i.mailMislukt}.`] });
  if (i.agentenStil > 0) b.push({ ernst: 'let-op', code: 'AGENT_STIL', tekst: [`Локальних агентів без сигналу: ${i.agentenStil}.`, `Lokale agenten zonder signaal: ${i.agentenStil}.`], stap: ['Попросіть перезапустити локальний агент.', 'Vraag de lokale agent te herstarten.'] });
  for (const d of i.diensten) {
    if (d.stand === 'fout' || d.stand === 'let-op') {
      b.push({ ernst: d.stand === 'fout' ? 'fout' : 'let-op', code: `DIENST_${d.dienst.toUpperCase()}`,
        tekst: [`Сервіс «${d.naam[0]}», яким користувач скористався, зараз має стан «${d.stand === 'fout' ? 'збій' : 'увага'}» — це може бути причиною скарги.`, `De dienst «${d.naam[1]}» die de gebruiker gebruikte staat nu op «${d.stand === 'fout' ? 'fout' : 'let op'}» — dat kan de oorzaak van de klacht zijn.`],
        stap: ['Відкрийте відповідну категорію діагностики й запустіть «Перевірити».', 'Open de bijbehorende diagnosecategorie en start «Перевірити».'] });
    }
  }
  if (!b.length) {
    b.push({ ernst: 'info', code: 'ALLES_OK', tekst: ['З боку сайту проблем не видно: сесія діє, невдалих дій немає, пов’язані сервіси справні. Зверніться до користувача за точним описом (сторінка, час, повідомлення).', 'Aan de kant van de site is niets te zien: sessie geldig, geen mislukte acties, gekoppelde diensten in orde. Vraag de gebruiker om een precieze beschrijving (pagina, tijd, melding).'] });
  }
  const volg = { fout: 0, 'let-op': 1, info: 2 };
  return b.sort((x, y) => volg[x.ernst] - volg[y.ernst]);
}

/** Zoek gebruikers op naam of e-mail (minstens 2 tekens). Alleen id, naam, e-mail, foto en status. */
export async function zoekGebruikers(q: string): Promise<GebruikerKort[]> {
  const zoek = q.trim().toLowerCase().slice(0, 80);
  if (zoek.length < 2) return [];
  const lijst = (await db.list<Gebruiker>('users', { limit: 500, nieuwsteEerst: true })).items as Gebruiker[];
  return lijst
    .filter((g) => g && typeof g.id === 'string' && ID_RE.test(g.id) && `${g.email || ''} ${g.name || ''}`.toLowerCase().includes(zoek))
    .slice(0, 8)
    .map((g) => ({ id: g.id, naam: weergaveNaam(g, g.id), email: g.email || '', foto: veiligeFoto(g.picture), status: String(g.status || '') }));
}

async function probeer<T>(f: () => Promise<T>, terug: T): Promise<T> {
  try { return await f(); } catch (e) { console.error('[admin-diagnostiek-gebruiker]', (e as Error).message); return terug; }
}

export async function gebruikerControle(id: string, laatste: Record<string, { stand: Stand } | undefined>, nu = Date.now()): Promise<GebruikerCheck | null> {
  if (!ID_RE.test(id)) return null;
  const [g] = await db.get<Gebruiker>('users', [id]);
  if (!g) return null;
  const sessies = await probeer(async () => ((await db.list<Sessie & { userId: string }>(SESSIE_TABEL, { filter: { userId: id }, limit: 100, nieuwsteEerst: true })).items as unknown as Sessie[]), [] as Sessie[]);
  const actief = sessies.filter((s) => sessieActief(s, nu));
  const regels = await probeer(async () => (await auditLijst({ ownerId: id, van: nu - 7 * DAG, limit: 300 })).items, []);
  const echt = regels.filter((r) => labelVan(r.action).sleutel !== 'overig' || FAIL_RE.test(r.result));
  const dag = echt.filter((r) => r.createdAt >= nu - DAG);
  const mislukt = (r: { result: string }) => FAIL_RE.test(r.result);
  const dienstTelling = new Map<string, { n: number; f: number }>();
  for (const r of dag) {
    const d = String(r.service || '').toLowerCase();
    if (!/^[a-z]{2,12}$/.test(d)) continue;
    const t = dienstTelling.get(d) || { n: 0, f: 0 }; t.n++; if (mislukt(r)) t.f++; dienstTelling.set(d, t);
  }
  const diensten: DienstStand[] = [...dienstTelling.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([d, t]) => {
    const cid = `dienst-${d}`;
    const u = isControleId(cid) ? laatste[cid]?.stand : undefined;
    const n = dienstNaam(d);
    return { dienst: d, naam: [n.uk, n.nl], stand: u ?? 'nooit', acties: t.n, mislukt: t.f };
  });
  const oauth = await probeer(async () => (await sys().query(
    `SELECT client_name, count(*)::int AS n, max(last_used_at) AS laatst FROM app.mcp_oauth_tokens
      WHERE user_id = $1 AND revoked_at IS NULL AND refresh_expires_at > now() GROUP BY client_name ORDER BY n DESC LIMIT 6`, [id])).rows
    .map((r) => ({ client: String(r.client_name).replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 30), n: Number(r.n), laatst: r.laatst ? new Date(r.laatst).getTime() : 0 })), [] as GebruikerCheck['koppelingen']['oauth']);
  const ag = await probeer(async () => (await sys().query(
    `SELECT count(*) FILTER (WHERE status = 'connected')::int AS v, count(*)::int AS t,
            count(*) FILTER (WHERE status = 'connected' AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes'))::int AS stil
       FROM app.agents WHERE user_id = $1 AND revoked_at IS NULL`, [id])).rows[0], { v: 0, t: 0, stil: 0 });
  const mail = await probeer(async () => (await sys().query(
    `SELECT count(*) FILTER (WHERE status = 'failed' AND updated_at > now() - interval '24 hours')::int AS mislukt,
            count(*) FILTER (WHERE (status = 'sending' AND updated_at < now() - interval '15 minutes') OR (status = 'scheduled' AND send_at < now() - interval '15 minutes'))::int AS vast
       FROM app.mail_queue WHERE user_id = $1`, [id])).rows[0], { mislukt: 0, vast: 0 });

  const laatsteActiviteit = Math.max(0, ...sessies.map((s) => Number(s.lastSeenAt) || 0));
  const apparaten = [...new Set(actief.map((s) => [s.os, s.browser].filter(Boolean).join(' / ').slice(0, 40)).filter(Boolean))].slice(0, 5);
  const dagMislukt = dag.filter(mislukt).length;
  const weekMislukt = echt.filter(mislukt).length;
  const bevindingen = beoordeelGebruiker({
    nu, status: String(g.status || ''), sessiesActief: actief.length, sessiesTotaal: sessies.length, laatsteActiviteit,
    dagActies: dag.length, dagMislukt, weekMislukt, oauthActief: oauth.length, mailMislukt: Number(mail.mislukt), mailVast: Number(mail.vast), agentenStil: Number(ag.stil), diensten,
  });
  return {
    nu,
    gebruiker: { id: g.id, naam: weergaveNaam(g, g.id), email: g.email || '', foto: veiligeFoto(g.picture), status: String(g.status || ''), rol: String(g.role || ''), aangemaakt: Number(g.createdAt) || 0 },
    sessies: { actief: actief.length, totaal: sessies.length, laatsteActiviteit, apparaten },
    acties: {
      dag: dag.length, dagMislukt, weekMislukt,
      recent: echt.slice(0, 12).map((r) => { const l = labelVan(r.action); const s = sectieNaam(sectieVan(r.action)); return { t: r.createdAt, label: [l.uk, l.nl] as Tekst, sectie: [s.uk, s.nl] as Tekst, dienst: String(r.service || ''), mislukt: mislukt(r) }; }),
    },
    koppelingen: { oauth, agenten: { verbonden: Number(ag.v), totaal: Number(ag.t) }, mailMislukt: Number(mail.mislukt), mailVast: Number(mail.vast) },
    diensten, bevindingen,
  };
}
