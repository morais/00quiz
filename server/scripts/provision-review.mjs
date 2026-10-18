#!/usr/bin/env node
// The raw code stays in an ignored, owner-readable file; D1 stores its hash.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.argv.slice(2).some(x => x !== "--local" && x !== "--plugin")) throw new Error("Usage: provision-review.mjs [--local] [--plugin]");
const local = process.argv.includes("--local");
const prefix = process.argv.includes("--plugin") ? ".plugin-review-access" : ".review-access";
const path = join(root, prefix + (local ? ".local.json" : ".json"));
const saved = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {
  tenantId: randomUUID(), accessCode: `qq_review_${randomBytes(32).toString("base64url")}`,
  expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(), provisioned: false,
};
if (!/^[a-f0-9-]{36}$/.test(saved.tenantId) || !/^qq_review_[A-Za-z0-9_-]{43}$/.test(saved.accessCode) || saved.expiresAt <= new Date().toISOString()) throw new Error("Invalid or expired saved reviewer credential");
writeFileSync(path, JSON.stringify(saved, null, 2) + "\n", { mode: 0o600 }); chmodSync(path, 0o600);
const temp = mkdtempSync(join(tmpdir(), "00quiz-review-"));
const sql = x => `'${String(x).replaceAll("'", "''")}'`;
try {
  const seed = join(temp, "seed.sql"), now = new Date().toISOString();
  writeFileSync(seed, `INSERT OR IGNORE INTO tenants (id,created_at,updated_at) VALUES (${sql(saved.tenantId)},${sql(now)},${sql(now)});
INSERT OR IGNORE INTO review_credentials (token_hash,tenant_id,expires_at)
SELECT ${sql(createHash("sha256").update(saved.accessCode).digest("hex"))},id,${sql(saved.expiresAt)} FROM tenants WHERE id=${sql(saved.tenantId)} AND apple_subject IS NULL;`, { mode: 0o600 });
  execFileSync("npx", ["wrangler", "d1", "execute", "00quiz", local ? "--local" : "--remote", "--file", seed], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  saved.provisioned = true;
  writeFileSync(path, JSON.stringify(saved, null, 2) + "\n", { mode: 0o600 });
  console.log(`Synthetic reviewer tenant: ${saved.tenantId}`);
  console.log(`Set REVIEW_TENANT_IDS to this UUID. Code saved in ${path}; enter it only in secure review fields.`);
} finally { rmSync(temp, { recursive: true, force: true }); }
