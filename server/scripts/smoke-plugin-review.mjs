#!/usr/bin/env node
// Backend contract rehearsal for OpenAI review; not a claim of model-routing tests.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash,randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const origin='https://api.00quiz.com';
const {accessCode,tenantId}=JSON.parse(readFileSync(new URL('../.plugin-review-access.json',import.meta.url),'utf8'));
assert.match(tenantId,/^[a-f0-9-]{36}$/);
const hash=x=>createHash('sha256').update(x).digest('hex');
const grants=[],created=[],evidence=[];let mcp,originalPreferences;
const call=(path,body,headers={})=>fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
const post=(path,body,headers={})=>fetch(origin+path,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(body)});
const hidden=(html,name)=>{const value=html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];assert.ok(value,`Missing form field ${name}`);return value;};
const rpc=async(method,params)=>{const r=await call('/mcp',{jsonrpc:'2.0',id:1,method,params},{authorization:`Bearer ${mcp}`});assert.equal(r.status,200);return r.json();};
const tool=async(name,args={})=>{const r=await rpc('tools/call',{name,arguments:args});assert.ok(!r.error&&!r.result?.isError,`Tool failed: ${name}`);return r.result.structuredContent;};
const dayPlus=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const questions=[
 {prompt:'How many sides does a hexagon have?',topic:'Shapes',choices:['Five','Six','Seven','Eight'],correctIndex:1,explanation:'A hexagon is a polygon with six sides.'},
 {prompt:'Which gas makes up most of Earth’s atmosphere?',topic:'Science',choices:['Oxygen','Carbon dioxide','Nitrogen','Helium'],correctIndex:2,explanation:'Nitrogen accounts for roughly 78 percent of Earth’s atmosphere.'},
 {prompt:'Which instrument measures air pressure?',topic:'Science',choices:['Barometer','Thermometer','Ammeter','Ruler'],correctIndex:0,explanation:'A barometer measures atmospheric pressure.'},
 {prompt:'What does the metric prefix kilo- represent?',topic:'Numbers',choices:['Ten','One hundred','One million','One thousand'],correctIndex:3,explanation:'The prefix kilo- means one thousand.'},
 {prompt:'At standard atmospheric pressure, at what temperature does pure water freeze?',topic:'Science',choices:['100 °C','0 °C','20 °C','−100 °C'],correctIndex:1,explanation:'The freezing point of pure water at standard atmospheric pressure is 0 degrees Celsius.'}
];
try {
 const callback='https://review.example/00quiz-plugin-callback',verifier=randomBytes(32).toString('base64url');
 const registration=await call('/oauth/register',{client_name:'00Quiz plugin contract rehearsal',redirect_uris:[callback]});assert.equal(registration.status,201);const {client_id}=await registration.json();
 const query=new URLSearchParams({client_id,redirect_uri:callback,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),resource:origin+'/mcp',scope:'quiz:read quiz:write'});
 const page=await(await fetch(origin+'/oauth/authorize?'+query)).text(),flow=hidden(page,'flow');
 const login=await post('/auth/review/callback',{flow,accessCode},{origin});assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const consent=await fetch(login.headers.get('location'),{headers:{cookie}}),csrf=hidden(await consent.text(),'csrf');
 const approved=await post('/oauth/consent',{flow,csrf,decision:'approve'},{origin,cookie});assert.equal(approved.status,303);
 const code=new URL(approved.headers.get('location')).searchParams.get('code');
 const exchange=await post('/oauth/token',{grant_type:'authorization_code',client_id,redirect_uri:callback,code,code_verifier:verifier,resource:origin+'/mcp'});assert.equal(exchange.status,200);mcp=(await exchange.json()).access_token;assert.ok(mcp);grants.push(hash(mcp));
 await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'00Quiz plugin contract rehearsal',version:'1.0'}});
 const listing=(await rpc('tools/list')).result.tools;assert.equal(listing.length,5);
 for(const item of listing)for(const key of ['readOnlyHint','openWorldHint','destructiveHint'])assert.equal(typeof item.annotations[key],'boolean');
 const context=await tool('get_quiz_context');assert.ok(context.quiz);assert.ok(context.history.length>=3);assert.ok(context.quiz.questions.every(q=>q.correctIndex===null&&q.explanation===null));
 originalPreferences=context.preferences;const instructions=await tool('get_quiz_instructions');assert.equal(instructions.version,context.agentInstructions.version);assert.match(instructions.instructions,/general audience/);
 const unchanged=await tool('get_quiz_instructions',{knownVersion:instructions.version});assert.equal(unchanged.changed,false);assert.ok(!('instructions' in unchanged));evidence.push('P1: current context, redaction, instructions version and compact unchanged check');
 const saved=await tool('update_quiz_preferences',{interests:['Birds','Space'],language:'English',difficulty:null,timeZone:'Europe/Lisbon'});assert.deepEqual(saved.interests,['Birds','Space']);assert.equal(saved.difficulty,null);assert.equal(saved.timeZone,'Europe/Lisbon');evidence.push('P2: explicit optional preferences saved and returned');
 const fresh=await tool('get_quiz_context'),history=await tool('get_quiz_history',{limit:7});assert.ok(history.history.length>=3);assert.ok(history.history.every(q=>q.questions.length===5));assert.ok(fresh.topics&&Object.keys(fresh.topics).length);evidence.push('P3: completed sample history, actual choices and topic performance');
 for(const offset of [1,7]){
  const day=dayPlus(fresh.today,offset);assert.ok(!fresh.scheduled.some(p=>p.day===day),'Synthetic review day already occupied; reset its test fixtures before running');
  const pack={day,title:`OpenAI contract rehearsal · day +${offset}`,hostMessage:'Five general-knowledge questions prepared only for this isolated backend rehearsal.',questions};
  const result=await tool('publish_daily_quiz',pack);created.push(result.id);assert.equal(result.day,day);assert.equal(result.questionCount,5);assert.equal(result.published,true);
  const retry=await tool('publish_daily_quiz',pack);assert.equal(retry.id,result.id);
  const conflict=await rpc('tools/call',{name:'publish_daily_quiz',arguments:{...pack,title:'Attempted replacement'}});assert.equal(conflict.result.isError,true);
  evidence.push(`P${offset===1?4:5}: +${offset}-day publication, five questions, identical retry and immutable-pack conflict`);
 }
 for(const name of ['submit_quiz_answers','delete_account','schedule_daily_quiz']){const r=await rpc('tools/call',{name,arguments:{}});assert.equal(r.error.code,-32602);}evidence.push('Negative backend boundary: no answer-submission, account-deletion or server-scheduling tool');
 const dashboardLogin=await post('/dashboard/login/review',{accessCode},{origin});assert.equal(dashboardLogin.status,303);const browserCookie=dashboardLogin.headers.get('set-cookie').split(';')[0];assert.ok(!browserCookie.includes(accessCode));
 const view=await fetch(origin+'/dashboard',{headers:{cookie:browserCookie}});assert.equal(view.status,200);const html=await view.text();assert.ok(html.includes('App Review · synthetic sample account'));assert.ok(html.includes('OpenAI contract rehearsal'));
 assert.ok(!html.includes(mcp)&&!html.includes(accessCode));
 assert.equal((await fetch(origin+'/dashboard',{redirect:'manual',headers:{authorization:`Bearer ${mcp}`}})).status,303);
 assert.equal((await call('/v1/snapshot',undefined,{authorization:`Bearer ${mcp}`})).status,401);evidence.push('Read-only browser dashboard, future titles, no exposed credentials and credential separation');
 const report={checkedAt:new Date().toISOString(),scope:'Live backend contract rehearsal against the separate synthetic OpenAI account. Natural-language/model routing and the saved portal version are not tested here.',status:'passed',evidence,modelReviewCases:'Not run in intended host',demoRecording:'Not recorded'};
 const output=new URL('../../artifacts/plugin/',import.meta.url);mkdirSync(output,{recursive:true});writeFileSync(new URL('backend-contract-results.json',output),JSON.stringify(report,null,2)+'\n');
 console.log('PASS: five positive backend contracts, negative tool boundaries, OAuth/PKCE/consent, tool annotations and read-only dashboard.');
 console.log('Model-routing review cases and the demo recording remain separate checks.');
} finally {
 let cleanupError;
 try { if(mcp&&originalPreferences)await tool('update_quiz_preferences',originalPreferences); } catch(error) { cleanupError=error; }
 const clauses=[];
 if(created.length){assert.ok(created.every(id=>/^[a-f0-9-]{36}$/.test(id)));clauses.push(`DELETE FROM quiz_packs WHERE tenant_id='${tenantId}' AND id IN (${created.map(id=>`'${id}'`).join(',')})`);}
 if(grants.length)clauses.push(`UPDATE credentials SET revoked_at='${new Date().toISOString()}' WHERE tenant_id='${tenantId}' AND token_hash IN (${grants.map(h=>`'${h}'`).join(',')})`);
 if(clauses.length)execFileSync('npx',['wrangler','d1','execute','00quiz','--remote','--command',clauses.join(';')],{cwd:new URL('../',import.meta.url),stdio:'ignore'});
 console.log('Removed only created future packs and revoked only this rehearsal’s grant.');
 if(cleanupError)throw cleanupError;
 console.log('Sample preferences restored.');
}
