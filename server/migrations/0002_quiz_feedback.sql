CREATE TABLE quiz_feedback (
  pack_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),
  updated_at TEXT NOT NULL,
  FOREIGN KEY(pack_id, tenant_id) REFERENCES quiz_packs(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX feedback_tenant_updated ON quiz_feedback(tenant_id, updated_at DESC);
