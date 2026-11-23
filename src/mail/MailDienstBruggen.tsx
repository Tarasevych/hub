// Міжслужбові мости Пошти у панелі відкритого листа та переглядачі вкладень (CONSOL-001 / Віха M3, 23.11.2026).
// З'єднує відкритий лист або вкладення з Нотатками (`notities-vnext`), Завданнями простору й картотекою звірки (`taken` / `afstemming`),
// Календарем (`agenda`) та Карткою клієнта (`klantrelatiebeheer` / `klanten`) через захищені серверні маршрути без витоку приватного тексту в рядок адреси.
// Усі підписи зібрані в константному словнику MAIL_BRUG_TEKSTEN (захист стабільного каталогу shared/zoek-ui-knoppen.generated.ts).
// Dienstbruggen vanuit het geopende bericht naar Notities, Taken/Afstemming, Agenda en Klantkaart zonder privégegevens in de adresbalk.

import { BriefcaseBusiness, CalendarPlus, CheckCircle2, ExternalLink, FileText, GitPullRequestArrow, ListTodo, LoaderCircle, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useVlag } from '../functievlag-lezen';
import type { MailThreadMessage } from '../MailGesprekInhoud';
import { api } from '../platform/client';
import { adresVan, naamVan } from './gesprek-context';
import type { IcsBron } from './ics-gebeurtenissen';
import type { AfspraakVoorstel } from './ContextPaneel';
import { voorstelUit, type WatNodigUitkomst } from './WatNodigBlok';

export const MAIL_BRUGGEN_VLAG = 'mail-dienstbruggen-v1';
export const KLANTRELATIE_VLAG = 'klantrelatiebeheer-v1';

type Taal = 'uk' | 'nl';

export const MAIL_BRUG_TEKSTEN = {
  groepLabel: {
    uk: 'Міжслужбові дії з листа',
    nl: 'Dienstbruggen vanuit bericht',
  },
  naarNotities: {
    uk: 'У Нотатки',
    nl: 'Naar Notities',
  },
  naarNotitiesUitleg: {
    uk: 'Зберегти витяг відкритого листа в Нотатки цього простору без передавання тексту через рядок адреси',
    nl: 'Sla een uittreksel van dit bericht op in Notities binnen dezelfde ruimte zonder tekst in de adresbalk',
  },
  naarTakenAfstemming: {
    uk: 'У Завдання / Звірку',
    nl: 'Naar Taken / Afstemming',
  },
  naarTakenUitleg: {
    uk: 'Створити завдання простору за листом або перейти до картотеки узгодження',
    nl: 'Maak een ruimtetaak op basis van dit bericht of open het afstemmingsoverzicht',
  },
  naarAfstemmingKnop: {
    uk: 'Картотека звірки',
    nl: 'Afstemming openen',
  },
  naarAgenda: {
    uk: 'До Календаря',
    nl: 'Naar Agenda',
  },
  naarAgendaUitleg: {
    uk: 'Створити подію в Календарі за листом без приватного тексту в рядку адреси',
    nl: 'Maak een agenda-afspraak op basis van dit bericht zonder privégegevens in de adresbalk',
  },
  klantkaart: {
    uk: 'Картка клієнта',
    nl: 'Klantkaart',
  },
  klantkaartUitleg: {
    uk: 'Відкрити або створити зашифровану картку відправника в службі взаємин із клієнтами',
    nl: 'Open of maak een versleutelde klantkaart van deze afzender in Klantrelatiebeheer',
  },
  bezig: {
    uk: 'Виконуємо дію в межах вашого простору…',
    nl: 'Handeling uitvoeren binnen uw ruimte…',
  },
  notitieKlaar: {
    uk: 'Нотатку збережено у вашому просторі.',
    nl: 'Notitie opgeslagen in uw ruimte.',
  },
  notitieOpenen: {
    uk: 'Відкрити нотатку',
    nl: 'Notitie openen',
  },
  taakKlaar: {
    uk: 'Завдання створено на дошці простору.',
    nl: 'Taak aangemaakt op het ruimtebord.',
  },
  taakOpenen: {
    uk: 'Відкрити завдання',
    nl: 'Taak openen',
  },
  agendaKlaar: {
    uk: 'Подію додано до Календаря.',
    nl: 'Afspraak toegevoegd aan de Agenda.',
  },
  agendaOpenen: {
    uk: 'Відкрити Календар',
    nl: 'Agenda openen',
  },
  klantKlaarBestaand: {
    uk: 'Контакт зафіксовано в наявній картці клієнта.',
    nl: 'Contactmoment toegevoegd aan de bestaande klantkaart.',
  },
  klantKlaarNieuw: {
    uk: 'Створено нову зашифровану картку клієнта.',
    nl: 'Nieuwe versleutelde klantkaart aangemaakt.',
  },
  klantOpenen: {
    uk: 'Відкрити картку клієнта',
    nl: 'Klantkaart openen',
  },
  kluisOntgrendelen: {
    uk: 'Розблокувати сховище ключів',
    nl: 'Sleutelkluis ontgrendelen',
  },
  klantenOverzicht: {
    uk: 'Огляд клієнтів',
    nl: 'Klantenoverzicht',
  },
  foutAlgemeen: {
    uk: 'Не вдалося виконати міжслужбову дію. Перевірте сеанс і дозволи простору.',
    nl: 'De dienstbrug kon niet worden uitgevoerd. Controleer uw sessie en ruimterechten.',
  },
  gekoppeldeItems: {
    uk: 'Пов’язані записи цього листа',
    nl: 'Gekoppelde items bij dit bericht',
  },
  soortLabel: {
    notitie: { uk: 'Нотатка', nl: 'Notitie' },
    taak: { uk: 'Завдання', nl: 'Taak' },
    afstemming: { uk: 'Звірка', nl: 'Afstemming' },
    agenda: { uk: 'Календар', nl: 'Agenda' },
    klant: { uk: 'Клієнт', nl: 'Klant' },
  },
} as const;

export type NotitieUitMailInvoer = {
  bronSoort: 'bericht' | 'bijlage';
  accountId: string;
  messageId: string;
  bijlageId?: string;
  titel: string;
  inhoud: string;
  etiketten?: string[];
  sleutel?: string;
};

export type NotitieUitMailUitkomst =
  | { ok: true; id: string; al: boolean; href: string }
  | { ok: false; fout: string; uitlegUk?: string; uitlegNl?: string };

export async function maakNotitieUitMail(
  context: Record<string, unknown>,
  invoer: NotitieUitMailInvoer,
): Promise<NotitieUitMailUitkomst> {
  try {
    const res = await api.post('/api/owner/mail/bruggen/notitie', { ...context, ...invoer });
    const data = (res.data || {}) as Record<string, unknown>;
    if (data.ok === true && typeof data.id === 'string' && typeof data.href === 'string') {
      return { ok: true, id: data.id, al: Boolean(data.al), href: data.href };
    }
    return { ok: false, fout: String(data.error || 'MAIL_BRUG_FOUT') };
  } catch (err) {
    const resp = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
    const uitleg = resp?.uitleg && typeof resp.uitleg === 'object' ? (resp.uitleg as { uk?: string; nl?: string }) : undefined;
    return {
      ok: false,
      fout: String(resp?.error || 'MAIL_BRUG_NETWERK'),
      uitlegUk: uitleg?.uk,
      uitlegNl: uitleg?.nl,
    };
  }
}

export type TaakUitMailInvoer = {
  doel?: 'taak' | 'afstemming';
  accountId: string;
  messageId: string;
  titel: string;
  beschrijving?: string;
  termijn?: string;
  sleutel?: string;
};

export type TaakUitMailUitkomst =
  | { ok: true; doel: 'taak' | 'afstemming'; id?: string; href: string; takenHref?: string; afstemmingHref?: string }
  | { ok: false; fout: string; uitlegUk?: string; uitlegNl?: string };

export async function maakTaakUitMail(
  context: Record<string, unknown>,
  invoer: TaakUitMailInvoer,
): Promise<TaakUitMailUitkomst> {
  try {
    const res = await api.post('/api/owner/mail/bruggen/taak', { ...context, ...invoer });
    const data = (res.data || {}) as Record<string, unknown>;
    if (data.ok === true && typeof data.href === 'string') {
      return {
        ok: true,
        doel: data.doel === 'afstemming' ? 'afstemming' : 'taak',
        id: typeof data.id === 'string' ? data.id : undefined,
        href: data.href,
        takenHref: typeof data.takenHref === 'string' ? data.takenHref : undefined,
        afstemmingHref: typeof data.afstemmingHref === 'string' ? data.afstemmingHref : undefined,
      };
    }
    return { ok: false, fout: String(data.error || 'MAIL_BRUG_FOUT') };
  } catch (err) {
    const resp = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
    const uitleg = resp?.uitleg && typeof resp.uitleg === 'object' ? (resp.uitleg as { uk?: string; nl?: string }) : undefined;
    return {
      ok: false,
      fout: String(resp?.error || 'MAIL_BRUG_NETWERK'),
      uitlegUk: uitleg?.uk,
      uitlegNl: uitleg?.nl,
    };
  }
}

export type AgendaUitMailInvoer = {
  accountId: string;
  messageId: string;
  titel: string;
  datum: string;
  beginTijd?: string;
  eindTijd?: string;
  plaats?: string;
  beschrijving?: string;
  tijdzone?: string;
  sleutel?: string;
};

export type AgendaUitMailUitkomst =
  | { ok: true; id: string; href: string }
  | { ok: false; reden: string; agendaHref?: string; uitlegUk?: string; uitlegNl?: string; uitbreidingNodig?: boolean };

export async function maakAgendaUitMail(
  context: Record<string, unknown>,
  invoer: AgendaUitMailInvoer,
): Promise<AgendaUitMailUitkomst> {
  try {
    const res = await api.post('/api/owner/mail/bruggen/agenda', { ...context, ...invoer });
    const data = (res.data || {}) as Record<string, unknown>;
    if (data.ok === true && typeof data.id === 'string' && typeof data.href === 'string') {
      return { ok: true, id: data.id, href: data.href };
    }
    return {
      ok: false,
      reden: String(data.reden || data.error || 'AGENDA_NIET_BESCHIKBAAR'),
      agendaHref: typeof data.agendaHref === 'string' ? data.agendaHref : undefined,
      uitlegUk: typeof data.uitlegUk === 'string' ? data.uitlegUk : undefined,
      uitlegNl: typeof data.uitlegNl === 'string' ? data.uitlegNl : undefined,
      uitbreidingNodig: Boolean(data.uitbreidingNodig),
    };
  } catch (err) {
    const resp = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
    const uitleg = resp?.uitleg && typeof resp.uitleg === 'object' ? (resp.uitleg as { uk?: string; nl?: string }) : undefined;
    return {
      ok: false,
      reden: String(resp?.error || 'MAIL_BRUG_NETWERK'),
      uitlegUk: uitleg?.uk,
      uitlegNl: uitleg?.nl,
    };
  }
}

export type KlantkaartUitMailInvoer = {
  accountId: string;
  messageId: string;
  naam: string;
  mail: string;
  organisatie?: string;
  onderwerp?: string;
  notitieTekst?: string;
  sleutel?: string;
};

export type KlantkaartUitMailUitkomst =
  | { ok: true; id: string; bestaand: boolean; href: string }
  | { ok: false; fout: string; kluisGesloten?: boolean; ontgrendelHref?: string; overzichtHref?: string; uitlegUk?: string; uitlegNl?: string };

export async function openOfMaakKlantkaartUitMail(
  context: Record<string, unknown>,
  invoer: KlantkaartUitMailInvoer,
): Promise<KlantkaartUitMailUitkomst> {
  try {
    const res = await api.post('/api/owner/mail/bruggen/klantkaart', { ...context, ...invoer });
    const data = (res.data || {}) as Record<string, unknown>;
    if (data.ok === true && typeof data.id === 'string' && typeof data.href === 'string') {
      return { ok: true, id: data.id, bestaand: Boolean(data.bestaand), href: data.href };
    }
    return { ok: false, fout: String(data.error || 'KLANT_BRUG_FOUT') };
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const resp = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
    if (status === 423 || resp?.error === 'SLEUTELKLUIS_GESLOTEN' || resp?.error === 'KLANT_SLEUTELKLUIS_NODIG') {
      return {
        ok: false,
        fout: String(resp?.error || 'SLEUTELKLUIS_GESLOTEN'),
        kluisGesloten: true,
        ontgrendelHref: typeof resp?.ontgrendelHref === 'string' ? resp.ontgrendelHref : undefined,
        overzichtHref: typeof resp?.overzichtHref === 'string' ? resp.overzichtHref : undefined,
        uitlegUk: typeof resp?.uitlegUk === 'string' ? resp.uitlegUk : undefined,
        uitlegNl: typeof resp?.uitlegNl === 'string' ? resp.uitlegNl : undefined,
      };
    }
    const uitleg = resp?.uitleg && typeof resp.uitleg === 'object' ? (resp.uitleg as { uk?: string; nl?: string }) : undefined;
    return {
      ok: false,
      fout: String(resp?.error || 'KLANT_BRUG_NETWERK'),
      uitlegUk: uitleg?.uk,
      uitlegNl: uitleg?.nl,
    };
  }
}

export function bouwBijlageNotitieInhoud(invoer: {
  taal: Taal;
  bestandsnaam: string;
  contentType: string;
  grootteTekst: string;
  onderwerp?: string;
  afzender?: string;
  uittreksel?: string;
}): { titel: string; inhoud: string } {
  const schoonNaam = String(invoer.bestandsnaam || '').trim() || (invoer.taal === 'nl' ? 'Bijlage' : 'Вкладення');
  const titel = invoer.onderwerp?.trim()
    ? `${schoonNaam} · ${invoer.onderwerp.trim()}`.slice(0, 260)
    : schoonNaam.slice(0, 260);
  const regels: string[] = [];
  if (invoer.taal === 'nl') {
    regels.push(`**Bijlage:** ${schoonNaam}`);
    if (invoer.contentType) regels.push(`**Formaat:** ${invoer.contentType}`);
    if (invoer.grootteTekst) regels.push(`**Grootte:** ${invoer.grootteTekst}`);
    if (invoer.onderwerp?.trim()) regels.push(`**Bericht:** ${invoer.onderwerp.trim()}`);
    if (invoer.afzender?.trim()) regels.push(`**Afzender:** ${invoer.afzender.trim()}`);
  } else {
    regels.push(`**Вкладення:** ${schoonNaam}`);
    if (invoer.contentType) regels.push(`**Тип файла:** ${invoer.contentType}`);
    if (invoer.grootteTekst) regels.push(`**Розмір:** ${invoer.grootteTekst}`);
    if (invoer.onderwerp?.trim()) regels.push(`**Лист:** ${invoer.onderwerp.trim()}`);
    if (invoer.afzender?.trim()) regels.push(`**Відправник:** ${invoer.afzender.trim()}`);
  }
  const uittreksel = String(invoer.uittreksel || '').replace(/\u0000/g, '').trim().slice(0, 12_000);
  if (uittreksel) {
    regels.push('', '---', '', uittreksel);
  }
  return { titel, inhoud: regels.join('\n') };
}

type GekoppeldeRij = {
  sleutel: string;
  doelSoort: 'notitie' | 'taak' | 'afstemming' | 'agenda' | 'klant';
  doelId: string;
  href: string;
};

type StatusMelding = {
  aard: 'ok' | 'let-op' | 'fout';
  tekst: string;
  primairHref?: string;
  primairLabel?: string;
  secundairHref?: string;
  secundairLabel?: string;
};

export type MailDienstBruggenProps = {
  lang: Taal;
  variant: 'taken' | 'afzender';
  bron: IcsBron;
  bericht?: MailThreadMessage | null;
  afzenderBrief?: MailThreadMessage | null;
  watNodig?: WatNodigUitkomst | null;
  onAfspraak?: (voorstel: AfspraakVoorstel | null) => void;
  klantVlagAan?: boolean;
  bruggenVlagAan?: boolean;
};

function lokaleTijdzone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels';
  } catch {
    return 'Europe/Brussels';
  }
}

function korteUittrekselUitBericht(b?: MailThreadMessage | null): string {
  if (!b) return '';
  const ruw = String(b.plainText || b.snippet || '').replace(/\u0000/g, '').trim();
  return ruw.slice(0, 6000);
}

export default function MailDienstBruggen(p: MailDienstBruggenProps) {
  const vlagKlant = useVlag(KLANTRELATIE_VLAG, false);
  const vlagBruggen = useVlag(MAIL_BRUGGEN_VLAG, false);
  const klantAan = p.klantVlagAan ?? vlagKlant;
  const bruggenAan = p.bruggenVlagAan ?? vlagBruggen;

  const [bezigActie, setBezigActie] = useState<'' | 'notitie' | 'taak' | 'afstemming' | 'agenda' | 'klant'>('');
  const [status, setStatus] = useState<StatusMelding | null>(null);
  const [koppelingen, setKoppelingen] = useState<GekoppeldeRij[]>([]);

  const bericht = p.bericht || p.afzenderBrief || null;
  const afzenderBron = p.afzenderBrief || bericht;
  const accountId = String(p.bron?.accountId || '');
  const messageId = String(bericht?.id || '');

  useEffect(() => {
    setStatus(null);
    setBezigActie('');
  }, [accountId, messageId]);

  useEffect(() => {
    if (p.variant !== 'taken' || !bruggenAan || !accountId || !messageId) {
      setKoppelingen([]);
      return;
    }
    let actief = true;
    void api
      .post('/api/owner/mail/bruggen/lijst', { ...(p.bron.context || {}), accountId, messageId })
      .then((res) => {
        if (!actief) return;
        const lijst = Array.isArray(res.data?.koppelingen) ? (res.data.koppelingen as GekoppeldeRij[]) : [];
        setKoppelingen(lijst);
      })
      .catch(() => {
        if (actief) setKoppelingen([]);
      });
    return () => {
      actief = false;
    };
  }, [p.variant, bruggenAan, accountId, messageId]);

  if (!bericht) return null;
  if (p.variant === 'afzender' && !klantAan) return null;

  const onderwerp = String(bericht.subject || '').trim() || (p.lang === 'nl' ? 'Bericht uit Post' : 'Лист із Пошти');
  const uittreksel = korteUittrekselUitBericht(bericht);
  const afzenderAdres = afzenderBron ? adresVan(afzenderBron.from) : '';
  const afzenderNaam = afzenderBron ? naamVan(afzenderBron.from) || afzenderAdres : '';

  const voegKoppelingToe = (rij: GekoppeldeRij) => {
    setKoppelingen((huidig) => (huidig.some((x) => x.doelSoort === rij.doelSoort && x.doelId === rij.doelId) ? huidig : [rij, ...huidig]));
  };

  const doeNotitie = async () => {
    if (bezigActie || !accountId || !messageId) return;
    setBezigActie('notitie');
    setStatus(null);
    const kop = p.lang === 'nl' ? `**Van:** ${afzenderBron?.from || '—'}` : `**Від:** ${afzenderBron?.from || '—'}`;
    const inhoud = uittreksel ? `${kop}\n\n${uittreksel}` : kop;
    const uit = await maakNotitieUitMail(p.bron.context || {}, {
      bronSoort: 'bericht',
      accountId,
      messageId,
      titel: onderwerp,
      inhoud,
      etiketten: p.lang === 'nl' ? ['post'] : ['пошта'],
    });
    setBezigActie('');
    if (uit.ok) {
      voegKoppelingToe({ sleutel: `notitie:${uit.id}`, doelSoort: 'notitie', doelId: uit.id, href: uit.href });
      setStatus({
        aard: 'ok',
        tekst: MAIL_BRUG_TEKSTEN.notitieKlaar[p.lang],
        primairHref: uit.href,
        primairLabel: MAIL_BRUG_TEKSTEN.notitieOpenen[p.lang],
      });
      return;
    }
    setStatus({
      aard: 'fout',
      tekst: (p.lang === 'nl' ? uit.uitlegNl : uit.uitlegUk) || MAIL_BRUG_TEKSTEN.foutAlgemeen[p.lang],
    });
  };

  const doeTaak = async (doel: 'taak' | 'afstemming') => {
    if (bezigActie || !accountId || !messageId) return;
    setBezigActie(doel);
    setStatus(null);
    const voorstel = p.watNodig?.punten?.length
      ? voorstelUit({
          subject: onderwerp,
          punten: p.watNodig.punten,
          kort: p.watNodig.kort,
          ref: bericht.receivedAt || Date.now(),
          lang: p.lang,
          voor: 'taak',
        })
      : null;
    const termijn = voorstel && voorstel.start > 0 ? new Date(voorstel.start).toISOString().slice(0, 10) : '';
    const uit = await maakTaakUitMail(p.bron.context || {}, {
      doel,
      accountId,
      messageId,
      titel: (voorstel?.titel || onderwerp).slice(0, 160),
      beschrijving: (voorstel?.beschrijving || uittreksel).slice(0, 3600),
      termijn,
    });
    setBezigActie('');
    if (uit.ok) {
      if (uit.id) {
        voegKoppelingToe({ sleutel: `${uit.doel}:${uit.id}`, doelSoort: uit.doel, doelId: uit.id, href: uit.href });
      }
      setStatus({
        aard: 'ok',
        tekst: MAIL_BRUG_TEKSTEN.taakKlaar[p.lang],
        primairHref: uit.href,
        primairLabel: uit.doel === 'afstemming' ? MAIL_BRUG_TEKSTEN.naarAfstemmingKnop[p.lang] : MAIL_BRUG_TEKSTEN.taakOpenen[p.lang],
        secundairHref: uit.afstemmingHref,
        secundairLabel: uit.afstemmingHref ? MAIL_BRUG_TEKSTEN.naarAfstemmingKnop[p.lang] : undefined,
      });
      return;
    }
    setStatus({
      aard: 'fout',
      tekst: (p.lang === 'nl' ? uit.uitlegNl : uit.uitlegUk) || MAIL_BRUG_TEKSTEN.foutAlgemeen[p.lang],
    });
  };

  const doeAgenda = async () => {
    if (bezigActie || !accountId || !messageId) return;
    setBezigActie('agenda');
    setStatus(null);
    const voorstel = p.watNodig?.punten?.length || p.watNodig?.kort?.length
      ? voorstelUit({
          subject: onderwerp,
          punten: p.watNodig?.punten || [],
          kort: p.watNodig?.kort || [],
          ref: bericht.receivedAt || Date.now(),
          lang: p.lang,
          voor: 'agenda',
        })
      : null;
    const startMs = voorstel && voorstel.start > 0 ? voorstel.start : Date.now() + 3600_000;
    const eindMs = voorstel && voorstel.einde > startMs ? voorstel.einde : startMs + 3600_000;
    const startD = new Date(startMs);
    const eindD = new Date(eindMs);
    const datum = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-${String(startD.getDate()).padStart(2, '0')}`;
    const beginTijd = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;
    const eindTijd = `${String(eindD.getHours()).padStart(2, '0')}:${String(eindD.getMinutes()).padStart(2, '0')}`;

    const uit = await maakAgendaUitMail(p.bron.context || {}, {
      accountId,
      messageId,
      titel: (voorstel?.titel || onderwerp).slice(0, 220),
      datum,
      beginTijd,
      eindTijd,
      plaats: voorstel?.plaats || '',
      beschrijving: (voorstel?.beschrijving || uittreksel).slice(0, 3500),
      tijdzone: lokaleTijdzone(),
    });
    setBezigActie('');
    if (uit.ok) {
      voegKoppelingToe({ sleutel: `agenda:${uit.id}`, doelSoort: 'agenda', doelId: uit.id, href: uit.href });
      setStatus({
        aard: 'ok',
        tekst: MAIL_BRUG_TEKSTEN.agendaKlaar[p.lang],
        primairHref: uit.href,
        primairLabel: MAIL_BRUG_TEKSTEN.agendaOpenen[p.lang],
      });
      return;
    }
    if (p.onAfspraak && voorstel) {
      p.onAfspraak(voorstel);
    }
    setStatus({
      aard: 'let-op',
      tekst: (p.lang === 'nl' ? uit.uitlegNl : uit.uitlegUk) || MAIL_BRUG_TEKSTEN.foutAlgemeen[p.lang],
      primairHref: uit.agendaHref,
      primairLabel: uit.agendaHref ? MAIL_BRUG_TEKSTEN.agendaOpenen[p.lang] : undefined,
    });
  };

  const doeKlantkaart = async () => {
    if (bezigActie || !accountId || !messageId) return;
    setBezigActie('klant');
    setStatus(null);
    const uit = await openOfMaakKlantkaartUitMail(p.bron.context || {}, {
      accountId,
      messageId,
      naam: afzenderNaam || onderwerp,
      mail: afzenderAdres,
      onderwerp,
      notitieTekst: uittreksel.slice(0, 4000) || onderwerp,
    });
    setBezigActie('');
    if (uit.ok) {
      voegKoppelingToe({ sleutel: `klant:${uit.id}`, doelSoort: 'klant', doelId: uit.id, href: uit.href });
      setStatus({
        aard: 'ok',
        tekst: uit.bestaand ? MAIL_BRUG_TEKSTEN.klantKlaarBestaand[p.lang] : MAIL_BRUG_TEKSTEN.klantKlaarNieuw[p.lang],
        primairHref: uit.href,
        primairLabel: MAIL_BRUG_TEKSTEN.klantOpenen[p.lang],
      });
      return;
    }
    if (uit.kluisGesloten) {
      setStatus({
        aard: 'let-op',
        tekst: (p.lang === 'nl' ? uit.uitlegNl : uit.uitlegUk) || MAIL_BRUG_TEKSTEN.foutAlgemeen[p.lang],
        primairHref: uit.ontgrendelHref,
        primairLabel: uit.ontgrendelHref ? MAIL_BRUG_TEKSTEN.kluisOntgrendelen[p.lang] : undefined,
        secundairHref: uit.overzichtHref,
        secundairLabel: uit.overzichtHref ? MAIL_BRUG_TEKSTEN.klantenOverzicht[p.lang] : undefined,
      });
      return;
    }
    setStatus({
      aard: 'fout',
      tekst: (p.lang === 'nl' ? uit.uitlegNl : uit.uitlegUk) || MAIL_BRUG_TEKSTEN.foutAlgemeen[p.lang],
    });
  };

  if (p.variant === 'afzender') {
    return (
      <div className='ctx-bruggen ctx-bruggen-afzender' data-mail-bruggen='afzender'>
        <span className='ctx-knoppen'>
          <button
            type='button'
            className='ctx-knop ctx-brug-knop'
            data-brug-doel='klantrelatiebeheer'
            disabled={Boolean(bezigActie)}
            title={MAIL_BRUG_TEKSTEN.klantkaartUitleg[p.lang]}
            onClick={() => void doeKlantkaart()}
          >
            {bezigActie === 'klant' ? <LoaderCircle className='spin' aria-hidden='true' /> : <BriefcaseBusiness aria-hidden='true' />}
            {MAIL_BRUG_TEKSTEN.klantkaart[p.lang]}
          </button>
        </span>
        {status && (
          <div className='ctx-brug-status' data-aard={status.aard} role={status.aard === 'fout' ? 'alert' : 'status'}>
            {status.aard === 'ok' ? <CheckCircle2 aria-hidden='true' /> : <Lock aria-hidden='true' />}
            <span>{status.tekst}</span>
            {status.primairHref && status.primairLabel && (
              <a className='ctx-brug-link' href={status.primairHref} target='_blank' rel='noopener noreferrer'>
                <ExternalLink aria-hidden='true' />
                {status.primairLabel}
              </a>
            )}
            {status.secundairHref && status.secundairLabel && (
              <a className='ctx-brug-link' href={status.secundairHref} target='_blank' rel='noopener noreferrer'>
                <ExternalLink aria-hidden='true' />
                {status.secundairLabel}
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className='ctx-bruggen' data-mail-bruggen='taken' role='group' aria-label={MAIL_BRUG_TEKSTEN.groepLabel[p.lang]}>
      <span className='ctx-knoppen'>
        <button
          type='button'
          className='ctx-knop ctx-brug-knop'
          data-brug-doel='notities'
          disabled={Boolean(bezigActie)}
          title={MAIL_BRUG_TEKSTEN.naarNotitiesUitleg[p.lang]}
          onClick={() => void doeNotitie()}
        >
          {bezigActie === 'notitie' ? <LoaderCircle className='spin' aria-hidden='true' /> : <FileText aria-hidden='true' />}
          {MAIL_BRUG_TEKSTEN.naarNotities[p.lang]}
        </button>
        <button
          type='button'
          className='ctx-knop ctx-brug-knop'
          data-brug-doel='afstemming-taken'
          disabled={Boolean(bezigActie)}
          title={MAIL_BRUG_TEKSTEN.naarTakenUitleg[p.lang]}
          onClick={() => void doeTaak('taak')}
        >
          {bezigActie === 'taak' ? <LoaderCircle className='spin' aria-hidden='true' /> : <ListTodo aria-hidden='true' />}
          {MAIL_BRUG_TEKSTEN.naarTakenAfstemming[p.lang]}
        </button>
        <button
          type='button'
          className='ctx-knop ctx-brug-knop'
          data-brug-doel='afstemming'
          disabled={Boolean(bezigActie)}
          title={MAIL_BRUG_TEKSTEN.naarTakenUitleg[p.lang]}
          onClick={() => void doeTaak('afstemming')}
        >
          {bezigActie === 'afstemming' ? <LoaderCircle className='spin' aria-hidden='true' /> : <GitPullRequestArrow aria-hidden='true' />}
          {MAIL_BRUG_TEKSTEN.naarAfstemmingKnop[p.lang]}
        </button>
        <button
          type='button'
          className='ctx-knop ctx-brug-knop'
          data-brug-doel='agenda'
          disabled={Boolean(bezigActie)}
          title={MAIL_BRUG_TEKSTEN.naarAgendaUitleg[p.lang]}
          onClick={() => void doeAgenda()}
        >
          {bezigActie === 'agenda' ? <LoaderCircle className='spin' aria-hidden='true' /> : <CalendarPlus aria-hidden='true' />}
          {MAIL_BRUG_TEKSTEN.naarAgenda[p.lang]}
        </button>
        {klantAan && (
          <button
            type='button'
            className='ctx-knop ctx-brug-knop'
            data-brug-doel='klanten'
            disabled={Boolean(bezigActie)}
            title={MAIL_BRUG_TEKSTEN.klantkaartUitleg[p.lang]}
            onClick={() => void doeKlantkaart()}
          >
            {bezigActie === 'klant' ? <LoaderCircle className='spin' aria-hidden='true' /> : <BriefcaseBusiness aria-hidden='true' />}
            {MAIL_BRUG_TEKSTEN.klantkaart[p.lang]}
          </button>
        )}
      </span>
      {bezigActie && !status && (
        <p className='ctx-noot' role='status'>{MAIL_BRUG_TEKSTEN.bezig[p.lang]}</p>
      )}
      {status && (
        <div className='ctx-brug-status' data-aard={status.aard} role={status.aard === 'fout' ? 'alert' : 'status'}>
          {status.aard === 'ok' ? <CheckCircle2 aria-hidden='true' /> : <Lock aria-hidden='true' />}
          <span>{status.tekst}</span>
          {status.primairHref && status.primairLabel && (
            <a className='ctx-brug-link' href={status.primairHref} target='_blank' rel='noopener noreferrer'>
              <ExternalLink aria-hidden='true' />
              {status.primairLabel}
            </a>
          )}
          {status.secundairHref && status.secundairLabel && (
            <a className='ctx-brug-link' href={status.secundairHref} target='_blank' rel='noopener noreferrer'>
              <ExternalLink aria-hidden='true' />
              {status.secundairLabel}
            </a>
          )}
        </div>
      )}
      {bruggenAan && koppelingen.length > 0 && (
        <div className='ctx-brug-lijst'>
          <small className='ctx-noot'>{MAIL_BRUG_TEKSTEN.gekoppeldeItems[p.lang]}:</small>
          <span className='ctx-knoppen'>
            {koppelingen.slice(0, 6).map((item) => (
              <a
                key={item.sleutel}
                className='ctx-brug-link'
                href={item.href}
                target='_blank'
                rel='noopener noreferrer'
              >
                <ExternalLink aria-hidden='true' />
                {MAIL_BRUG_TEKSTEN.soortLabel[item.doelSoort][p.lang]}
              </a>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
