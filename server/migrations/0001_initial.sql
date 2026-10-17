PRAGMA foreign_keys = ON;
CREATE TABLE tenants (
  id TEXT PRIMARY KEY, apple_subject TEXT UNIQUE, email TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE credentials (
  token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('app','mcp')), audience TEXT NOT NULL,
  scopes TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT
);
CREATE INDEX credentials_tenant ON credentials(tenant_id, kind, created_at);
CREATE INDEX credentials_expiry ON credentials(expires_at);
CREATE INDEX credentials_revoked ON credentials(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE TABLE oauth_flows (
  id_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, client_name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL, client_state TEXT,
  resource TEXT NOT NULL, scopes TEXT NOT NULL, apple_nonce TEXT NOT NULL,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, consent_hash TEXT,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX oauth_flows_expiry ON oauth_flows(expires_at);
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL,
  resource TEXT NOT NULL, scopes TEXT NOT NULL, expires_at TEXT NOT NULL, redeemed_at TEXT
);
CREATE INDEX oauth_codes_expiry ON oauth_codes(expires_at);
CREATE TABLE review_credentials (
  token_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE preferences (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  interests TEXT NOT NULL DEFAULT '[]', language TEXT, difficulty TEXT,
  time_zone TEXT NOT NULL DEFAULT 'UTC', updated_at TEXT NOT NULL
);
CREATE TABLE quiz_packs (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day TEXT NOT NULL, title TEXT NOT NULL, host_message TEXT NOT NULL,
  questions TEXT NOT NULL CHECK(json_valid(questions) AND json_array_length(questions) = 5),
  created_at TEXT NOT NULL, UNIQUE(tenant_id, day), UNIQUE(id, tenant_id)
);
CREATE INDEX packs_tenant_day ON quiz_packs(tenant_id, day DESC);
CREATE TABLE answers (
  pack_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
  question_index INTEGER NOT NULL CHECK(question_index BETWEEN 0 AND 4),
  choice_index INTEGER NOT NULL CHECK(choice_index BETWEEN 0 AND 3),
  correct INTEGER NOT NULL CHECK(correct IN (0,1)), answered_at TEXT NOT NULL,
  PRIMARY KEY(pack_id, question_index),
  FOREIGN KEY(pack_id, tenant_id) REFERENCES quiz_packs(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX answers_tenant ON answers(tenant_id, pack_id);
