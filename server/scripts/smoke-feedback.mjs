#!/usr/bin/env node
// Live feedback contract check on the separate synthetic OpenAI account only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const origin = 'https://api.00quiz.com';
const {accessCode, tenantId} = JSON.parse(readFileSync(new URL('../.plugin-review-access.json', import.meta.url), 'utf8'));
assert.match(tenantId, /^[a-f0-9-]{36}$/);
const grants = [], messages = [`More nature and a little harder. Sample check ${randomUUID()}`];
messages.push(messages[0] + ' More variety too.');
let app, mcp, packId;
const hash = value => createHash('sha256').update(value).digest('hex');
const form = (path, data, headers = {}) => fetch(origin + path, {
  method: 'POST', redirect: 'manual', headers: {'content-type': 'application/x-www-form-urlencoded', ...headers}, body: new URLSearchParams(data),
});
const hidden = (html, name) => {
  const value = html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];
  assert.ok(value, 'Missing OAuth field'); return value;
};
const snapshot = async () => {
  const r = await fetch(origin + '/v1/snapshot', {headers: {authorization: `Bearer ${app}`}});
  assert.equal(r.status, 200); return r.json();
};
const note = async message => {
  const r = await fetch(`${origin}/v1/quizzes/${packId}/feedback`, {
    method: 'PUT', headers: {'content-type': 'application/json', authorization: `Bearer ${app}`}, body: JSON.stringify({message}),
  });
  assert.equal(r.status, 200); return r.json();
};
const context = async () => {
  const r = await fetch(origin + '/mcp', {method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${mcp}`},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'get_quiz_context', arguments: {}}})});
  assert.equal(r.status, 200); const value = await r.json();
  assert.ok(!value.error && !value.result?.isError); return value.result.structuredContent;
};
try {
  const login = await fetch(origin + '/v1/auth/review', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({accessCode})});
  assert.equal(login.status, 201); const native = await login.json();
  app = native.token; grants.push(hash(app));
  assert.equal(native.tenant.id, tenantId); assert.equal(native.tenant.isReview, true);
  const before = await snapshot(), pack = before.history.find(q => q.completed && !q.feedback);
  assert.ok(pack, 'Need an unnoted completed synthetic quiz'); packId = pack.id;
  assert.match(packId, /^[a-f0-9-]{36}$/);

  const callback = 'https://review.example/00quiz-feedback-callback', verifier = randomBytes(32).toString('base64url');
  const registration = await fetch(origin + '/oauth/register', {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({client_name: '00Quiz feedback contract check', redirect_uris: [callback]})});
  assert.equal(registration.status, 201); const {client_id} = await registration.json();
  const query = new URLSearchParams({client_id, redirect_uri: callback, response_type: 'code', code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), resource: origin + '/mcp', scope: 'quiz:read'});
  const flow = hidden(await (await fetch(origin + '/oauth/authorize?' + query)).text(), 'flow');
  const review = await form('/auth/review/callback', {flow, accessCode}, {origin}); assert.equal(review.status, 303);
  const cookie = review.headers.get('set-cookie').split(';')[0];
  const consent = await fetch(review.headers.get('location'), {headers: {cookie}});
  const csrf = hidden(await consent.text(), 'csrf');
  const approved = await form('/oauth/consent', {flow, csrf, decision: 'approve'}, {origin, cookie}); assert.equal(approved.status, 303);
  const code = new URL(approved.headers.get('location')).searchParams.get('code');
  const exchange = await form('/oauth/token', {grant_type: 'authorization_code', client_id, redirect_uri: callback, code, code_verifier: verifier, resource: origin + '/mcp'});
  assert.equal(exchange.status, 200); mcp = (await exchange.json()).access_token; assert.ok(mcp); grants.push(hash(mcp));

  const saved = await note(messages[0]); assert.equal(saved.feedback.message, messages[0]);
  assert.deepEqual(await note(messages[0]), saved);
  assert.equal((await context()).recentFeedback.find(f => f.packId === packId)?.message, messages[0]);
  await note(messages[1]);
  assert.equal((await context()).recentFeedback.find(f => f.packId === packId)?.message, messages[1]);
  const after = await snapshot(), updated = after.history.find(q => q.id === packId);
  assert.deepEqual({...updated, feedback: null}, {...pack, feedback: null});
  assert.deepEqual(after.preferences, before.preferences); assert.deepEqual(after.streak, before.streak);
  await note(''); assert.ok(!(await context()).recentFeedback.some(f => f.packId === packId));
  console.log('PASS: native feedback save, retry, edit and removal; read-only MCP delivery; scores, answers, streaks and preferences unchanged.');
} finally {
  const sql = [];
  if (packId) sql.push(`DELETE FROM quiz_feedback WHERE tenant_id='${tenantId}' AND pack_id='${packId}' AND message IN (${messages.map(m => `CAST(X'${Buffer.from(m).toString('hex')}' AS TEXT)`).join(',')})`);
  if (grants.length) sql.push(`UPDATE credentials SET revoked_at='${new Date().toISOString()}' WHERE tenant_id='${tenantId}' AND token_hash IN (${grants.map(h => `'${h}'`).join(',')})`);
  if (sql.length) execFileSync('npx', ['wrangler', 'd1', 'execute', '00quiz', '--remote', '--command', sql.join(';')], {cwd: new URL('../', import.meta.url), stdio: 'ignore'});
  console.log('Cleaned up only this check’s note and temporary credentials.');
}
