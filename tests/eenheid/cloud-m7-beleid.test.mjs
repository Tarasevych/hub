import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeCloudPrivacy} from '../../backend/cloud-m7-privacy-beleid.mjs';
const ctx={principal:'owner',space:'prive',sourceAccountId:'google-1',targetAccountId:'dropbox-2'};
test('M7 private vault read permits ciphertext only',()=>{const r=authorizeCloudPrivacy({...ctx,mode:'encrypted_vault',operation:'read_ciphertext',encryptedFormat:'ufw-vault-v1'});assert.equal(r.serverPlaintextAccess,false);});
test('M7 private vault refuses native public share',()=>{assert.throws(()=>authorizeCloudPrivacy({...ctx,mode:'encrypted_vault',operation:'share',encryptedFormat:'ufw-vault-v1'}),/UNSUPPORTED/);});
test('M7 vault requires authenticated format',()=>{assert.throws(()=>authorizeCloudPrivacy({...ctx,mode:'encrypted_vault',operation:'copy_ciphertext'}),/FORMAT_REQUIRED/);});
test('M7 native files require explicit user-presence lease and disclose plaintext access',()=>{
 const lease={principal:'owner',space:'prive',connectionId:'google-1',scope:'one-operation',userPresenceConfirmed:true,allowedOperations:['read'],expiresAt:210000,remainingBytes:1024};
 const r=authorizeCloudPrivacy({...ctx,mode:'provider_native',operation:'read',lease,bytes:500,now:200000});
 assert.equal(r.serverPlaintextAccess,true);
 assert.throws(()=>authorizeCloudPrivacy({...ctx,mode:'provider_native',operation:'read',bytes:500}),/LEASE_REQUIRED/);
});
test('M7 native lease cannot cross account',()=>{const lease={principal:'owner',space:'prive',connectionId:'wrong',scope:'one-operation',userPresenceConfirmed:true,allowedOperations:['read'],expiresAt:210000,remainingBytes:1024};assert.throws(()=>authorizeCloudPrivacy({...ctx,mode:'provider_native',operation:'read',lease,bytes:500,now:200000}),/WRONG_PRINCIPAL/);});
