import { lazy, Suspense, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import ProductEmptyState from './ProductEmptyState';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { canonicalNavigationUrl, routeLang } from './canonical-navigation';
import { RichtingBand } from './weergave/Weergave';

const ChatPanel = lazy(() => import('./ChatPanel'));
const AgentBord = lazy(() => import('./agenten/AgentBord'));

type Tr = (uk: string, nl: string) => string;
type Props = { tab: string; tr: Tr; userName: string; workspaceName: string };
type Status = { hasKey: boolean; tools: string[]; machines: { total: number; online: number } };

// An empty screen has to say what the next step is. Both routes go through the
// existing canonical navigation: an in-app hop on the technical host, a real
// navigation on the production subdomains.
export const openIntegrations = () => {
  const lang = routeLang();
  location.assign(canonicalNavigationUrl('api', 'connections', lang));
};

export default function AIServiceView({ tab, tr }: Props) {
  if (tab === 'connections') return <Suspense fallback={null}><AgentBord tr={tr} /></Suspense>;
  // null = nog aan het laden; undefined-status = geen recht of geen sleutel -> de lege staat met de volgende stap.
  const [status, setStatus] = useState<Status | null | 'none'>(null);

  useEffect(() => {
    let active = true;
    api.post('/api/owner/agents/chat/status', { service: 'ai', tabContext: ecosystemTabContext(), sourceOrigin: location.origin })
      .then((res) => { if (active) setStatus(res.data?.hasKey ? (res.data as Status) : 'none'); })
      .catch(() => { if (active) setStatus('none'); });
    return () => { active = false; };
  }, []);

  if (status === null) return null;
  // Etap 3: altijd zichtbaar in welke richting deze dienst werkt (site → AI), met een verwijzing naar de brug AI → site.
  const band = <div className='ai-richting'><RichtingBand richting='ai' uk={routeLang() !== 'nl'} /></div>;
  if (status === 'none') {
    return (
      <>{band}<ProductEmptyState
        icon={Bot}
        title={tr('ШІ для вас', 'AI voor u')}
        description={tr(
          'Додайте свій ключ Anthropic у сховищі (API → Підключення), і тут з’явиться чат, який керує вашими пристроями.',
          'Voeg uw eigen Anthropic-sleutel toe in de kluis (API → Koppelingen); dan verschijnt hier een chat die uw apparaten bedient.',
        )}
        actionLabel={tr('Підключити', 'Koppelen')}
        onAction={openIntegrations}
      /></>
    );
  }
  return <>{band}<Suspense fallback={null}><ChatPanel tr={tr} status={status} /></Suspense></>;
}
