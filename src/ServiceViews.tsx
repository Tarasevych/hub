import GitHubView from './GitHubView';
import ApiPlatformView from './ApiPlatformView';
type Lang='uk'|'nl';
type Tr=(uk:string,nl:string)=>string;
type Props={lang:Lang;tab:string;tr:Tr};
export function GitHubServiceView({tab,tr}:Props){return <GitHubView tab={tab} tr={tr}/>}
export function ApiServiceView({tab,tr}:Props){return <ApiPlatformView tab={tab} tr={tr}/>}
