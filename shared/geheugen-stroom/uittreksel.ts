// Детермінований аналізатор тексту (розмов, нотаток, завдань) для пропонування нових вузлів у Стрім пам’яті.
// Повністю без зовнішніх LLM, із жорсткою фільтрацією потенційних секретів і дублікатів.
import {
  bevatGevoeligGeheim,
  maakKnoopSleutelVanTitel,
  normaliseerGeheugenLabels,
  type GeheugenKandidaat,
  type GeheugenSoort,
} from './model';

const BESLUIT_RE = /(?:вирішили|домовилися|ухвалили|постановили|обрали|переходимо\s+на|фіксуємо\s+рішення|besloten|afgesproken|gekozen\s+voor|we\s+gebruiken\s+voortaan|vastgesteld)/i;
const VOORKEUR_RE = /(?:завжди\s+(?:використову|роби|пиши|показу)|ніколи\s+не|краще\s+(?:робити|використовувати|тримати)|надаю\s+перевагу|улюблений|стиль|altijd|voortaan|liever|bij\s+voorkeur|nooit\s+gebruiken|standaard\s+in)/i;
const WAARSCHUWING_RE = /(?:увага|обережно|не\s+чіпати|заборонено|ризик|небезпечно|критично|обов[’']язково\s+перевіря|ніколи\s+не\s+(?:зміню|видаля|чіпа|запуска|вимика|переда|відправля)|pas\s+op|waarschuwing|verboden|nooit\s+(?:verwijderen|wijzigen)|kritiek|let\s+op|gevaar)/i;
const FEIT_RE = /(?:працює\s+на|розташовано|встановлено|використовується|порт|версія|домен|шлях|адреса|сервер|draait\s+op|geïnstalleerd|poort|versie|domein|pad|adres|server|verbonden\s+met)/i;

const DOMEIN_LABELS: Array<{ re: RegExp; label: string }> = [
  { re: /(?:пошт|mail|gmail|imap|smtp|postvak)/i, label: 'mail' },
  { re: /(?:хмар|cloud|drive|onedrive|dropbox|файл|bestand)/i, label: 'cloud' },
  { re: /(?:\bgithub\b|гітхаб|\bgit\b|\bbranch\b|гілк|\bpr\b|реліз|випуск|\buitrol\b)/i, label: 'github' },
  { re: /(?:безпек|ключ|passkey|tls|rls|shi?f|versleut|beveilig|sleutel|kluis)/i, label: 'beveiliging' },
  { re: /(?:будинок|дім|huis|woning|енерг|energie|сенсор|sensor)/i, label: 'huis' },
  { re: /(?:календар|agenda|зустріч|afspraak|caldav)/i, label: 'agenda' },
  { re: /(?:агент|mcp|claude|codex|gemini|chatgpt|grok|copilot|cursor|antigravity|autoclaw|windsurf|cline|devin|opencode|mscopilot)/i, label: 'agenten' },
  { re: /(?:інтерфейс|тема|css|ui|дизайн|weergave|thema|stijl)/i, label: 'ui' },
  { re: /(?:баз[аи]\s+даних|postgres|sql|міграц|database|migratie)/i, label: 'database' },
];

export interface UittrekselOpties {
  maxKandidaten?: number;
  extraLabels?: string[];
  nu?: number;
}

function bepaalSoortEnVertrouwen(zin: string): { soort: GeheugenSoort; vertrouwen: number } {
  if (WAARSCHUWING_RE.test(zin)) return { soort: 'waarschuwing', vertrouwen: 0.92 };
  if (BESLUIT_RE.test(zin)) return { soort: 'besluit', vertrouwen: 0.88 };
  if (VOORKEUR_RE.test(zin)) return { soort: 'voorkeur', vertrouwen: 0.85 };
  if (FEIT_RE.test(zin)) return { soort: 'feit', vertrouwen: 0.78 };
  return { soort: 'context', vertrouwen: 0.62 };
}

function maakTitelUitZin(zin: string): string {
  const schoon = zin
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (schoon.length <= 84) return schoon;
  const kort = schoon.slice(0, 81);
  const laatsteSpatie = kort.lastIndexOf(' ');
  return `${(laatsteSpatie > 30 ? kort.slice(0, laatsteSpatie) : kort).trim()}…`;
}

export function haalGeheugenKandidatenUitTekst(
  tekst: string,
  opties: UittrekselOpties = {},
): GeheugenKandidaat[] {
  const max = Math.max(1, Math.min(12, Number(opties.maxKandidaten) || 6));
  const nu = opties.nu ?? Date.now();
  const ruw = String(tekst ?? '').trim();
  if (!ruw) return [];

  // Розбиття на абзаци, пункти списку та речення зі збереженням змістовних фрагментів.
  const segmenten = ruw
    .split(/(?:\r?\n)+|(?<=[.!?])\s+(?=[A-ZА-ЯҐЄІЇ«"'-])/)
    .map((s) => s.replace(/^[-*•]+\s*/, '').trim())
    .filter((s) => s.length >= 18 && s.length <= 900);

  const gezien = new Set<string>();
  const kandidaten: GeheugenKandidaat[] = [];

  for (let i = 0; i < segmenten.length; i++) {
    const seg = segmenten[i];
    const normSig = seg.toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
    if (gezien.has(normSig)) continue;
    gezien.add(normSig);

    if (bevatGevoeligGeheim(seg)) {
      kandidaten.push({
        sleutel: `geblokkeerd-${i + 1}`,
        soort: 'waarschuwing',
        titel: 'Вилучено фрагмент із потенційним ключем чи паролем / Fragment met mogelijk geheim tegengehouden',
        inhoud: '[Вміст заблоковано фільтром таємниць · Inhoud geblokkeerd door geheimenfilter]',
        labels: ['beveiliging'],
        vertrouwen: 0.1,
        geblokkeerdDoorGeheim: true,
      });
      continue;
    }

    const { soort, vertrouwen } = bepaalSoortEnVertrouwen(seg);
    // Відсіюємо слабкі речення без жодного маркера, якщо вже маємо достатньо змістовних кандидатів.
    if (soort === 'context' && seg.length < 36) continue;

    const labels = [...(opties.extraLabels ?? [])];
    for (const d of DOMEIN_LABELS) {
      if (d.re.test(seg) && !labels.includes(d.label)) labels.push(d.label);
    }

    const titel = maakTitelUitZin(seg);
    const sleutel = maakKnoopSleutelVanTitel(titel, nu + i * 37);

    kandidaten.push({
      sleutel,
      soort,
      titel,
      inhoud: seg,
      labels: normaliseerGeheugenLabels(labels),
      vertrouwen,
    });
  }

  kandidaten.sort((a, b) => {
    if (Boolean(a.geblokkeerdDoorGeheim) !== Boolean(b.geblokkeerdDoorGeheim)) {
      return a.geblokkeerdDoorGeheim ? 1 : -1;
    }
    return b.vertrouwen - a.vertrouwen;
  });

  return kandidaten.slice(0, max);
}
