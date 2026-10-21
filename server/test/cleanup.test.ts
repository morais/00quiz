import { afterEach, describe, expect, it } from "vitest";
import { migratedD1 } from "./d1";
import worker from "../src/index";
import type { Env } from "../src/api";

const open: Array<{ close: () => void }> = [];
afterEach(() => { for (const db of open.splice(0)) db.close(); });

describe("scheduled cleanup", () => {
  it("deletes expired and revoked credentials and keeps live ones", async () => {
    const { db, d1 } = migratedD1(); open.push(db);
    db.prepare("INSERT INTO tenants VALUES ('one', 'one', NULL, '2026-01-01', '2026-01-01')").run();
    const credential = db.prepare(`INSERT INTO credentials (token_hash, id, tenant_id, kind, audience, scopes, label, created_at, expires_at, revoked_at)
      VALUES (?, ?, 'one', 'app', 'app', '[]', 'iPhone', '2026-01-01', ?, ?)`);
    credential.run("expired", "a", "2026-01-02T00:00:00Z", null);
    credential.run("revoked", "b", "2999-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
    credential.run("live", "c", "2999-01-01T00:00:00Z", null);
    await worker.scheduled({} as ScheduledController, { DB: d1 } as Env);
    expect(db.prepare("SELECT token_hash FROM credentials").all()).toEqual([{ token_hash: "live" }]);
  });
});
