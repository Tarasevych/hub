// «Огляд» van het beheerpaneel (vervangt het statische blok in AdminConsoleView): een live, instelbaar dashboard.
// De bestaande gegevens (bootstrap) blijven beschikbaar als terugval en voor de widget «Межа повноважень».
import Dashboard from './overzicht/Dashboard';
import type { Bron, Context, Lang } from './overzicht/types';

export default function AdminOverviewView({ lang, context, bron, codes }: { lang: Lang; context: Context; bron: Bron; codes: boolean }) {
  return <Dashboard lang={lang} context={context} bron={bron} codes={codes} />;
}
