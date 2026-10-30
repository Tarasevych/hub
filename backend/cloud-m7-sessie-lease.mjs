/** User-presence-bound short lease contract. NOT a cryptographic isolation boundary
 * against a malicious server operator. Treat native-provider tokens as server-readable
 * while a BFF operation is in progress. No persisted token support here.
 */
export class LeaseDenied extends Error{constructor(code){super(code);this.code=code;}}
export function validateLease(request,lease,now=Date.now()){
 if(!request||!lease||!lease.principal||!lease.connectionId||!lease.scope||!lease.space)throw new LeaseDenied('LEASE_MISSING');
 if(request.ownerId!==lease.principal||request.space!==lease.space||request.connectionId!==lease.connectionId)throw new LeaseDenied('LEASE_WRONG_PRINCIPAL');
 if(!Array.isArray(lease.allowedOperations)||!lease.allowedOperations.includes(request.operation))throw new LeaseDenied('LEASE_OPERATION_DENIED');
 if(!Number.isFinite(lease.expiresAt)||now>lease.expiresAt||lease.expiresAt-now>15*60*1000)throw new LeaseDenied('LEASE_EXPIRED_OR_EXCESSIVE');
 if(!Number.isSafeInteger(request.bytes)||request.bytes<0||request.bytes>lease.remainingBytes)throw new LeaseDenied('LEASE_BUDGET_EXCEEDED');
 if(lease.scope!=='one-operation'||lease.userPresenceConfirmed!==true)throw new LeaseDenied('LEASE_USER_PRESENCE_REQUIRED');
 return true;
}
