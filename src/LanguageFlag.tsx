import './language-flag.css';
export default function LanguageFlag({lang}:{lang:'uk'|'nl'}){return <span className={`language-flag language-flag-${lang}`} aria-hidden='true'/>}
