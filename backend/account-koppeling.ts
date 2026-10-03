// Welke account hoort bij een binnenkomende Google-identiteit? (auth fase 1)
//
// Regel (zie docs/ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md): een account is een willekeurige UUID;
// een login-identiteit (provider + subject) hoort bij precies één account. Er wordt NOOIT stil op
// e-mailadres samengevoegd: een nieuw Google-subject met een e-mailadres dat al bij een ander account
// hoort, krijgt een NIEUW, apart account (status "new"); het bestaande account krijgt een melding.
//
// Eén uitzondering, zodat de eigenaar na de migratie kan blijven inloggen: heeft het account met
// OWNER_EMAIL nog géén gekoppelde Google-identiteit (oude database), dan mag het eerste Google-subject
// met dat adres zich eenmalig koppelen. Daarna staat die koppeling vast (account_identities).
//
// Dit bestand is puur (geen database), zodat de beslisregels los te testen zijn.

export type KoppelInvoer={
  /** Account dat via account_identities (provider google, subject) gekoppeld is; '' = geen (of gepensioneerd). */
  identiteitAccountId:string;
  /** Actief account met users.sub === subject (oude koppeling van vóór account_identities); '' = geen. */
  subAccountId:string;
  /** Actief account met hetzelfde e-mailadres (alleen gebruikt als er geen identiteit/sub-koppeling is). */
  emailAccountId:string;
  /** Heeft dat e-mailaccount al een Google-identiteit in account_identities? */
  emailAccountHeeftGoogleIdentiteit:boolean;
  email:string;
  eigenaarEmail:string;
};

export type KoppelBesluit=
  |{soort:'bestaand';accountId:string;reden:'identiteit'|'sub'|'eigenaar-eerste-koppeling'}
  |{soort:'nieuw';emailConflictAccountId:string};

const norm=(value:unknown)=>String(value||'').trim().toLowerCase();

export function besluitGoogleKoppeling(invoer:KoppelInvoer):KoppelBesluit{
  if(invoer.identiteitAccountId)return{soort:'bestaand',accountId:invoer.identiteitAccountId,reden:'identiteit'};
  if(invoer.subAccountId)return{soort:'bestaand',accountId:invoer.subAccountId,reden:'sub'};
  const email=norm(invoer.email),eigenaar=norm(invoer.eigenaarEmail);
  if(invoer.emailAccountId){
    if(eigenaar&&email===eigenaar&&!invoer.emailAccountHeeftGoogleIdentiteit)return{soort:'bestaand',accountId:invoer.emailAccountId,reden:'eigenaar-eerste-koppeling'};
    return{soort:'nieuw',emailConflictAccountId:invoer.emailAccountId};
  }
  return{soort:'nieuw',emailConflictAccountId:''};
}

/**
 * Mag dit account de eigenaarsrol (owner + approved) krijgen? Alleen met OWNER_EMAIL én alleen als er
 * nog geen ander actief eigenaarsaccount is. Zo wordt een tweede account met hetzelfde adres (of een
 * Google-account dat zijn adres naar OWNER_EMAIL wijzigt) nooit stil eigenaar.
 */
export function magEigenaarZijn(invoer:{email:string;eigenaarEmail:string;accountId:string;bestaandEigenaarId:string}):boolean{
  const eigenaar=norm(invoer.eigenaarEmail);
  if(!eigenaar||norm(invoer.email)!==eigenaar)return false;
  return !invoer.bestaandEigenaarId||invoer.bestaandEigenaarId===invoer.accountId;
}
