// Poort voor de bijlageviewer v2 in GoogleMailWerkruimte.tsx: kiest per vlag `bijlage-viewer-v2` de oude kop of de nieuwe werkbalk,
// en geeft de vlag via context door aan de inhoud (PDF-balk v2). Vlag uit = precies de oude kop (dezelfde elementen).
import type { ReactNode } from 'react';
import { formatMailAttachmentSize } from '../MailBijlageVoorbeeld';
import BijlageWerkbalk, { type WerkbalkProps } from './BijlageWerkbalk';
import { BijlageV2Context, useBijlageV2Vlag } from './vlag';

export function BijlageV2Kop({ oud, grootteBytes, ...p }: Omit<WerkbalkProps, 'grootte'> & { oud: ReactNode; grootteBytes: number }) {
  const aan = useBijlageV2Vlag();
  if (!aan) return <>{oud}</>;
  return <BijlageWerkbalk {...p} grootte={formatMailAttachmentSize(Number(grootteBytes || 0))} />;
}

export function BijlageV2Omhulsel({ children }: { children: ReactNode }) {
  const aan = useBijlageV2Vlag();
  return <BijlageV2Context.Provider value={aan}>{children}</BijlageV2Context.Provider>;
}
