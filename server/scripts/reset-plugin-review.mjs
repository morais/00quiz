#!/usr/bin/env node
// Explicit reset of the separate, disposable OpenAI reviewer tenant only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const origin='https://api.00quiz.com';
const {accessCode,tenantId}=JSON.parse(readFileSync(new URL('../.plugin-review-access.json',import.meta.url),'utf8'));assert.match(tenantId,/^[a-f0-9-]{36}$/);
let token;
const request=(path,method='POST',body)=>fetch(origin+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
try {
 const r=await request('/v1/auth/review','POST',{accessCode});assert.equal(r.status,201);const login=await r.json();token=login.token;assert.equal(login.tenant.id,tenantId);assert.equal(login.tenant.isReview,true);
 const prefs=await request('/v1/preferences','PATCH',{interests:[],language:null,difficulty:null,timeZone:'UTC'});assert.equal(prefs.status,200);
 const reset=await request('/v1/review/reset');assert.equal(reset.status,200);const state=await reset.json();assert.match(state.today,/^\d{4}-\d{2}-\d{2}$/);
 const completed=state.history.find(quiz=>quiz.completed);assert.ok(completed,'Need a completed sample quiz for feedback review');
 const feedback=await request(`/v1/quizzes/${completed.id}/feedback`,'PUT',{message:'More nature questions and a little more challenge, please.'});assert.equal(feedback.status,200);
 execFileSync('npx',['wrangler','d1','execute','00quiz','--remote','--command',`DELETE FROM quiz_packs WHERE tenant_id='${tenantId}' AND day>'${state.today}' AND EXISTS(SELECT 1 FROM tenants WHERE id='${tenantId}' AND apple_subject IS NULL)`],{cwd:new URL('../',import.meta.url),stdio:'ignore'});
 console.log('Prepared only the dedicated OpenAI sample account: optional preferences unset, today unanswered, future packs removed, and a sample feedback note on a completed quiz.');
} finally {
 if(token){let revoked=false;try{revoked=(await request('/v1/auth/logout')).ok;}catch{}if(!revoked){const hash=createHash('sha256').update(token).digest('hex');execFileSync('npx',['wrangler','d1','execute','00quiz','--remote','--command',`UPDATE credentials SET revoked_at='${new Date().toISOString()}' WHERE tenant_id='${tenantId}' AND token_hash='${hash}'`],{cwd:new URL('../',import.meta.url),stdio:'ignore'});}}
}
