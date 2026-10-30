/** Enforces truth in privacy labels across the Cloud UI and backend.
 * User's third-party provider holds native plaintext unless user has
 * encrypted that object before it reaches the provider.
 */
import {validateLease} from './cloud-m7-sessie-lease.mjs';
export class PrivacyPolicyError extends Error{constructor(code){super(code);this.code=code;}}
export const privacyModes=Object.freeze({
 encrypted_vault:{userKeyRequired:true,serverSeesPlaintext:false,shareNative:false,backgroundCopyCiphertext:true},
 provider_native:{userKeyRequired:false,serverMaySeePlaintext:true,shareNative:true,backgroundCopyCiphertext:false}
});
/** Must run after owner/space authentication, provider ACL and organization policy.
 * This check is NOT a substitute for those protections.
 */
export function authorizeCloudPrivacy({mode,operation,encryptedFormat,sourceAccountId,targetAccountId,lease,principal,space,bytes=0,now=Date.now()}){
 if(!principal||!['prive','technisch'].includes(space)||!sourceAccountId)throw new PrivacyPolicyError('PRIVACY_IDENTITY_REQUIRED');
 if(mode==='encrypted_vault'){
  if(encryptedFormat!=='ufw-vault-v1')throw new PrivacyPolicyError('PRIVACY_VAULT_FORMAT_REQUIRED');
  if(!['read_ciphertext','write_ciphertext','copy_ciphertext'].includes(operation))throw new PrivacyPolicyError('PRIVACY_VAULT_OPERATION_UNSUPPORTED');
  if(operation==='copy_ciphertext'&&!targetAccountId)throw new PrivacyPolicyError('PRIVACY_DESTINATION_REQUIRED');
  return {mode,displayLabel:'Зашифрований простір',serverPlaintextAccess:false};
 }
 if(mode==='provider_native'){
  if(!['read','write','copy','share'].includes(operation))throw new PrivacyPolicyError('PRIVACY_NATIVE_OPERATION_UNSUPPORTED');
  if(!lease)throw new PrivacyPolicyError('PRIVACY_NATIVE_LEASE_REQUIRED');
  validateLease({ownerId:principal,space,connectionId:sourceAccountId,operation,bytes},lease,now);
  return {mode,displayLabel:'Файли провайдера',serverPlaintextAccess:true};
 }
 throw new PrivacyPolicyError('PRIVACY_MODE_UNKNOWN');
}
