export const CANONICAL_AUTH_CHANGE='canonical-auth-change';
/* 20.10.2026 (sessie-tabbladen): afmelden of van account wisselen gold tot nu alleen in HET tabblad dat het deed; andere
   tabbladen van hetzelfde account bleven het oude beeld houden tot de volgende navigatie. De melding gaat nu ook over een
   BroadcastChannel naar de andere tabbladen; elk tabblad haalt daarna zijn EIGEN bootstrap op, dus een tabblad op een ANDER
   account houdt gewoon zijn eigen account. Er gaat geen enkel sessiegeheim door het kanaal (alleen een tijdstip).
   Grens: een BroadcastChannel is per origin, dus dit bereikt de tabbladen van DIT subdomein. Tabbladen op een ander
   subdomein volgen bij hun eerstvolgende bootstrap (navigatie, pageshow of het tabblad weer naar voren halen). */
const KANAAL='tsv-canonical-auth-v1';
let kanaal:BroadcastChannel|null=null;
const open=()=>{if(kanaal||typeof BroadcastChannel==='undefined')return kanaal;try{kanaal=new BroadcastChannel(KANAAL);kanaal.onmessage=()=>window.dispatchEvent(new Event(CANONICAL_AUTH_CHANGE))}catch{kanaal=null}return kanaal};
export const broadcastCanonicalAuthChange=()=>{window.dispatchEvent(new Event(CANONICAL_AUTH_CHANGE));try{open()?.postMessage({op:Date.now()})}catch{}};
/** Meeluisteren met de andere tabbladen van dit subdomein; één keer aanroepen bij het starten van de app. */
export const listenCanonicalAuthChanges=()=>{open()};
