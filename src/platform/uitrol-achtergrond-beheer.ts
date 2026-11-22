// UPD-010: поза-компонентний менеджер фонового завантаження та встановлення оновлень.
// Зберігає стан завантаження поза деревом React (перемикання вкладок у межах admin не обриває процес),
// синхронізує стан між вкладками через BroadcastChannel/localStorage і відстежує серверні процеси
// (завантаження з GitHub та встановлення root) на всіх піддоменах через POST /api/owner/uitrol/achtergrond.
import { useSyncExternalStore } from 'react';
import { api } from './client';
import { foutCode } from './webauthn';
import { naarBase64, type PakketInfo } from './tar-lezen';
import { isLeesfout, leesDeel, leesKop } from '../../shared/bestand-lezen';
import { bestandLeesfoutCode } from '../../shared/foutuitleg';

const meldAfbreking = (context: Record<string, unknown>, payload: Record<string, unknown>) => {
  try {
    void fetch('/api/uitrol/poging/afgebroken', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...context, ...payload }),
    }).catch(() => undefined);
  } catch { /* ігноруємо при закритті вкладки */ }
};

export type AchtergrondRun = {
  id: string;
  versie: string;
  staat: string;
  stap: string;
  sub: string;
  pct: number;
  uk: string;
  nl: string;
  gestart: string;
  bijgewerkt: string;
};

export type AchtergrondServerStand = {
  nu: string;
  actieveVersie: string;
  run: AchtergrondRun | null;
  goedgekeurd: Array<{ id: string; versie: string; beslistOp: string; beslistDoor: string }>;
  lopendeUploads: Array<{ id: string; versie: string; bytes: number; ontvangen: number; pct: number; voorbereider: string; bijgewerktOp: string }>;
  githubBezig: Array<{ id: string; repo: string; tag: string; versie: string; uk: string; nl: string; bijgewerktOp: string }>;
  wachtend: number;
  laatsteWachtendVersie: string;
};

export type LokaleUploadStaat = {
  bestand: File | null;
  soort: any;
  analyse: { info: PakketInfo; sha256: string } | null;
  bezigLezen: boolean;
  bezigUpload: boolean;
  voortgang: number | null;
  verzonden: number;
  grootte: number;
  nieuwId: string;
  versie: string;
  bestandNaam: string;
  voorstelId: string;
  serverCheck: any;
  leesfout: { code: string; procent: number | null; verstuurd: number } | null;
  hervatMeta: { bytes: number; naam: string } | null;
  melding: { ok: boolean; uk: string; nl: string } | null;
};

export type UitrolAchtergrondSnapshot = {
  lokaal: LokaleUploadStaat;
  externLokaal: null | { versie: string; bestandNaam: string; pct: number; verzonden: number; bytes: number; tijd: number };
  server: AchtergrondServerStand | null;
  ingeklapt: boolean;
  verborgenTot: number;
};

const KANAAL_NAAM = 'tsv:uitrol-achtergrond';
const OPSLAG_SLEUTEL = 'tsv:uitrol-achtergrond:v1';
const INGEKLAPT_SLEUTEL = 'tsv:uitrol-band-ingeklapt';
const HERSTEL_SESSIE_SLEUTEL = 'tsv:uitrol-herstel-sessie:v1';
const GEEN_HERHALING = ['STATUS_ONGELDIG', 'NIET_GEVONDEN', 'DATA_ONGELDIG', 'TE_VEEL_DATA', 'GEEN_VOORBEREIDER_GRANT', 'STUK_TE_GROOT'];
const WACHT = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export type UitrolHerstelSessie = {
  voorstelId: string;
  versie: string;
  bestandNaam: string;
  grootte: number;
  verzonden: number;
  voortgang: number;
  bezigUpload: boolean;
  opgeslagenOp: number;
};

export function leesUitrolHerstelSessie(): UitrolHerstelSessie | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(HERSTEL_SESSIE_SLEUTEL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UitrolHerstelSessie;
    if (!parsed || typeof parsed.opgeslagenOp !== 'number') return null;
    if (Date.now() - parsed.opgeslagenOp > 6 * 60 * 60 * 1000) {
      sessionStorage.removeItem(HERSTEL_SESSIE_SLEUTEL);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function wisUitrolHerstelSessie(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(HERSTEL_SESSIE_SLEUTEL);
  } catch { /* приватний режим */ }
}

function leegLokaal(): LokaleUploadStaat {
  return {
    bestand: null,
    soort: null,
    analyse: null,
    bezigLezen: false,
    bezigUpload: false,
    voortgang: null,
    verzonden: 0,
    grootte: 0,
    nieuwId: '',
    versie: '',
    bestandNaam: '',
    voorstelId: '',
    serverCheck: null,
    leesfout: null,
    hervatMeta: null,
    melding: null,
  };
}

function leesIngeklapt(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(INGEKLAPT_SLEUTEL) === '1';
  } catch {
    return false;
  }
}

let snapshot: UitrolAchtergrondSnapshot = {
  lokaal: leegLokaal(),
  externLokaal: null,
  server: null,
  ingeklapt: leesIngeklapt(),
  verborgenTot: 0,
};

let uploadAfbreken = false;
let lopendContext: Record<string, unknown> | null = null;
let kanaal: BroadcastChannel | null = null;
let listenersGeinstalleerd = false;
const luisteraars = new Set<() => void>();

function verwittig() {
  for (const fn of luisteraars) {
    try { fn(); } catch { /* ізольована помилка слухача */ }
  }
}

function zetSnapshot(patch: Partial<UitrolAchtergrondSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  verwittig();
}

export function zetLokaalDeel(patch: Partial<LokaleUploadStaat>) {
  snapshot = { ...snapshot, lokaal: { ...snapshot.lokaal, ...patch } };
  verwittig();
}

export function wisLokaleUpload() {
  uploadAfbreken = false;
  snapshot = { ...snapshot, lokaal: leegLokaal() };
  wisUitrolHerstelSessie();
  publiceerLokaalSignaal(null);
  verwittig();
}

export function vraagUploadAfbreken() {
  uploadAfbreken = true;
}

export function zetBandIngeklapt(waarde: boolean) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (waarde) sessionStorage.setItem(INGEKLAPT_SLEUTEL, '1');
      else sessionStorage.removeItem(INGEKLAPT_SLEUTEL);
    }
  } catch { /* приватний режим */ }
  zetSnapshot({ ingeklapt: waarde });
}

export function verbergBandEven(ms = 60_000) {
  zetSnapshot({ verborgenTot: Date.now() + ms });
}

export function meldLokaleUploadVoortgang(
  data: null | { versie: string; bestandNaam: string; pct: number; verzonden: number; bytes: number },
) {
  zorgVoorLuisteraars();
  publiceerLokaalSignaal(data ? { ...data, tijd: Date.now() } : null);
}

function publiceerLokaalSignaal(data: UitrolAchtergrondSnapshot['externLokaal']) {
  if (typeof window === 'undefined') return;
  try {
    kanaal?.postMessage({ soort: 'lokaal', data });
  } catch { /* канал недоступний */ }
  try {
    if (data) localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(data));
    else localStorage.removeItem(OPSLAG_SLEUTEL);
  } catch { /* сховище недоступне */ }
}

function leesExternLokaal(): UitrolAchtergrondSnapshot['externLokaal'] {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OPSLAG_SLEUTEL);
    if (!raw) return null;
    const obj = JSON.parse(raw) as UitrolAchtergrondSnapshot['externLokaal'];
    if (!obj || typeof obj.tijd !== 'number' || Date.now() - obj.tijd > 15_000) return null;
    return obj;
  } catch {
    return null;
  }
}

function zorgVoorLuisteraars() {
  if (listenersGeinstalleerd || typeof window === 'undefined') return;
  listenersGeinstalleerd = true;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      kanaal = new BroadcastChannel(KANAAL_NAAM);
      kanaal.onmessage = (ev) => {
        const msg = ev.data as { soort?: string; data?: UitrolAchtergrondSnapshot['externLokaal'] } | null;
        if (msg?.soort === 'lokaal') {
          zetSnapshot({ externLokaal: msg.data || null });
        }
      };
    } catch {
      kanaal = null;
    }
  }

  window.addEventListener('storage', (ev) => {
    if (ev.key === OPSLAG_SLEUTEL) {
      zetSnapshot({ externLokaal: leesExternLokaal() });
    }
  });

  // Застерігаємо лише тоді, коли саме ця вкладка читає файл із диска.
  window.addEventListener('beforeunload', (ev) => {
    if (snapshot.lokaal.bezigUpload) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  window.addEventListener('pagehide', () => {
    const l = snapshot.lokaal;
    if (l.bestandNaam || l.voorstelId || l.bezigUpload) {
      try {
        if (typeof sessionStorage !== 'undefined') {
          const sessie: UitrolHerstelSessie = {
            voorstelId: l.voorstelId,
            versie: l.versie,
            bestandNaam: l.bestandNaam,
            grootte: l.grootte,
            verzonden: l.verzonden,
            voortgang: l.voortgang ?? 0,
            bezigUpload: l.bezigUpload,
            opgeslagenOp: Date.now(),
          };
          sessionStorage.setItem(HERSTEL_SESSIE_SLEUTEL, JSON.stringify(sessie));
        }
      } catch { /* приватний режим */ }
    }
    if (!l.bezigUpload || !lopendContext) return;
    meldAfbreking(lopendContext, {
      etappe: 'uploaden',
      code: '',
      voorstelId: l.voorstelId,
      versie: l.versie,
      sha256: l.analyse?.sha256 || '',
      bytes: l.grootte,
      verstuurd: l.verzonden,
      bestand: l.bestandNaam,
    });
    // UPD-012: не стираємо локальний сигнал при згортанні вкладки, щоб після повернення
    // з Telegram чи іншої програми стан відновлення залишався доступним.
  });
}

export function getUitrolAchtergrondSnapshot(): UitrolAchtergrondSnapshot {
  return snapshot;
}

export function abonneerUitrolAchtergrond(fn: () => void): () => void {
  zorgVoorLuisteraars();
  luisteraars.add(fn);
  return () => { luisteraars.delete(fn); };
}

export function useUitrolAchtergrond(): UitrolAchtergrondSnapshot {
  return useSyncExternalStore(
    abonneerUitrolAchtergrond,
    getUitrolAchtergrondSnapshot,
    getUitrolAchtergrondSnapshot,
  );
}

/** Визначає поточну службу за іменем вузла, щоб запит POST /api/owner/uitrol/achtergrond працював на всіх піддоменах. */
export function huidigeDienstUitHost(hostname: string): string {
  const h = String(hostname || '').toLowerCase();
  if (h.startsWith('admin.')) return 'admin';
  if (h.startsWith('mail.')) return 'mail';
  if (h.startsWith('ai.')) return 'ai';
  if (h.startsWith('cloud.')) return 'cloud';
  if (h.startsWith('id.')) return 'identity';
  if (h.startsWith('mcp.')) return 'mcp';
  return 'hub';
}

export function heeftActiefUitrolProces(s: UitrolAchtergrondSnapshot): boolean {
  if (s.lokaal.bezigUpload) return true;
  if (s.externLokaal && Date.now() - s.externLokaal.tijd <= 15_000) return true;
  const srv = s.server;
  if (!srv) return false;
  if (srv.run && srv.run.staat === 'bezig') return true;
  // Grok: hub.tarasevych.com, 22.11.2026: een onvolledig antwoord (oude server, proxy, proefomgeving) gaf
  // «Cannot read properties of undefined (reading 'length')» in elke pagina; ontbrekende lijsten tellen als leeg.
  if ((srv.goedgekeurd?.length ?? 0) > 0) return true;
  if ((srv.lopendeUploads?.length ?? 0) > 0) return true;
  if ((srv.githubBezig?.length ?? 0) > 0) return true;
  return false;
}

let pollStop = false;
let pollActief = false;
let pollTimer = 0;
let pollVerboden = false;

export async function verversServerAchtergrondStand(): Promise<AchtergrondServerStand | null> {
  if (typeof window === 'undefined' || pollVerboden) return null;
  try {
    const service = huidigeDienstUitHost(window.location.hostname);
    const res = await fetch('/api/owner/uitrol/achtergrond', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, sourceOrigin: window.location.origin }),
    });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      pollVerboden = true;
      zetSnapshot({ server: null });
      return null;
    }
    if (!res.ok) return snapshot.server;
    const data = (await res.json()) as AchtergrondServerStand;
    zetSnapshot({ server: data, externLokaal: leesExternLokaal() });
    return data;
  } catch {
    return snapshot.server;
  }
}

/** Запускає єдиний цикл фонового відстеження оновлень на поточній сторінці. */
export function startUitrolAchtergrondPolling(): () => void {
  zorgVoorLuisteraars();
  if (pollActief || typeof window === 'undefined') return () => undefined;
  pollActief = true;
  pollStop = false;
  pollVerboden = false;

  const plan = () => {
    if (pollStop || pollVerboden) return;
    const snel = heeftActiefUitrolProces(snapshot);
    const ms = snel ? 4_000 : (document.hidden ? 90_000 : 45_000);
    pollTimer = window.setTimeout(async () => {
      if (pollStop || pollVerboden) return;
      if (!document.hidden || heeftActiefUitrolProces(snapshot)) {
        await verversServerAchtergrondStand();
      }
      plan();
    }, ms);
  };

  const opZicht = () => {
    if (!document.hidden && !pollVerboden) {
      window.clearTimeout(pollTimer);
      void verversServerAchtergrondStand().finally(plan);
    }
  };
  document.addEventListener('visibilitychange', opZicht);
  void verversServerAchtergrondStand().finally(plan);

  return () => {
    pollStop = true;
    pollActief = false;
    window.clearTimeout(pollTimer);
    document.removeEventListener('visibilitychange', opZicht);
  };
}

async function stuurStuk(context: Record<string, unknown>, id: string, offset: number, deel: Uint8Array): Promise<number> {
  for (let poging = 1; ; poging++) {
    try {
      const r = (await api.post('/api/uitrol/voorstel/stuk', { ...context, id, offset, data: naarBase64(deel) })).data as { ontvangen: number };
      return Number(r.ontvangen);
    } catch (e) {
      const code = foutCode(e);
      if (code === 'OFFSET_ONJUIST') {
        const st = (await api.post('/api/uitrol/voorstel/status', { ...context, id })).data as { voorstellen: Array<{ id: string; ontvangen: number }> };
        const n = st.voorstellen.find((v) => v.id === id)?.ontvangen;
        if (typeof n === 'number') return n;
      }
      if (poging >= 5 || GEEN_HERHALING.includes(code)) throw e;
      await WACHT(1000 * 2 ** (poging - 1));
    }
  }
}

/**
 * Виконує завантаження вибраного .tar.gz поза життєвим циклом компонента Upload.
 * Якщо власник перемикається на іншу вкладку адмінки, цикл триває далі без обриву.
 */
export async function voerLokaleUploadUit(params: {
  lang: 'uk' | 'nl';
  context: Record<string, unknown>;
  bestand: File;
  analyse: { info: PakketInfo; sha256: string };
  maxStukLimiet: number;
  ikId: string;
  heeftEigenGrant: boolean;
  hervatbaar?: { id: string; ontvangen?: number } | null;
  onVoltooid?: (id: string) => void;
  onVernieuw?: () => Promise<void>;
}): Promise<{ ok: boolean; geannuleerd?: boolean; id?: string; uk: string; nl: string }> {
  zorgVoorLuisteraars();
  const { lang, context, bestand: f, analyse: a, maxStukLimiet, ikId, heeftEigenGrant, hervatbaar, onVoltooid, onVernieuw } = params;
  uploadAfbreken = false;
  lopendContext = context;
  zetLokaalDeel({
    bezigUpload: true,
    serverCheck: null,
    leesfout: null,
    melding: null,
    versie: a.info.versie,
    bestandNaam: f.name,
    grootte: f.size,
  });

  try {
    try {
      await leesKop(f, 512);
    } catch (e) {
      if (!isLeesfout(e)) throw e;
      const code = bestandLeesfoutCode(e);
      const procent = hervatbaar && f.size ? Math.round(((hervatbaar.ontvangen || 0) / f.size) * 100) : null;
      zetLokaalDeel({ leesfout: { code, procent, verstuurd: hervatbaar?.ontvangen || 0 } });
      meldAfbreking(context, { etappe: 'lezen', code, voorstelId: hervatbaar?.id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: hervatbaar?.ontvangen || 0, bestand: f.name });
      throw e;
    }

    if (!heeftEigenGrant) {
      await api.post('/api/owner/uitrol/voorbereiders/toevoegen', {
        ...context,
        soort: 'account',
        onderwerp: ikId,
        dagen: 1,
        label: lang === 'uk' ? 'Власник — з пристрою' : 'Eigenaar — vanaf apparaat',
      });
    }

    let id: string;
    let offset: number;
    let maxStuk: number;
    if (hervatbaar) {
      id = hervatbaar.id;
      offset = hervatbaar.ontvangen || 0;
      maxStuk = maxStukLimiet;
    } else {
      let begin: { id: string; maxStuk: number };
      try {
        begin = (await api.post('/api/uitrol/voorstel/begin', {
          ...context,
          version: a.info.versie,
          bytes: f.size,
          sha256: a.sha256,
          commit: a.info.commit || undefined,
          changelog: a.info.samenvatting.slice(0, 8000),
          tests: a.info.tests ? { geslaagd: a.info.tests.geslaagd, mislukt: a.info.tests.mislukt, samenvatting: a.info.tests.samenvatting } : {},
        })).data as { id: string; maxStuk: number };
      } catch (e) {
        meldAfbreking(context, { etappe: 'begin', code: foutCode(e) || '', versie: a.info.versie, sha256: a.sha256, bytes: f.size, bestand: f.name });
        throw e;
      }
      id = begin.id;
      offset = 0;
      maxStuk = begin.maxStuk || maxStukLimiet;
    }

    const stuk = Math.min(maxStuk, maxStukLimiet);
    const startPct = f.size > 0 ? Math.round((offset / f.size) * 100) : 0;
    zetLokaalDeel({ voorstelId: id, voortgang: startPct, verzonden: offset });
    publiceerLokaalSignaal({ versie: a.info.versie, bestandNaam: f.name, pct: startPct, verzonden: offset, bytes: f.size, tijd: Date.now() });

    while (offset < f.size) {
      let deel: Uint8Array;
      try {
        deel = await leesDeel(f, offset, Math.min(f.size, offset + stuk));
      } catch (e) {
        if (!isLeesfout(e)) throw e;
        const code = bestandLeesfoutCode(e);
        zetLokaalDeel({ leesfout: { code, procent: Math.round((offset / f.size) * 100), verstuurd: offset } });
        await onVernieuw?.();
        meldAfbreking(context, { etappe: 'uploaden', code, voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: offset, bestand: f.name });
        throw e;
      }

      if (uploadAfbreken) {
        uploadAfbreken = false;
        const pct = Math.round((offset / f.size) * 100);
        meldAfbreking(context, { etappe: 'uploaden', code: 'GEANNULEERD', voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: offset, bestand: f.name });
        try { await api.post('/api/uitrol/voorstel/annuleren', { ...context, id }); } catch { /* сервер прибере сам */ }
        wisLokaleUpload();
        await onVernieuw?.();
        return {
          ok: true,
          geannuleerd: true,
          uk: `Завантаження ${a.info.versie} скасовано на ${pct} %. На сервері нічого не лишилося.`,
          nl: `Upload van ${a.info.versie} geannuleerd bij ${pct} %. Er bleef niets op de server achter.`,
        };
      }

      try {
        offset = await stuurStuk(context, id, offset, deel);
      } catch (e) {
        meldAfbreking(context, { etappe: 'uploaden', code: foutCode(e) || '', voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: offset, bestand: f.name });
        await onVernieuw?.();
        throw new Error(`UPLOAD_ONDERBROKEN|${foutCode(e) || 'ONBEKEND'}|${Math.round((offset / f.size) * 100)}`);
      }

      const pct = Math.round((offset / f.size) * 100);
      zetLokaalDeel({ voortgang: pct, verzonden: offset });
      publiceerLokaalSignaal({ versie: a.info.versie, bestandNaam: f.name, pct, verzonden: offset, bytes: f.size, tijd: Date.now() });
    }

    let kl: { status: string; voorcontrole?: unknown };
    try {
      kl = (await api.post('/api/uitrol/voorstel/klaar', { ...context, id })).data as { status: string; voorcontrole?: unknown };
    } catch (e) {
      meldAfbreking(context, { etappe: 'klaar', code: foutCode(e) || '', voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: f.size, bestand: f.name });
      throw e;
    }

    if (kl.status === 'afgebroken') {
      zetLokaalDeel({ serverCheck: kl.voorcontrole || null });
      meldAfbreking(context, { etappe: 'voorcontrole', code: 'VOORCONTROLE_MISLUKT', voorstelId: id, versie: a.info.versie, sha256: a.sha256, bytes: f.size, verstuurd: f.size, bestand: f.name });
      await onVernieuw?.();
      throw new Error('VOORCONTROLE_MISLUKT');
    }

    const okMelding = {
      ok: true,
      uk: `Пакет ${a.info.versie} завантажено й перевірено сайтом. Він нічого не встановлює, доки ви не схвалите його passkey.`,
      nl: `Pakket ${a.info.versie} geüpload en door de site gecontroleerd. Het installeert niets tot u het met uw passkey goedkeurt.`,
    };
    zetLokaalDeel({ nieuwId: id, melding: okMelding });
    onVoltooid?.(id);
    await onVernieuw?.();
    void verversServerAchtergrondStand();
    return { ok: true, id, uk: okMelding.uk, nl: okMelding.nl };
  } finally {
    lopendContext = null;
    zetLokaalDeel({ bezigUpload: false, voortgang: null });
    publiceerLokaalSignaal(null);
  }
}

/** Запускає серверне фонове завантаження випуску з GitHub (триває на сервері навіть після переходу на інший піддомен). */
export async function startGithubAchtergrondUpload(
  context: Record<string, unknown>,
  invoer: { repo?: string; tag?: string },
): Promise<{ ok: boolean; ontvangstId?: string; repo?: string; tag?: string }> {
  const res = await api.post('/api/owner/uitrol/github/ophalen', {
    ...context,
    repo: invoer.repo?.trim() || undefined,
    tag: invoer.tag?.trim() || undefined,
    achtergrond: true,
  });
  void verversServerAchtergrondStand();
  return res.data as { ok: boolean; ontvangstId?: string; repo?: string; tag?: string };
}
