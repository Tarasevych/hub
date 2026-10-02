import { Bot } from 'lucide-react';
import ProductEmptyState from './ProductEmptyState';
import { canonicalNavigationUrl, navigateCanonicalService, routeLang } from './canonical-navigation';

type Tr = (uk: string, nl: string) => string;
type Props = { tab: string; tr: Tr; userName: string; workspaceName: string };

// An empty screen has to say what the next step is. Both routes go through the
// existing canonical navigation: an in-app hop on the technical host, a real
// navigation on the production subdomains.
export const openIntegrations = () => {
  const lang = routeLang();
  if (navigateCanonicalService('api', 'connections', lang)) return;
  location.assign(canonicalNavigationUrl('api', 'connections', lang));
};

export default function AIServiceView({ tr }: Props) {
  return (
    <ProductEmptyState
      icon={Bot}
      title={tr('ШІ Робочий простір', 'AI-werkruimte')}
      description={tr(
        'Підключення ШІ ще не налаштовано. Тут з’являться лише реальні агенти та виконання.',
        'De AI-koppeling is nog niet ingesteld. Hier verschijnen alleen echte agenten en uitvoeringen.',
      )}
      actionLabel={tr('Підключити', 'Koppelen')}
      onAction={openIntegrations}
    />
  );
}
