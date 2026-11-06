// ZOEKEN — BRONADAPTERS (Z2, 22.10.2026): van de BESTAANDE opslag/integraties naar het universele ZoekObject
// (shared/zoek-model.ts, contract zoek-API.md). Hier staat alleen de vertaling (rij → object), zuiver en zonder I/O; het
// ophalen staat in backend/zoek/bronnen.ts en gebruikt uitsluitend wat de momentopname al heeft:
//   mail     mail_items_v1 (app.records)                       — backend/mail-zoek-duurzaam.ts persistMailSearchProviderMessages
//   bijlage  Gmail REST messages/{id}?format=full + attachments/{aid} (zelfde aanroepen als backend/google-suite-mail-browser.ts);
//            de tekst komt van Z3 (backend/zoek/inhoud.ts: PDF/Office/archief/OCR)
//   cloud    cloud_items_v1 + storage.read(storagePath)        — backend/cloud-platform.ts
//   drive    google_suite_drive_projection_v1 + Drive export / alt=media — backend/google-suite-browser.ts
//   agenda   google_suite_calendar_events_v1 (Google) + app.agenda_externe_gebeurtenis (ICS/CalDAV, 0076)
//   bord     app.mcp_console_items (taken en notities, 0017/0086) — backend/mcp-console.ts
//   github   ghRepos / ghIssues / ghReadme                     — backend/github-platform.ts
//
// GEHEIMEN: elke tekst gaat door maskeerGeheimen (shared/geheim-patronen.ts) vóór hij in een object komt. Een token in een
// lijst of notitie komt dus nooit als doorzoekbare tekst in app.zoek_objecten; de rest van de zin blijft vindbaar.
import { createHash } from 'node:crypto';
import type { Lade } from '../../shared/ruimte-scheiding';
import type { ZoekObject, ZoekRoute, ZoekSoort } from '../../shared/zoek-model';
import { maskeerGeheimen } from '../../shared/geheim-patronen';
import { formaatVan as formaatVanZ3 } from '../../shared/zoek-formaten';
import { DIEPE_PARAMS, agendaItemId, bordDoel } from '../../shared/zoek-diepe-link';

type Rij = Record<string, unknown>;
export const MAX_TEKST = 200000;
const s = (v: unknown, m = 500) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, m);
const n = (v: unknown) => { const x = typeof v === 'number' ? v : Date.parse(String(v ?? '')); return Number.isFinite(x) ? Math.max(0, x) : 0; };
const lijst = (v: unknown, m = 80) => (Array.isArray(v) ? v.map((x) => s(x, m)).filter(Boolean) : s(v, 400) ? [s(v, 400)] : []);
const rechten = (lade: Lade) => ({ userId: lade.userId, ruimte: lade.ruimte });
export const sha256Hex = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
/** Veilige tekst: geheimen gemaskeerd, begrensd. */
export const veiligeTekst = (v: unknown, m = MAX_TEKST): string => maskeerGeheimen(s(v, m)).tekst;
/** Bestandsformaat (facet): de ene eerlijke lijst van Z3 (shared/zoek-formaten.ts); 'onbekend' → 'overig', niets → ''. */
export function formaatVan(mime: unknown, naam: unknown, kop?: Uint8Array): string {
  if (!mime && !naam) return '';
  const f = formaatVanZ3(mime ? String(mime) : undefined, naam ? String(naam) : undefined, kop);
  return f === 'onbekend' ? 'overig' : f;
}

// ---------------------------------------------------------------- mail
/** ZOEKDIEP-001: de mailpagina opent een bericht met het Gmail-id en kiest de postbus via mail_accounts_v1 (shared/zoek-diepe-link.ts). */
const mailParams = (r: Rij, id: string): Record<string, string> => ({
  [DIEPE_PARAMS.bericht]: s(r.providerMessageId, 300) || id,
  ...(s(r.mailAccountId, 120) ? { [DIEPE_PARAMS.mailAccount]: s(r.mailAccountId, 120) } : {}),
});
export const mailObject = (lade: Lade, r: Rij): ZoekObject => {
  const id = s(r.id, 300), afzender = [s(r.senderName, 200), s(r.senderEmail, 320)].filter(Boolean).join(' · ');
  const tekst = veiligeTekst(r.body, 80000);
  return {
    id, bron: 'mail', soort: 'bericht', titel: s(r.subject, 500) || '(без теми)',
    omschrijving: afzender, tekst, fragmentBron: 'tekst',
    trefwoorden: [...lijst(r.labelIds), s(r.taskTitle, 300), ...lijst(r.attachmentTypes), s(r.senderEmail, 320)].filter(Boolean),
    pad: `${s(r.mailAccountEmail || r.accountEmail || '', 200) || 'Пошта'} › ${s(r.folder || r.mailbox || 'inbox', 60)}`,
    route: { host: 'mail', pad: 'inbox', params: mailParams(r, id) },
    taal: '', formaat: '', bijgewerktOp: n(r.updatedAt) || n(r.receivedAt), aangemaaktOp: n(r.receivedAt) || undefined,
    versie: sha256Hex(`${s(r.subject, 500)}|${afzender}|${tekst}|${lijst(r.labelIds).join(',')}`),
    extra: { afzender: s(r.senderEmail, 320), afzenderNaam: s(r.senderName, 200), bijlagen: Boolean(r.hasAttachments), mailAccountId: s(r.mailAccountId, 120), ontvangenOp: n(r.receivedAt) },
    rechten: rechten(lade),
  };
};

/** Eén bijlage (of één bestand uit een archief in die bijlage). `pad` = pad binnen het archief ('' = de bijlage zelf). */
export const bijlageObject = (lade: Lade, mail: Rij, bijlage: { providerAttachmentId: string; filename: string; contentType: string; partPath?: string; sizeBytes?: number }, inhoud: { pad: string; tekst: string; sha256: string; ocr?: boolean }): ZoekObject => {
  const mailId = s(mail.id, 300);
  const deel = s(bijlage.partPath || bijlage.providerAttachmentId, 120);
  const naam = inhoud.pad ? inhoud.pad.split('/').pop() || inhoud.pad : bijlage.filename;
  return {
    id: `${mailId}:${deel}${inhoud.pad ? `:${s(inhoud.pad, 240)}` : ''}`.slice(0, 700), bron: 'bijlage', soort: 'bijlage',
    titel: s(naam, 500) || 'bijlage', omschrijving: [s(mail.subject, 300), inhoud.pad ? s(bijlage.filename, 200) : s(bijlage.contentType, 120)].filter(Boolean).join(' · '),
    tekst: veiligeTekst(inhoud.tekst), fragmentBron: inhoud.ocr ? 'ocr' : 'bijlage',
    trefwoorden: [s(bijlage.filename, 200), s(mail.senderEmail, 320)].filter(Boolean),
    pad: `Пошта › ${s(mail.subject, 120) || mailId} › ${s(bijlage.filename, 120)}${inhoud.pad ? ` › ${s(inhoud.pad, 160)}` : ''}`,
    route: { host: 'mail', pad: 'inbox', params: { ...mailParams(mail, mailId), [DIEPE_PARAMS.bijlage]: deel } },
    taal: '', formaat: formaatVan(bijlage.contentType, naam), bijgewerktOp: n(mail.updatedAt) || n(mail.receivedAt) || Date.now(),
    versie: inhoud.sha256 || sha256Hex(inhoud.tekst),
    extra: { mailId, bestandsnaam: s(bijlage.filename, 200), mime: s(bijlage.contentType, 120), bytes: Number(bijlage.sizeBytes || 0), ...(inhoud.pad ? { archiefPad: s(inhoud.pad, 300) } : {}), ocr: Boolean(inhoud.ocr) },
    rechten: rechten(lade),
  };
};

// ---------------------------------------------------------------- cloud (eigen opslag)
export const cloudObject = (lade: Lade, r: Rij, inhoud: { pad?: string; tekst?: string; sha256?: string; ocr?: boolean } = {}): ZoekObject => {
  const id = s(r.id, 300), naam = s(r.originalName, 500), mime = s(r.mimeType, 120);
  const eigen = veiligeTekst(r.textContent, 100000), extraTekst = veiligeTekst(inhoud.tekst || '');
  const deel = inhoud.pad ? `${id}:${s(inhoud.pad, 300)}`.slice(0, 700) : id;
  return {
    id: deel, bron: 'cloud', soort: inhoud.pad ? 'bestand' : (r.kind === 'folder' || r.type === 'folder' ? 'map' : 'bestand'),
    titel: inhoud.pad ? s(inhoud.pad.split('/').pop() || inhoud.pad, 500) : (s(r.title, 500) || naam || '(без назви)'),
    omschrijving: s(r.description, 500), tekst: [eigen, extraTekst].filter(Boolean).join('\n').slice(0, MAX_TEKST),
    fragmentBron: inhoud.ocr ? 'ocr' : 'tekst',
    trefwoorden: [naam, ...lijst(r.tags), ...lijst(r.people), mime].filter(Boolean),
    pad: `Хмара › ${s(r.workspaceName || r.workspaceId || '', 120) || 'Файли'}${inhoud.pad ? ` › ${naam || id} › ${s(inhoud.pad, 160)}` : ''}`,
    route: { host: 'cloud', pad: 'search', params: { [DIEPE_PARAMS.item]: id } },
    taal: '', formaat: formaatVan(mime, inhoud.pad || naam), bijgewerktOp: n(r.updatedAt) || n(r.createdAt), aangemaaktOp: n(r.createdAt) || undefined,
    versie: inhoud.sha256 || sha256Hex(`${s(r.title, 500)}|${naam}|${s(r.description, 500)}|${eigen}|${lijst(r.tags).join(',')}`),
    extra: { bestandsnaam: naam, mime, bytes: Number(r.sizeBytes || 0), opslagPad: s(r.storagePath, 300) ? 'ja' : 'nee', ...(inhoud.pad ? { archiefPad: s(inhoud.pad, 300) } : {}), ocr: Boolean(inhoud.ocr) },
    rechten: rechten(lade),
  };
};

// ---------------------------------------------------------------- Google Drive (projectie)
export const driveObject = (lade: Lade, r: Rij, inhoud: { pad?: string; tekst?: string; sha256?: string; ocr?: boolean } = {}): ZoekObject => {
  const id = s(r.id, 300), naam = s(r.name, 500), mime = s(r.mimeType, 200);
  const deel = inhoud.pad ? `${id}:${s(inhoud.pad, 300)}`.slice(0, 700) : id;
  const map = mime === 'application/vnd.google-apps.folder';
  return {
    id: deel, bron: 'drive', soort: map ? 'map' : 'bestand',
    titel: inhoud.pad ? s(inhoud.pad.split('/').pop() || inhoud.pad, 500) : naam || '(без назви)',
    omschrijving: s(r.description, 500), tekst: veiligeTekst(inhoud.tekst || ''), fragmentBron: inhoud.ocr ? 'ocr' : 'tekst',
    trefwoorden: [mime, ...lijst(r.parentIds, 300)].filter(Boolean),
    pad: `Google Drive${inhoud.pad ? ` › ${naam} › ${s(inhoud.pad, 160)}` : ''}`,
    route: { host: 'cloud', pad: 'google', params: { [DIEPE_PARAMS.bestand]: s(r.providerFileId, 300) || id, ...(s(r.principalId, 120) ? { [DIEPE_PARAMS.drivePrincipal]: s(r.principalId, 120) } : {}) } },
    taal: '', formaat: formaatVan(mime, inhoud.pad || naam), bijgewerktOp: n(r.modifiedAt) || n(r.updatedAt), aangemaaktOp: n(r.createdAt) || undefined,
    versie: inhoud.sha256 || sha256Hex(`${naam}|${mime}|${s(r.description, 500)}|${n(r.modifiedAt)}`),
    extra: { mime, bytes: Number(r.size || 0), webViewLink: s(r.webViewLink, 1200), principalId: s(r.principalId, 120), ...(inhoud.pad ? { archiefPad: s(inhoud.pad, 300) } : {}), ocr: Boolean(inhoud.ocr) },
    rechten: rechten(lade),
  };
};

// ---------------------------------------------------------------- agenda
export const agendaGoogleObject = (lade: Lade, r: Rij): ZoekObject => {
  const id = s(r.id, 300);
  return {
    id: `g:${id}`, bron: 'agenda', soort: 'afspraak', titel: s(r.summary, 500) || '(без назви)',
    omschrijving: [s(r.start, 100), s(r.location, 300)].filter(Boolean).join(' · '),
    tekst: veiligeTekst(r.description, 8000), fragmentBron: 'tekst',
    trefwoorden: [s(r.location, 300), ...lijst(r.attendees, 120)].filter(Boolean),
    pad: `Календар › ${s(r.calendarName || r.calendarId || 'Google', 120)}`,
    route: s(r.providerEventId, 1024) ? { host: 'hub', pad: 'calendar', params: { [DIEPE_PARAMS.afspraak]: agendaItemId(s(r.calendarId, 500), s(r.providerEventId, 1024)) } } : { host: 'hub', pad: 'calendar' },
    taal: '', formaat: '', bijgewerktOp: n(r.providerUpdatedAt) || n(r.updatedAt), aangemaaktOp: n(r.createdAt) || undefined,
    versie: sha256Hex(`${s(r.summary, 500)}|${s(r.start, 100)}|${s(r.end, 100)}|${s(r.location, 300)}|${s(r.description, 8000)}`),
    extra: { begin: s(r.start, 100), einde: s(r.end, 100), locatie: s(r.location, 300), bron: 'google' },
    rechten: rechten(lade),
  };
};
/** app.agenda_externe_gebeurtenis (ICS/CalDAV, migratie 0076). */
export const agendaExternObject = (lade: Lade, r: Rij): ZoekObject => ({
  id: `x:${s(r.abonnement_id, 120)}:${s(r.agenda_url, 300)}:${s(r.uid, 250)}`.slice(0, 700), bron: 'agenda', soort: 'afspraak',
  titel: s(r.titel, 300) || '(без назви)', omschrijving: [s(r.begin_waarde, 40), s(r.locatie, 300)].filter(Boolean).join(' · '),
  tekst: veiligeTekst(r.beschrijving, 4000), fragmentBron: 'tekst', trefwoorden: [s(r.locatie, 300)].filter(Boolean),
  pad: 'Календар › ICS/CalDAV', route: { host: 'hub', pad: 'calendar' },
  taal: '', formaat: '', bijgewerktOp: n(r.gewijzigd_op) || n(r.gezien_op),
  versie: sha256Hex(`${s(r.titel, 300)}|${s(r.begin_waarde, 40)}|${s(r.eind_waarde, 40)}|${s(r.locatie, 300)}|${s(r.beschrijving, 4000)}`),
  extra: { begin: s(r.begin_waarde, 40), einde: s(r.eind_waarde, 40), locatie: s(r.locatie, 300), url: s(r.url, 1200), bron: 'extern', abonnement: s(r.abonnement_id, 120) },
  rechten: rechten(lade),
});

// ---------------------------------------------------------------- bord (taken en notities)
export const bordObject = (lade: Lade, r: Rij): ZoekObject => {
  const id = s(r.id, 100), notitie = r.kind === 'note';
  return {
    id, bron: 'bord', soort: notitie ? 'notitie' : 'taak', titel: s(r.title, 160) || (notitie ? '(нотатка)' : '(завдання)'),
    omschrijving: [notitie ? 'нотатка' : 'завдання', s(r.status, 20)].filter(Boolean).join(' · '),
    tekst: veiligeTekst(r.body, 4000), fragmentBron: 'tekst', trefwoorden: [...lijst(r.tags), s(r.status, 20), s(r.author, 40)].filter(Boolean),
    pad: notitie ? 'Мій простір › Нотатки' : 'Мій простір › Завдання',
    route: notitie ? { host: 'hub', pad: 'notes', params: { [DIEPE_PARAMS.item]: id } } : { host: 'mcp', pad: 'board', params: { [DIEPE_PARAMS.doel]: bordDoel(id) } },
    taal: '', formaat: '', bijgewerktOp: n(r.updated_at) || n(r.created_at), aangemaaktOp: n(r.created_at) || undefined,
    versie: sha256Hex(`${s(r.title, 160)}|${s(r.body, 4000)}|${s(r.status, 20)}|${lijst(r.tags).join(',')}`),
    extra: { kind: notitie ? 'note' : 'task', status: s(r.status, 20) },
    rechten: rechten(lade),
  };
};

// ---------------------------------------------------------------- github
const GH_ROUTE = (pad: string, params: Record<string, string>): ZoekRoute => ({ host: 'github', pad, params });
/** shapeRepo + (optioneel) ghReadme uit backend/github-platform.ts. */
export const githubRepoObject = (lade: Lade, repo: Rij, readme = ''): ZoekObject => ({
  id: `repo:${s(repo.fullName, 140)}`, bron: 'github', soort: 'repo', titel: s(repo.fullName, 140),
  omschrijving: [s(repo.description, 300), s(repo.language, 40), repo.private ? 'private' : 'public'].filter(Boolean).join(' · '),
  tekst: veiligeTekst(readme, 20000), fragmentBron: 'tekst', trefwoorden: [...lijst(repo.topics), s(repo.language, 40), s(repo.name, 100)].filter(Boolean),
  pad: 'GitHub › Репозиторії', route: GH_ROUTE('repositories', { repo: s(repo.fullName, 140) }),
  taal: '', formaat: 'md', bijgewerktOp: n(repo.pushedAt) || n(repo.updatedAt),
  versie: sha256Hex(`${s(repo.description, 300)}|${lijst(repo.topics).join(',')}|${readme.slice(0, 20000)}|${n(repo.pushedAt)}`),
  extra: { url: s(repo.url, 200), prive: Boolean(repo.private), taalCode: s(repo.language, 40), sterren: Number(repo.stars || repo.stargazers || 0) },
  rechten: rechten(lade),
});
/** shapeIssue uit backend/github-platform.ts. */
export const githubIssueObject = (lade: Lade, repo: string, i: Rij): ZoekObject => {
  const nr = Number(i.number) || 0, pull = Boolean(i.isPull);
  const labels = Array.isArray(i.labels) ? (i.labels as Rij[]).map((l) => s(typeof l === 'string' ? l : l?.name, 60)).filter(Boolean) : [];
  return {
    id: `${pull ? 'pr' : 'issue'}:${s(repo, 140)}#${nr}`, bron: 'github', soort: pull ? 'pull' : 'issue', titel: s(i.title, 300),
    omschrijving: [`${s(repo, 140)}#${nr}`, s(i.state, 20), s(i.author, 60)].filter(Boolean).join(' · '),
    tekst: veiligeTekst(i.body, 20000), fragmentBron: 'tekst', trefwoorden: [...labels, s(i.author, 60), s(i.state, 20)].filter(Boolean),
    pad: `GitHub › ${s(repo, 140)} › ${pull ? 'Pull requests' : 'Issues'}`, route: GH_ROUTE('repositories', { repo: s(repo, 140), [pull ? 'pr' : 'issue']: String(nr) }),
    taal: '', formaat: '', bijgewerktOp: n(i.updatedAt) || n(i.createdAt),
    versie: sha256Hex(`${s(i.title, 300)}|${s(i.state, 20)}|${s(i.body, 20000)}|${labels.join(',')}|${n(i.updatedAt)}`),
    extra: { url: s(i.url, 200), nummer: nr, staat: s(i.state, 20), auteur: s(i.author, 60), pull },
    rechten: rechten(lade),
  };
};

/** Soort → is dit een «inhoud»-object dat tekst uit bestanden kan dragen (voor OCR/archief-labels in de stand). */
export const INHOUD_SOORTEN: ReadonlySet<ZoekSoort> = new Set<ZoekSoort>(['bestand', 'bijlage']);
