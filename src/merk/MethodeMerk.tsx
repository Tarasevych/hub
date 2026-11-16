// TELEGRAM-004 (16.11.2026): знак способу входу — один компонент для сторінки входу й для налаштувань.
// Logo van een aanmeldmethode. Het register (src/merk/merk-tabel.ts) kent Google, Microsoft en Apple; Discord staat alleen in de
// grote tabel (src/merk/merk-logos.ts). Die wordt hier pas opgehaald als er echt een Discord-logo getoond wordt — het register
// moet licht blijven (tests/eenheid/merk-register.test.ts). Oude fout die hiermee weg is: de knop «Увійти через Discord» op het
// aanmeldscherm had geen logo.
import { useEffect, useState, type ReactNode } from 'react';
import Merk from './Merk';

type Def = { naam: string; kleur: string; d: string };
/** Merken die alleen in de grote tabel staan. */
const ALLEEN_GROOT: ReadonlySet<string> = new Set(['discord']);
const gevonden = new Map<string, Def>();

export default function MethodeMerk({ merk, naam, maat = 24, terugval }: { merk: string; naam: string; maat?: number; terugval?: ReactNode }) {
  const [def, setDef] = useState<Def | null>(() => gevonden.get(merk) ?? null);
  useEffect(() => {
    if (!ALLEEN_GROOT.has(merk) || gevonden.has(merk)) return;
    let leeft = true;
    void import('./merk-logos').then((m) => {
      const hit = (m.LOGOS as Readonly<Record<string, readonly [string, string]>>)[merk];
      if (!hit) return;
      const d = { naam, kleur: `#${hit[1]}`, d: hit[0] };
      gevonden.set(merk, d);
      if (leeft) setDef(d);
    }).catch(() => undefined);
    return () => { leeft = false; };
  }, [merk, naam]);
  return <Merk def={def} merk={merk} naam={naam} vorm='gliefje' maat={maat} {...(terugval !== undefined && !def ? { terugval } : {})} />;
}
