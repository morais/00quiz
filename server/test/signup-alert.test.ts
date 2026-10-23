import { afterEach, describe, expect, it, vi } from "vitest";
import { migratedD1 } from "./d1";
import { findOrCreateTenant } from "../src/auth";
import * as alerts from "../src/signupAlert";
import type { Env } from "../src/api";

const open: Array<{ close(): void }> = [];
afterEach(() => { vi.restoreAllMocks(); for (const db of open.splice(0)) db.close(); });

describe("new-account operator alerts", () => {
  it.each(["app", "mcp", "dashboard"] as const)("alerts once for a new account via %s, without alerting on later logins", async source => {
    const { db, d1 } = migratedD1(); open.push(db);
    const env = { DB: d1 } as Env;
    const send = vi.spyOn(alerts, "sendNewTenantAlert").mockResolvedValue(undefined);
    const tasks: Promise<unknown>[] = [];
    const ctx = { waitUntil: (task: Promise<unknown>) => tasks.push(task) } as unknown as ExecutionContext;
    const first = await findOrCreateTenant(env, "apple-subject", "owner@example.com", { source, ctx });
    const again = await findOrCreateTenant(env, "apple-subject", "updated@example.com", { source, ctx });
    expect(again.id).toBe(first.id);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(env, expect.objectContaining({
      source, tenantId: first.id, ownerEmail: "owner@example.com",
    }));
    expect(tasks).toHaveLength(1);
    await Promise.all(tasks);
    expect(again.email).toBe("updated@example.com");
    expect(db.prepare("SELECT count(*) AS count FROM tenants").get()).toMatchObject({ count: 1 });
  });

  it("stays off until both the recipient and restricted email binding are configured", async () => {
    const binding = { send: vi.fn() } as unknown as SendEmail;
    expect(alerts.signupAlertsConfigured({} as Env)).toBe(false);
    expect(alerts.signupAlertsConfigured({ SIGNUP_ALERTS: binding } as Env)).toBe(false);
    expect(alerts.signupAlertsConfigured({ SIGNUP_ALERT_TO: "owner@example.com" } as Env)).toBe(false);
    expect(alerts.signupAlertsConfigured({ SIGNUP_ALERTS: binding, SIGNUP_ALERT_TO: "  " } as Env)).toBe(false);
    const env = { SIGNUP_ALERTS: binding, SIGNUP_ALERT_TO: "owner@example.com" } as Env;
    expect(alerts.signupAlertsConfigured(env)).toBe(true);
    await alerts.sendNewTenantAlert({ SIGNUP_ALERTS: binding } as Env, {
      source: "app", tenantId: "not-created", createdAt: new Date().toISOString(),
    });
    expect(binding.send).not.toHaveBeenCalled();
  });
});
