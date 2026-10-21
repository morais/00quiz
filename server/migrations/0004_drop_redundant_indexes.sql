-- UNIQUE(tenant_id, day) already indexes packs by tenant and day, and answers
-- are found through their (pack_id, question_index) primary key. Each dropped
-- index cost a row written on every publish or answer.
DROP INDEX packs_tenant_day;
DROP INDEX answers_tenant;
