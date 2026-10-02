import {migrateLegacyPresentationStorage,readSharedPreferences,writeSharedPreferences} from './shared-preferences';


export type EcosystemLang='uk'|'nl';
const valid=(value:unknown):value is EcosystemLang=>value==='uk'||value==='nl';
const browserLocale=():EcosystemLang=>navigator.language.toLowerCase().startsWith('nl')?'nl':'uk';const routeLanguage=():EcosystemLang|null=>{const value=new URLSearchParams(location.search).get('lang');return valid(value)?value:null};
const browserLast=():EcosystemLang|null=>{migrateLegacyPresentationStorage();const shared=readSharedPreferences().lang;return valid(shared)?shared:null};
export const hasExplicitTabLanguage=()=>Boolean(routeLanguage());
export const resolveInitialLanguage=():EcosystemLang=>routeLanguage()||browserLast()||browserLocale();
export const resolveAccountLanguage=(current:EcosystemLang,accountLanguage:unknown):EcosystemLang=>hasExplicitTabLanguage()?current:valid(accountLanguage)?accountLanguage:current;
export const persistBrowserLanguage=(lang:EcosystemLang)=>{writeSharedPreferences({lang});document.documentElement.lang=lang};
export const chooseExplicitLanguage=(lang:EcosystemLang)=>persistBrowserLanguage(lang);
