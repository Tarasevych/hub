// Opruimjob (cron-taak "opruimen", elk uur via systemd-timer mijn-ruimte-opruimen.timer).
// Verwijdert verlopen kortlevende beveiligingsrecords zodat ze niet blijven bestaan of de DB vullen:
// OAuth-states, PKCE-materiaal, login-transacties, handoff-codes, broker-verzoeken, sessies en
// browsergrants die verlopen zijn, plus oude rate-limit- en lockout-rijen.
// Een respijt (GRACE_MS) houdt pas verlopen rijen nog even vast voor diagnose/audit.
import {getPool} from '../server/platform/pg';
import {verlopenVerwijderingenAfronden} from './privacy';

const GRACE_MS=24*60*60*1000;
// tabel -> velden (epoch-ms) waarvan er één verlopen moet zijn
export const OPRUIM_TABELLEN:Record<string,string[]>={
  google_oauth_states:['expiresAt'],
  google_suite_oauth_states_v1:['expiresAt'],
  mail_oauth_states_v2:['expiresAt'],
  oauth_pkce_v1:['expiresAt'],
  owner_auth_transactions_v1:['expiresAt'],
  service_handoffs:['expiresAt'],
  auth_broker_requests:['expiresAt'],
  google_photos_picker_sessions_v1:['expiresAt'],
  owner_service_sessions_v1:['absoluteExpiresAt','idleExpiresAt'],
  owner_tab_sessions_v1:['absoluteExpiresAt','idleExpiresAt'],
  owner_browser_grants_v1:['expiresAt'],
  browser_grants:['expiresAt'],
  service_sessions:['expiresAt'],
  google_sessions:['expiresAt'],
};

export async function opruimen(now=Date.now()){
  const pool=getPool(),grens=now-GRACE_MS,resultaat:Record<string,number>={};
  for(const[tabel,velden]of Object.entries(OPRUIM_TABELLEN)){
    // Alleen numerieke waarden vergelijken; records zonder vervalveld blijven staan.
    const voorwaarde=velden.map((veld,i)=>`(jsonb_typeof(data->'${veld}')='number' AND (data->>'${veld}')::numeric < $${i+2})`).join(' OR ');
    const r=await pool.query(`DELETE FROM app.records WHERE tbl=$1 AND (${voorwaarde})`,[tabel,...velden.map(()=>grens)]);
    if(r.rowCount)resultaat[tabel]=r.rowCount;
  }
  const rl=await pool.query(`DELETE FROM app.rate_limits WHERE window_start < now() - interval '1 day'`);
  if(rl.rowCount)resultaat['app.rate_limits']=rl.rowCount;
  const lo=await pool.query(`DELETE FROM app.login_lockouts WHERE (locked_until IS NULL OR locked_until < now()) AND updated_at < now() - interval '1 day'`);
  if(lo.rowCount)resultaat['app.login_lockouts']=lo.rowCount;
  const cr=await pool.query(`DELETE FROM app.cron_runs WHERE started_at < now() - interval '30 days'`);
  if(cr.rowCount)resultaat['app.cron_runs']=cr.rowCount;
  return resultaat;
}

/** Cron-handler (zie cron.json). */
export async function opruimCron(){
  const verwijderd=await opruimen();
  console.log('[opruimen] verwijderd:',JSON.stringify(verwijderd));
  // Fase 3: accounts na 30 dagen herstelperiode definitief wissen (alleen met ACCOUNT_DEFINITIEF_WISSEN=1).
  let accounts:Awaited<ReturnType<typeof verlopenVerwijderingenAfronden>>|{fout:string};
  try{accounts=await verlopenVerwijderingenAfronden();if(accounts.accounts.length)console.log(`[opruimen] verlopen accountverwijderingen (${accounts.uitgevoerd?'gewist':'droog, ACCOUNT_DEFINITIEF_WISSEN≠1'}):`,JSON.stringify(accounts.accounts))}catch(e){accounts={fout:String((e as Error)?.message||e)};console.error('[opruimen] accounts afronden mislukt:',accounts.fout)}
  return{statusCode:200,body:JSON.stringify({ok:true,verwijderd,accounts})};
}
