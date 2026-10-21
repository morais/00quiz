-- One row per tenant summarising its completed quiz days, so a snapshot reads
-- one row instead of grouping the tenant's whole history. The server creates
-- a tenant's row from its history the first time a snapshot needs it, then
-- advances it when a pack's fifth answer lands.
CREATE TABLE tenant_streaks (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_day TEXT, current_run INTEGER NOT NULL, longest INTEGER NOT NULL,
  completed_days INTEGER NOT NULL
);
