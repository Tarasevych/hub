import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertBlindCopyRequest,copyCiphertext} from '../../backend/cloud-m7-blinde-overdracht.mjs';
import {validateLease} from '../../backend/cloud-m7-sessie-lease.mjs';
const sha=x=>createHash('sha256').update(x).digest('base64url');
const req={ownerId:'user-1',space:'prive',sourceAccountId:'drive-1',targetAccountId:'s3-2',objectId:'f-1',transferId:'job-1',mode:'copy',encryption:'ufw-vault-v1'};
const sourceBytes=[new Uint8Array([1,2,3]),new Uint8Array([4,5,6])];
function fixture({mutateTarget=false}={}){
 const manifest={version:'ufw-vault-v1',context:{accountId:'user-1',space:'prive',fileId:'f-1'},totalChunks:2,packets:sourceBytes.map((b,index)=>({index,size:b.length,checksum:sha(b)}))};
 let staging={},published=false,aborted=false;
 return {source:{readManifest:async()=>manifest,readChunk:async(_id,i)=>sourceBytes[i]},target:{startStaging:async()=>{},stageChunk:async(_id,i,b)=>{staging[i]=b},readStagedChunk:async(_id,i)=>mutateTarget?new Uint8Array([9]):staging[i],publish:async()=>{published=true},abort:async()=>{aborted=true}},state:()=>({published,aborted})};
}
test('M7 blind relay verifies two encrypted chunks and keeps source intact',async()=>{const f=fixture();const r=await copyCiphertext({request:req,...f,authorize:async()=>true});assert.equal(r.state,'ciphertext_copied_unverified_by_client');assert.equal(f.state().published,true);});
test('M7 user revocation stops transfer before commit',async()=>{const f=fixture();let n=0;await assert.rejects(copyCiphertext({request:req,...f,authorize:async()=>++n<3}),/AUTH_REVOKED/);assert.equal(f.state().published,false);assert.equal(f.state().aborted,true);});
test('M7 target corrupted blocks publish and aborts',async()=>{const f=fixture({mutateTarget:true});await assert.rejects(copyCiphertext({request:req,...f,authorize:async()=>true}),/VERIFY_FAILED/);assert.equal(f.state().published,false);});
test('M7 source mutated blocks commit',async()=>{const f=fixture();f.source.readChunk=async()=>new Uint8Array([1,1,1]);await assert.rejects(copyCiphertext({request:req,...f,authorize:async()=>true}),/CHANGED/);});
test('M7 scope mismatch blocks copy',async()=>{const f=fixture();await assert.rejects(copyCiphertext({request:{...req,ownerId:'other'},...f,authorize:async()=>true}),/MISMATCH/);});
test('M7 plaintext and token fields refused',()=>{assert.throws(()=>assertBlindCopyRequest({...req,providerToken:'secret'}),/SECRETS_FORBIDDEN/);});
test('M7 destructive transfer never accepted by blind path',()=>{assert.throws(()=>assertBlindCopyRequest({...req,mode:'move'}),/COPY_ONLY/);});
test('M7 one-operation user presence lease bound to account, space, expiry and bytes',()=>{const l={principal:'user-1',space:'prive',connectionId:'drive-1',scope:'one-operation',userPresenceConfirmed:true,allowedOperations:['read'],expiresAt:200_000,remainingBytes:10};assert.equal(validateLease({ownerId:'user-1',space:'prive',connectionId:'drive-1',operation:'read',bytes:10},l,180_000),true);assert.throws(()=>validateLease({ownerId:'u-2',space:'prive',connectionId:'drive-1',operation:'read',bytes:10},l,180_000),/WRONG_PRINCIPAL/);});
test('M7 expired or oversized leases rejected',()=>{const l={principal:'u',space:'prive',connectionId:'c',scope:'one-operation',userPresenceConfirmed:true,allowedOperations:['read'],expiresAt:1,remainingBytes:10};assert.throws(()=>validateLease({ownerId:'u',space:'prive',connectionId:'c',operation:'read',bytes:1},l,2),/EXPIRED/);});
