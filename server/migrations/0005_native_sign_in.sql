ALTER TABLE tenants ADD COLUMN first_native_sign_in_at TEXT;

-- Only the verified native Apple exchange issued app credentials labelled
-- "iOS app". Web/MCP logins, reviewer fixtures and operator credentials are
-- not evidence. Expired/revoked retained native credentials still prove a
-- past sign-in; deleted credentials cannot be reconstructed. This is the
-- earliest surviving evidence, not a claim about an earlier missing login.
UPDATE tenants SET first_native_sign_in_at = (
  SELECT MIN(c.created_at) FROM credentials c
  WHERE c.tenant_id = tenants.id AND c.kind = 'app' AND c.label = 'iOS app'
    AND c.audience LIKE 'https://%/v1'
    AND julianday(c.created_at) IS NOT NULL
)
WHERE apple_subject IS NOT NULL;
