// Poort voor de bijlageviewer v2 in GoogleMailWerkruimte.tsx: kiest per vlag `bijlage-viewer-v2` en weergavekeuze de oude kop
// of de nieuwe werkbalk, en geeft de actieve v2-stand via context door aan de inhoud (PDF-balk v2).
import type { ReactNode } from 'react';
import { formatMailAttachmentSize } from '../MailBijlageVoorbeeld';
import { WEERGAVE_VLAG } from '../bijlage-weergave/soort';
import { actieveBijlageWeergaveModus, useBijlageWeergaveModus } from '../bijlage-weergave/weergave-modus';
import { useVlag } from '../functievlag-lezen';
import BijlageWerkbalk, { type WerkbalkProps } from './BijlageWerkbalk';
import { BijlageV2Context, useBijlageV2Vlag } from './vlag';

export function BijlageV2Kop({ oud, grootteBytes, ...p }: Omit<WerkbalkProps, 'grootte'> & { oud: ReactNode; grootteBytes: number }) {
  const v2Vlag = useBijlageV2Vlag();
  const [modusKeuze] = useBijlageWeergaveModus();
  const aan = v2Vlag && modusKeuze !== 'klassiek';
  if (!aan) return <>{oud}</>;
  return <BijlageWerkbalk {...p} grootte={formatMailAttachmentSize(Number(grootteBytes || 0), p.lang)} />;
}

export function BijlageV2Omhulsel({ children }: { children: ReactNode }) {
  const v2Vlag = useBijlageV2Vlag();
  const gedeeldVlag = useVlag(WEERGAVE_VLAG, false);
  const [modusKeuze] = useBijlageWeergaveModus();
  const aan = actieveBijlageWeergaveModus(gedeeldVlag, v2Vlag, modusKeuze) === 'v2';
  return <BijlageV2Context.Provider value={aan}>{children}</BijlageV2Context.Provider>;
}
