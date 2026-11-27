-- Badge delivery is opt-in per app installation, never an MCP permission.
-- Keep the credential hash after expiry so a final badge clear can be sent.
CREATE TABLE quiz_badge_devices (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  device_token TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('production', 'development')),
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
  revision TEXT NOT NULL,
  last_badge INTEGER CHECK(last_badge IN (0, 1)),
  badge_day TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, installation_id),
  UNIQUE(environment, device_token)
);
