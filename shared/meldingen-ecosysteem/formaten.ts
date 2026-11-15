// Повний класифікатор і диспетчер форматів вкладень для вбудованого програвача екосистеми сповіщень.
// Спирається на shared/bestandsformaten.ts та розширює підтримку медіа, коду, журналів, документів, баз даних, архівів і підписів.

import { formaatVan, type FormaatFamilie } from '../bestandsformaten';
import type { MeldingBijlage } from './model';

export type WeergaveSoort =
  | 'beeld'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'werkblad'
  | 'database'
  | 'presentatie'
  | 'archief'
  | 'agenda'
  | 'contact'
  | 'handtekening'
  | 'code'
  | 'tekst'
  | 'hex';

export type FormaatOmschrijving = {
  familie: FormaatFamilie;
  weergave: WeergaveSoort;
  mime: string;
  label: string;
  uk: string;
  nl: string;
  kanAfspelen: boolean;
  interactief: boolean;
  kleur: string;
};

const EXT_WEERGAVE: Record<string, { weergave: WeergaveSoort; mime: string; label: string; uk: string; nl: string; kleur: string; kanAfspelen?: boolean }> = {
  svg: { weergave: 'beeld', mime: 'image/svg+xml', label: 'SVG', uk: 'Векторне зображення', nl: 'Vectorafbeelding', kleur: '#0ea5e9', kanAfspelen: true },
  svgz: { weergave: 'beeld', mime: 'image/svg+xml', label: 'SVGZ', uk: 'Векторне зображення', nl: 'Vectorafbeelding', kleur: '#0ea5e9', kanAfspelen: true },
  heic: { weergave: 'beeld', mime: 'image/heic', label: 'HEIC', uk: 'Фотографія HEIC', nl: 'HEIC-foto', kleur: '#0ea5e9', kanAfspelen: true },
  heif: { weergave: 'beeld', mime: 'image/heif', label: 'HEIF', uk: 'Фотографія HEIF', nl: 'HEIF-foto', kleur: '#0ea5e9', kanAfspelen: true },
  ico: { weergave: 'beeld', mime: 'image/x-icon', label: 'ICO', uk: 'Піктограма', nl: 'Pictogram', kleur: '#0ea5e9', kanAfspelen: true },
  bmp: { weergave: 'beeld', mime: 'image/bmp', label: 'BMP', uk: 'Растрове зображення', nl: 'Bitmapafbeelding', kleur: '#0ea5e9', kanAfspelen: true },
  tiff: { weergave: 'beeld', mime: 'image/tiff', label: 'TIFF', uk: 'Зображення TIFF', nl: 'TIFF-afbeelding', kleur: '#0ea5e9', kanAfspelen: true },
  flac: { weergave: 'audio', mime: 'audio/flac', label: 'FLAC', uk: 'Аудіо без втрат', nl: 'Lossless audio', kleur: '#8b5cf6', kanAfspelen: true },
  aac: { weergave: 'audio', mime: 'audio/aac', label: 'AAC', uk: 'Аудіозапис AAC', nl: 'AAC-audio', kleur: '#8b5cf6', kanAfspelen: true },
  opus: { weergave: 'audio', mime: 'audio/opus', label: 'OPUS', uk: 'Аудіопотік Opus', nl: 'Opus-audio', kleur: '#8b5cf6', kanAfspelen: true },
  mkv: { weergave: 'video', mime: 'video/x-matroska', label: 'MKV', uk: 'Відеоконтейнер MKV', nl: 'MKV-video', kleur: '#ec4899', kanAfspelen: true },
  m4v: { weergave: 'video', mime: 'video/x-m4v', label: 'M4V', uk: 'Відеозапис M4V', nl: 'M4V-video', kleur: '#ec4899', kanAfspelen: true },
  sqlite: { weergave: 'database', mime: 'application/vnd.sqlite3', label: 'DB', uk: 'База даних SQLite', nl: 'SQLite-database', kleur: '#6366f1' },
  sqlite3: { weergave: 'database', mime: 'application/vnd.sqlite3', label: 'SQLite', uk: 'База даних SQLite', nl: 'SQLite-database', kleur: '#6366f1' },
  db: { weergave: 'database', mime: 'application/vnd.sqlite3', label: 'DB', uk: 'База даних', nl: 'Database', kleur: '#6366f1' },
  parquet: { weergave: 'database', mime: 'application/vnd.apache.parquet', label: 'PARQ', uk: 'Таблиця Parquet', nl: 'Parquet-tabel', kleur: '#6366f1' },
  sql: { weergave: 'code', mime: 'application/sql', label: 'SQL', uk: 'Запит SQL', nl: 'SQL-query', kleur: '#14b8a6' },
  json: { weergave: 'code', mime: 'application/json', label: 'JSON', uk: 'Дані JSON', nl: 'JSON-gegevens', kleur: '#14b8a6' },
  yaml: { weergave: 'code', mime: 'application/yaml', label: 'YAML', uk: 'Конфігурація YAML', nl: 'YAML-configuratie', kleur: '#14b8a6' },
  yml: { weergave: 'code', mime: 'application/yaml', label: 'YML', uk: 'Конфігурація YAML', nl: 'YAML-configuratie', kleur: '#14b8a6' },
  toml: { weergave: 'code', mime: 'application/toml', label: 'TOML', uk: 'Конфігурація TOML', nl: 'TOML-configuratie', kleur: '#14b8a6' },
  xml: { weergave: 'code', mime: 'application/xml', label: 'XML', uk: 'Документ XML', nl: 'XML-document', kleur: '#14b8a6' },
  ts: { weergave: 'code', mime: 'text/typescript', label: 'TS', uk: 'Код TypeScript', nl: 'TypeScript-code', kleur: '#14b8a6' },
  tsx: { weergave: 'code', mime: 'text/typescript', label: 'TSX', uk: 'Компонент TSX', nl: 'TSX-component', kleur: '#14b8a6' },
  js: { weergave: 'code', mime: 'text/javascript', label: 'JS', uk: 'Код JavaScript', nl: 'JavaScript-code', kleur: '#14b8a6' },
  mjs: { weergave: 'code', mime: 'text/javascript', label: 'MJS', uk: 'Модуль JavaScript', nl: 'JavaScript-module', kleur: '#14b8a6' },
  css: { weergave: 'code', mime: 'text/css', label: 'CSS', uk: 'Таблиця стилів', nl: 'Stijlblad', kleur: '#14b8a6' },
  py: { weergave: 'code', mime: 'text/x-python', label: 'PY', uk: 'Сценарій Python', nl: 'Python-script', kleur: '#14b8a6' },
  sh: { weergave: 'code', mime: 'text/x-shellscript', label: 'SH', uk: 'Сценарій оболонки', nl: 'Shellscript', kleur: '#14b8a6' },
  ps1: { weergave: 'code', mime: 'text/plain', label: 'PS1', uk: 'Сценарій PowerShell', nl: 'PowerShell-script', kleur: '#14b8a6' },
  diff: { weergave: 'code', mime: 'text/x-diff', label: 'DIFF', uk: 'Різниця змін', nl: 'Verschillen (diff)', kleur: '#14b8a6' },
  patch: { weergave: 'code', mime: 'text/x-diff', label: 'PATCH', uk: 'Латка змін', nl: 'Wijzigingspakket', kleur: '#14b8a6' },
  log: { weergave: 'tekst', mime: 'text/plain', label: 'LOG', uk: 'Журнал подій', nl: 'Logboekbestand', kleur: '#64748b' },
  md: { weergave: 'tekst', mime: 'text/markdown', label: 'MD', uk: 'Документ Markdown', nl: 'Markdown-document', kleur: '#64748b' },
  txt: { weergave: 'tekst', mime: 'text/plain', label: 'TXT', uk: 'Текстовий файл', nl: 'Tekstbestand', kleur: '#64748b' },
  p7s: { weergave: 'handtekening', mime: 'application/pkcs7-signature', label: 'P7S', uk: 'Цифровий підпис', nl: 'Digitale handtekening', kleur: '#f59e0b' },
  asice: { weergave: 'handtekening', mime: 'application/vnd.etsi.asic-e+zip', label: 'ASiC-E', uk: 'Підписаний контейнер', nl: 'Ondertekende container', kleur: '#f59e0b' },
  asics: { weergave: 'handtekening', mime: 'application/vnd.etsi.asic-s+zip', label: 'ASiC-S', uk: 'Підписаний контейнер', nl: 'Ondertekende container', kleur: '#f59e0b' },
  ics: { weergave: 'agenda', mime: 'text/calendar', label: 'ICS', uk: 'Подія календаря', nl: 'Agenda-afspraak', kleur: '#2563eb' },
  vcf: { weergave: 'contact', mime: 'text/vcard', label: 'VCF', uk: 'Контактна картка', nl: 'Contactkaart', kleur: '#2563eb' },
  eml: { weergave: 'tekst', mime: 'message/rfc822', label: 'EML', uk: 'Поштовий лист', nl: 'E-mailbericht', kleur: '#3b82f6' },
};

const FAMILIE_NAAR_WEERGAVE: Record<FormaatFamilie, { weergave: WeergaveSoort; kleur: string; kanAfspelen: boolean }> = {
  beeld: { weergave: 'beeld', kleur: '#0ea5e9', kanAfspelen: true },
  video: { weergave: 'video', kleur: '#ec4899', kanAfspelen: true },
  audio: { weergave: 'audio', kleur: '#8b5cf6', kanAfspelen: true },
  pdf: { weergave: 'pdf', kleur: '#ef4444', kanAfspelen: false },
  document: { weergave: 'document', kleur: '#2563eb', kanAfspelen: false },
  spreadsheet: { weergave: 'werkblad', kleur: '#10b981', kanAfspelen: false },
  presentatie: { weergave: 'presentatie', kleur: '#f97316', kanAfspelen: false },
  archief: { weergave: 'archief', kleur: '#f59e0b', kanAfspelen: false },
  agenda: { weergave: 'agenda', kleur: '#2563eb', kanAfspelen: false },
  contact: { weergave: 'contact', kleur: '#2563eb', kanAfspelen: false },
  tekst: { weergave: 'tekst', kleur: '#64748b', kanAfspelen: false },
  mail: { weergave: 'tekst', kleur: '#3b82f6', kanAfspelen: false },
  overig: { weergave: 'hex', kleur: '#64748b', kanAfspelen: false },
};

export function extensieVanBestand(naam: string): string {
  const m = String(naam || '').toLowerCase().trim().match(/\.([a-z0-9]{1,12})$/);
  return m?.[1] || '';
}

export function classificeerBijlage(bijlage: Pick<MeldingBijlage, 'naam' | 'mime'>): FormaatOmschrijving {
  const naam = bijlage.naam || '';
  const mime = String(bijlage.mime || '').toLowerCase().split(';')[0].trim();
  const ext = extensieVanBestand(naam);

  if (ext && EXT_WEERGAVE[ext]) {
    const k = EXT_WEERGAVE[ext];
    const basis = formaatVan(naam, mime || k.mime);
    return {
      familie: basis.familie,
      weergave: k.weergave,
      mime: mime && mime !== 'application/octet-stream' ? mime : k.mime,
      label: k.label,
      uk: k.uk,
      nl: k.nl,
      kanAfspelen: Boolean(k.kanAfspelen),
      interactief: true,
      kleur: k.kleur,
    };
  }

  const basis = formaatVan(naam, mime);
  const f = FAMILIE_NAAR_WEERGAVE[basis.familie];
  if (basis.familie === 'overig') {
    if (mime.startsWith('image/')) return { familie: 'beeld', weergave: 'beeld', mime, label: basis.label || 'IMG', uk: 'Зображення', nl: 'Afbeelding', kanAfspelen: true, interactief: true, kleur: '#0ea5e9' };
    if (mime.startsWith('video/')) return { familie: 'video', weergave: 'video', mime, label: basis.label || 'VID', uk: 'Відео', nl: 'Video', kanAfspelen: true, interactief: true, kleur: '#ec4899' };
    if (mime.startsWith('audio/')) return { familie: 'audio', weergave: 'audio', mime, label: basis.label || 'AUD', uk: 'Аудіо', nl: 'Audio', kanAfspelen: true, interactief: true, kleur: '#8b5cf6' };
    if (mime.startsWith('text/')) return { familie: 'tekst', weergave: 'tekst', mime, label: basis.label || 'TXT', uk: 'Текст', nl: 'Tekst', kanAfspelen: false, interactief: true, kleur: '#64748b' };
  }

  return {
    familie: basis.familie,
    weergave: f.weergave,
    mime: mime || 'application/octet-stream',
    label: basis.label,
    uk: basis.uk,
    nl: basis.nl,
    kanAfspelen: f.kanAfspelen,
    interactief: true,
    kleur: f.kleur,
  };
}

export function formaatGrootte(bytes: number): string {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n} B`;
  const eenheden = ['KB', 'MB', 'GB'];
  let waarde = n / 1024;
  let i = 0;
  while (waarde >= 1024 && i < eenheden.length - 1) {
    waarde /= 1024;
    i++;
  }
  return `${waarde.toFixed(waarde >= 10 ? 0 : 1)} ${eenheden[i]}`;
}
