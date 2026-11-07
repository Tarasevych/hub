// TRACE-001: bron-dossier, GitHub-tak, release en exact pakket moeten samen kloppen.
import { createHash } from 'node:crypto';
import { leesOntwikkelArchief, valideerOntwikkelDossier } from '../../shared/ontwikkelarchief';
import { controleerOntwikkelArchiefOnline } from '../../backend/uitrol-ontwikkelarchief';
import { checker } from './hulp/nep-google';

const V='20261103-215555', C='a'.repeat(40), T='feature/trace-001-20261103-214810';
const P='orchestratie/ontwikkelarchieven/TRACE-001.json';
const ref = {
  schema:1 as const, taakId:'TRACE-001', repo:'Tarasevych/hub',tak:T,
  commit:C,pad:P,sha256:'',url:`https://github.com/Tarasevych/hub/blob/${C}/${P}`,
  release:`https://github.com/Tarasevych/hub/releases/tag/${V}`,pakket:`mijn-ruimte-${V}.tar.gz`
};
const dossier={schema:1,taakId:'TRACE-001',opdracht:'Задокументувати доказову історію завдання, рішень і тестів у GitHub.',
  tijdlijn:[{actie:'start'}],keuzes:[{besluit:'verified'}],wijzigingen:[{pad:'AGENTS.md'}],
  controles:[{cmd:'test'}],bronnen:[{url:'https://github.com/Tarasevych/hub'}],
  beperkingen:['No secret keys.'],privacy:{geheimenUitgesloten:true}};
const dosBytes=Buffer.from(JSON.stringify(dossier));
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const r={...ref,sha256:sha(dosBytes)};
const pakketHash=sha('fake-pakket-content');
function antwoord(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});}
function fakeNet(o:{geenDossier?:boolean; foutDossier?:boolean; afwijkTak?:boolean; geenRelease?:boolean; afwijkPakket?:boolean; netwerk?:boolean; git404?:boolean}={}):typeof fetch{
  return (async(url)=>{
    const u=String(url);
    if(o.netwerk) throw new Error('netwerk geen verbinding');
    if(o.git404) return antwoord({message:'Not Found'},404);
    if(u.includes('/contents/')) return antwoord(o.geenDossier?{}:{type:'file',encoding:'base64',content:(o.foutDossier?Buffer.from('ongewenst'):dosBytes).toString('base64')});
    if(u.includes('/branches/')) return antwoord({commit:{sha:C}});
    if(u.includes('/compare/')) return antwoord({status:o.afwijkTak?'diverged':'identical'});
    if(u.includes('/releases/tags/')) return antwoord({assets:o.geenRelease?[]:[{name:r.pakket,state:'uploaded',digest:'sha256:'+(o.afwijkPakket?'0'.repeat(64):pakketHash)}]});
    throw Error('unexpected url '+u);
  }) as typeof fetch;
}
export async function main():Promise<number>{
  const {check,einde}=checker('trace-001-ontwikkelarchief');
  const leeg=leesOntwikkelArchief(null,V,C);
  check('verplicht leeg bestand geweigerd',leeg.ref===null&&leeg.fouten.length>0);
  check('geldig commitgebonden archief',leesOntwikkelArchief(JSON.stringify(r),V,C).fouten.length===0);
  check('geen afwijkende BRON-COMMIT',leesOntwikkelArchief(JSON.stringify({...r,commit:'b'.repeat(40)}),V,C).ref===null);
  check('geen URL naar een externe host',leesOntwikkelArchief(JSON.stringify({...r,url:'https://evil.example/file'}),V,C).ref===null);
  check('geen onbekende tak',leesOntwikkelArchief(JSON.stringify({...r,tak:'main'}),V,C).ref===null);
  check('geen afwijkende pakketnaam',leesOntwikkelArchief(JSON.stringify({...r,pakket:'other.tar.gz'}),V,C).ref===null);
  check('geen leeg dossier',valideerOntwikkelDossier({...dossier,controles:[]},'TRACE-001').length>0);
  check('geen onveilige privacy',valideerOntwikkelDossier({...dossier,privacy:{geheimenUitgesloten:false}},'TRACE-001').length>0);
  const goed=await controleerOntwikkelArchiefOnline(r,pakketHash,{ophalen:fakeNet()});
  check('compleet dossier + commit in tak + release-asset+digest: OK',goed.ok,JSON.stringify(goed));
  for(const [label,opts,verwacht] of [
    ['dossier ontbreekt',{geenDossier:true},'ONTWIKKELARCHIEF_ONGELDIG'],
    ['dossierhash gewijzigd',{foutDossier:true},'ONTWIKKELARCHIEF_SHA_VERSCHILT'],
    ['commit niet in tak',{afwijkTak:true},'ONTWIKKELARCHIEF_TAK_ONGELDIG'],
    ['release zonder tar.gz',{geenRelease:true},'ONTWIKKELARCHIEF_PAKKET_ONTBREEKT'],
    ['ander tar.gz op GitHub',{afwijkPakket:true},'ONTWIKKELARCHIEF_PAKKET_SHA_VERSCHILT'],
    ['GitHub offline',{netwerk:true},'ONTWIKKELARCHIEF_ONBEREIKBAAR'],
    ['GitHub 404',{git404:true},'ONTWIKKELARCHIEF_NIET_GEVONDEN']
  ] as const){
    const uit=await controleerOntwikkelArchiefOnline(r,pakketHash,{ophalen:fakeNet(opts)});
    check(label,!uit.ok&&uit.code===verwacht,JSON.stringify(uit));
  }
  return einde();
}
