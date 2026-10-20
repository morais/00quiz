import { afterEach, describe, expect, it, vi } from "vitest";
import { migratedD1 } from "./d1";
import { base64url, sha256Hex } from "../src/auth";
import { resetAppleKeysForTest } from "../src/apple";
import { dashboard, dashboardLogin, dashboardAppleLogin, dashboardAppleCallback, dashboardReviewLogin, dashboardLogout } from "../src/dashboard";
import { openAIAppsChallenge } from "../src/openAIAppsChallenge";
import { publishPack, saveFeedback, submitAnswer, type Env } from "../src/api";
import { reviewQuestions } from "../src/review";
import worker from "../src/index";

const origin = "https://api.00quiz.com", code = "qq_review_" + "A".repeat(43);
const tenant = "11111111-1111-4111-8111-111111111111", real = "22222222-2222-4222-8222-222222222222";
const handles: Array<{ close(): void }> = [];
afterEach(() => { for (const db of handles.splice(0)) db.close(); vi.restoreAllMocks(); vi.useRealTimers(); resetAppleKeysForTest(); });
async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
  const { db, d1 } = migratedD1(); handles.push(db);
  db.prepare("INSERT INTO tenants(id,created_at,updated_at) VALUES (?,?,?)").run(tenant,"now","now");
  db.prepare("INSERT INTO tenants(id,apple_subject,created_at,updated_at) VALUES (?,?,?,?)").run(real,"apple-subject","now","now");
  db.prepare("INSERT INTO review_credentials(token_hash,tenant_id,expires_at) VALUES (?,?,?)").run(await sha256Hex(code),tenant,"2027-10-18T12:00:00Z");
  const env: Env = { DB:d1, PUBLIC_ORIGIN:origin, APP_NAME:"00Quiz", OAUTH_SIGNING_SECRET:"test-signing-secret-at-least-thirty-two-characters", REVIEW_TENANT_IDS:tenant,
    APPLE_WEB_CLIENT_ID:"com.example.quiz.web", APPLE_WEB_REDIRECT_URI:origin+"/auth/apple/callback", APPLE_PRIVATE_KEY:"test-key-for-redirect-only", APPLE_TEAM_ID:"TEST", APPLE_KEY_ID:"TEST" };
  return { db, env };
}
const request = (path: string, cookie = "") => new Request(origin+path,{headers:{cookie}});
async function signIn(env: Env, accessCode = code, requestOrigin = origin) {
  return dashboardReviewLogin(new Request(origin+"/dashboard/login/review",{method:"POST",headers:{origin:requestOrigin},body:new URLSearchParams({accessCode})}),env);
}
async function cookie(env: Env) {
  const r=await signIn(env); expect(r.status).toBe(303); expect(r.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Lax");
  expect(r.headers.get("set-cookie")).not.toContain(code); return r.headers.get("set-cookie")!.split(";")[0];
}

describe("read-only quiz dashboard", () => {
  it("requires its own browser session and offers Apple or reviewer sign-in", async () => {
    const {env}=await setup(); expect((await dashboard(request("/dashboard"),env)).status).toBe(303);
    const r=await dashboardLogin(request("/dashboard/login"),env),html=await r.text();expect(html).toContain("Sign in with Apple");expect(html).toContain("Reviewer access");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect((await dashboard(new Request(origin+"/dashboard",{headers:{authorization:"Bearer qq_app_"+"A".repeat(43)}}),env)).status).toBe(303);
  });
  it("shows only the signed-in tenant, escapes content, hides future keys and does not submit answers", async () => {
    const {db,env}=await setup(),session=await cookie(env);
    const current=db.prepare("SELECT id FROM quiz_packs WHERE tenant_id=? AND day='2026-10-18'").get(tenant) as {id:string};
    db.prepare("UPDATE quiz_packs SET host_message=? WHERE id=?").run('<script>alert("host")</script>',current.id);
    await publishPack(env,real,{day:"2026-10-18",title:"Other account secret",hostMessage:"Private",questions:reviewQuestions});
    await publishPack(env,tenant,{day:"2026-10-19",title:"Future show",hostMessage:"DO NOT REVEAL FUTURE HOST",questions:reviewQuestions.map(q=>({...q,explanation:"DO NOT REVEAL FUTURE EXPLANATION"}))});
    let r=await dashboard(request("/dashboard",session),env),html=await r.text();
    expect(html).toContain("App Review · synthetic sample account");expect(html).toContain("Future show");expect(html).toContain("Let my agent choose");
    expect(html).not.toContain("Other account secret");expect(html).not.toContain("DO NOT REVEAL FUTURE");
    expect(html).toContain("&lt;script&gt;");expect(html).not.toContain('<script>alert("host")</script>');
    const todaySection=html.split('<section><h2>2026-10-18')[1].split('<section><h2>Upcoming')[0];
    expect(todaySection).not.toContain("Octopuses have three hearts");
    expect(db.prepare("SELECT COUNT(*) AS n FROM answers WHERE pack_id=?").get(current.id)).toMatchObject({n:0});
    await submitAnswer(env,tenant,current.id,{questionIndex:0,choiceIndex:1});
    html=await(await dashboard(request("/dashboard",session),env)).text();expect(html).toContain("Octopuses have three hearts");expect(r.headers.get("cache-control")).toBe("no-store");
    const previous=db.prepare("SELECT id FROM quiz_packs WHERE tenant_id=? AND day<'2026-10-18' ORDER BY day DESC LIMIT 1").get(tenant) as {id:string};
    await saveFeedback(env,tenant,previous.id,{message:'More nature <script>alert("feedback")</script>'});
    html=await(await dashboard(request("/dashboard",session),env)).text();
    expect(html).toContain("Your feedback for future quizzes");
    expect(html).toContain('More nature &lt;script&gt;alert(&quot;feedback&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert("feedback")</script>');
  });
  it("rejects cross-origin, invalid, revoked, expired, tampered and unallowlisted review sessions", async () => {
    const {db,env}=await setup();expect((await signIn(env,code,"https://evil.example")).status).toBe(403);expect((await signIn(env,"invalid")).status).toBe(401);
    expect((await signIn(env,"x".repeat(2048))).status).toBe(400);
    const session=await cookie(env),tampered=session+"x";expect((await dashboard(request("/dashboard",tampered),env)).status).toBe(303);
    env.REVIEW_TENANT_IDS="";expect((await dashboard(request("/dashboard",session),env)).status).toBe(303);env.REVIEW_TENANT_IDS=tenant;
    db.exec("UPDATE review_credentials SET revoked_at='revoked'");expect((await dashboard(request("/dashboard",session),env)).status).toBe(303);
    db.exec("UPDATE review_credentials SET revoked_at=NULL,expires_at='2026-01-01'");expect((await signIn(env)).status).toBe(401);
  });
  it("rechecks a synthetic tenant and a browser session's expiry on every read", async () => {
    const {db,env}=await setup(),session=await cookie(env);
    db.prepare("UPDATE tenants SET apple_subject='became-real' WHERE id=?").run(tenant);expect((await dashboard(request("/dashboard",session),env)).status).toBe(303);
    db.prepare("UPDATE tenants SET apple_subject=NULL WHERE id=?").run(tenant);vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));expect((await dashboard(request("/dashboard",session),env)).status).toBe(303);
  });
  it("binds the Apple callback to the browser state, nonce and signed flow cookie", async () => {
    const {env}=await setup(),login=await dashboardAppleLogin(env),url=new URL(login.headers.get("location")!);
    const flowCookie=login.headers.get("set-cookie")!.split(";")[0];expect(login.headers.get("set-cookie")).toContain("SameSite=None");
    const bad=await dashboardAppleCallback(new Request(origin+"/auth/apple/callback",{method:"POST",headers:{cookie:flowCookie}}),env,new URLSearchParams({state:"qqdash_"+"B".repeat(32)}));expect(bad.status).toBe(401);
    const rsa=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]) as CryptoKeyPair;
    const ec=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]) as CryptoKeyPair;
    env.APPLE_PRIVATE_KEY=`-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8",ec.privateKey))))}\n-----END PRIVATE KEY-----`;
    const encode=(v:unknown)=>base64url(new TextEncoder().encode(JSON.stringify(v))),now=Math.floor(Date.now()/1000);
    const input=encode({alg:"RS256",kid:"dashboard-test"})+"."+encode({iss:"https://appleid.apple.com",aud:env.APPLE_WEB_CLIENT_ID,sub:"apple-subject",iat:now,exp:now+600,nonce:url.searchParams.get("nonce")});
    const token=input+"."+base64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",rsa.privateKey,new TextEncoder().encode(input))));
    const jwk=await crypto.subtle.exportKey("jwk",rsa.publicKey);
    vi.spyOn(globalThis,"fetch").mockImplementation(async target=>String(target).endsWith("/auth/keys")?Response.json({keys:[{...jwk,kid:"dashboard-test"}]}):Response.json({id_token:token,access_token:"test-only"}));
    const callback=await dashboardAppleCallback(new Request(origin+"/auth/apple/callback",{method:"POST",headers:{cookie:flowCookie}}),env,new URLSearchParams({state:url.searchParams.get("state")!,id_token:token,code:"test"}));expect(callback.status).toBe(303);
    const session=callback.headers.get("set-cookie")!.match(/qq_dashboard_session=[^;]+/)![0];
    expect((await dashboard(request("/dashboard",session),env)).status).toBe(200);
  });
  it("clears only the browser cookie on same-origin sign-out", async () => {
    const {env}=await setup(),session=await cookie(env);
    expect(dashboardLogout(new Request(origin+"/dashboard/logout",{method:"POST",headers:{origin:"https://evil.example",cookie:session}}),env).status).toBe(403);
    const r=dashboardLogout(new Request(origin+"/dashboard/logout",{method:"POST",headers:{origin,cookie:session}}),env);expect(r.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("OpenAI domain verification", () => {
  it("returns only the configured challenge on the verification route", async () => {
    const {env}=await setup();expect(openAIAppsChallenge(request("/.well-known/openai-apps-challenge"),env).status).toBe(404);
    env.OPENAI_APPS_CHALLENGE_TOKEN="challenge-fixture";const r=openAIAppsChallenge(request("/.well-known/openai-apps-challenge"),env);expect(await r.text()).toBe("challenge-fixture");expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await openAIAppsChallenge(new Request(origin+"/.well-known/openai-apps-challenge",{method:"HEAD"}),env).text()).toBe("");
  });
  it("routes browser callbacks separately and keeps dashboard and challenge methods read-only", async () => {
    const {env}=await setup(),ctx={waitUntil:vi.fn()} as unknown as ExecutionContext;
    const call=(path:string,method="GET",body?:URLSearchParams)=>worker.fetch(new Request(origin+path,{method,body}),env,ctx);
    expect((await call("/auth/apple/callback","POST",new URLSearchParams({state:"qqdash_"+"A".repeat(32)}))).status).toBe(401);
    expect((await call("/auth/apple/callback","POST",new URLSearchParams({state:"invalid-mcp-flow"}))).status).toBe(400);
    expect((await call("/dashboard","POST")).status).toBe(404);
    env.OPENAI_APPS_CHALLENGE_TOKEN="challenge-fixture";
    expect(await(await call("/.well-known/openai-apps-challenge")).text()).toBe("challenge-fixture");
    expect((await call("/.well-known/openai-apps-challenge/")).status).toBe(404);
    expect((await call("/.well-known/openai-apps-challenge","POST")).status).toBe(404);
  });
});
