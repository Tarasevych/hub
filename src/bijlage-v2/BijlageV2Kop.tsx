// Компактна шапка переглядача вкладень v2 (CONSOL-001 / Віха M3, сумісна зі спільним переглядачем №208 та класичною шапкою).
// Зберігає компактну панель інструментів v2 як один із трьох взаємосумісних режимів подання (`gedeeld` | `v2` | `klassiek`).
// Compacte kop van bijlageviewer v2 als zelfstandig en herbruikbaar onderdeel met ondersteuning voor drie weergavestanden.

import type { ReactNode } from 'react';
import { formatMailAttachmentSize } from '../MailBijlageVoorbeeld';
import { WEERGAVE_VLAG } from '../bijlage-weergave/soort';
import { useVlag } from '../functievlag-lezen';
import BijlageWerkbalk, { type WerkbalkProps } from './BijlageWerkbalk';
import { BijlageV2Context, useBijlageV2Vlag } from './vlag';

export type BijlageV2KopProps = Omit<WerkbalkProps, 'grootte'> & {
  oud: ReactNode;
  grootteBytes: number;
};

export function BijlageV2Kop({ oud, grootteBytes, ...p }: BijlageV2KopProps) {
  const v2Vlag = useBijlageV2Vlag();
  const gedeeldVlag = useVlag(WEERGAVE_VLAG, false);
  const aan = v2Vlag || gedeeldVlag;
  if (!aan) return <>{oud}</>;
  return <BijlageWerkbalk {...p} grootteBytes={grootteBytes} grootte={formatMailAttachmentSize(Number(grootteBytes || 0), p.lang)} />;
}

export function BijlageV2Omhulsel({ children }: { children: ReactNode }) {
  const v2Vlag = useBijlageV2Vlag();
  const gedeeldVlag = useVlag(WEERGAVE_VLAG, false);
  const aan = v2Vlag || gedeeldVlag;
  return <BijlageV2Context.Provider value={aan}>{children}</BijlageV2Context.Provider>;
}

export default BijlageV2Kop;

