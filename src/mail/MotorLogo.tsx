// MAILAI-005 (16.11.2026): логотип рушія ШІ — один на всю платформу (вибір рушія в пошті, чип над листом, сторінка власника).
// Справжній знак постачальника з бази знаків сайту (src/merk); для власного сервера без знака — проста піктограма, не вигаданий логотип.
// Het logo van een AI-motor: het echte merk uit het register; een eigen server zonder merk krijgt een eenvoudig pictogram.
import { Cpu, KeyRound, Languages, Server } from 'lucide-react';
import Merk from '../merk/Merk';
import MerkLogo from '../merk/MerkLogo';
import './motor-logo.css';

/** Ключ логотипа в базі знаків сайту для постачальника ШІ. */
const MERK_VAN: Record<string, string> = { anthropic: 'claude', openai: 'gpt', gemini: 'gemini', google: 'gemini', xai: 'grok', mistral: 'mistral', deepseek: 'deepseek', groq: 'groq', openrouter: 'openrouter' };

export type MotorLogoBron = { soort: 'lokaal' | 'sleutel' | 'eigen-server' | 'dienst-eigenaar'; aanbieder?: string | null; dienst?: { soort: string } | null };

export default function MotorLogo({ k, maat = 32 }: { k: MotorLogoBron; maat?: number }) {
  const ic = Math.round(maat * 0.5);
  const eigen = (kind: 'server' | 'taal' | 'cpu' | 'sleutel') => (
    <span className='motor-logo-eigen' style={{ width: maat, height: maat }}>
      {kind === 'taal' ? <Languages size={ic} aria-hidden='true' /> : kind === 'cpu' ? <Cpu size={ic} aria-hidden='true' /> : kind === 'sleutel' ? <KeyRound size={ic} aria-hidden='true' /> : <Server size={ic} aria-hidden='true' />}
    </span>
  );
  if (k.soort === 'lokaal') return <Merk merk='chrome' maat={maat} vorm='tegel' terugval={eigen('cpu')} />;
  // Знак Ollama лежить у великій таблиці знаків (merk-logos), яку MerkLogo довантажує сам, лише коли такий рушій є.
  if (k.dienst?.soort === 'ollama') return <MerkLogo id='ollama' naam='Ollama' logo='ollama' maat={maat} />;
  if (k.dienst?.soort === 'libretranslate') return eigen('taal');
  if (k.aanbieder) return <Merk merk={MERK_VAN[k.aanbieder] || k.aanbieder} maat={maat} vorm='tegel' terugval={eigen('sleutel')} />;
  return eigen(k.soort === 'eigen-server' ? 'server' : 'sleutel');
}
