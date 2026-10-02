import {Github} from 'lucide-react';
import ProductEmptyState from './ProductEmptyState';
import ApiPlatformView from './ApiPlatformView';
import {openIntegrations} from './AIServiceView';
type Lang='uk'|'nl';
type Tr=(uk:string,nl:string)=>string;
type Props={lang:Lang;tab:string;tr:Tr};
export function GitHubServiceView({tr}:Props){return <ProductEmptyState icon={Github} title={tr('GitHub та код','GitHub en code')} description={tr('GitHub ще не підключено. Репозиторії з’являться тут лише після безпечного підключення.','GitHub is nog niet gekoppeld. Repositories verschijnen hier pas na een veilige koppeling.')} actionLabel={tr('Підключити','Koppelen')} onAction={openIntegrations}/>}
export function ApiServiceView({tab,tr}:Props){return <ApiPlatformView tab={tab} tr={tr}/>}
