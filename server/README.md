# 00Quiz Worker

TypeScript Worker + D1, based on 00Todo's Apple/OAuth implementation. Install with `npm ci`; run `npm run typecheck` and `npm test`. Tests use SQLite with foreign keys and all real migrations, plus focused Apple and OAuth tests.

Copy `wrangler.toml.sample` to ignored `wrangler.toml`. Set your public origin, native App ID, web Services ID, Apple team/key identifiers, route and D1 database. Enable Sign in with Apple on the native App ID; associate the Services ID and private key with it. Register `https://<api-host>/auth/apple/callback` for web sign-in. Create D1 with `npx wrangler d1 create <name>` and apply `npx wrangler d1 migrations apply <name> --remote`.

Streaks come from a per-account summary in `tenant_streaks`, so a snapshot reads one row instead of the whole history. Apply `0003_streak_summary.sql` before deploying a server that reads it. Each account's summary is built from its history on its first snapshot, then advanced when a quiz's fifth answer lands. Code that adds or removes answers any other way calls `refreshStreak`.

Install `APPLE_PRIVATE_KEY` and a random 32+ character `OAUTH_SIGNING_SECRET` with Wrangler secrets. An App Store Connect API key is separate from the Sign in with Apple key. Verify `npx wrangler whoami` before deploying with `npm run deploy`. Optional `MCP_VERIFIED_CLIENTS` maps exact client callback URLs to trusted display names on the consent page. Unknown clients remain usable and are labelled unverified.

## REST

`GET /agent-instructions` serves public, account-independent quiz-host guidance as `{version, format, instructions}`. The version is derived from the full document content. GET/HEAD support `ETag` and `If-None-Match`, including weak validators, with `304 Not Modified` when current. Reads do not query D1. The guidance includes general-audience content limits for questions, choices, feedback, host messages and sources; user preferences do not override them. These are publishing instructions for the external agent, not an automated server-side content classifier. Edit `src/agentInstructions.ts` and deploy to update guidance; no app update, manual revision bump or copied-prompt change is needed.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/auth/apple` | Native Apple identity token/code/nonce exchange; optional initial IANA `timeZone` |
| POST | `/v1/auth/review` | Optional code exchange for an allowlisted synthetic App Review account |
| POST | `/v1/review/reset` | Restart only the synthetic reviewer account’s current quiz |
| POST | `/v1/auth/logout` | Revoke the current app credential |
| POST | `/v1/auth/delete-account` | Fresh matching Apple sign-in, token revocation, cascading data deletion |
| GET | `/v1/snapshot` | Today's redacted quiz, preferences, streaks and 90 previous quizzes |
| PATCH | `/v1/preferences` | Optional interests/language/difficulty/timeZone; omitted fields preserved |
| POST | `/v1/quizzes/:id/answers` | `{questionIndex: 0..4, choiceIndex: 0..3}`; returns updated snapshot |
| GET | `/v1/account/mcp-connections` | List active agent grants |
| DELETE | `/v1/account/mcp-connections/:id` | Revoke one agent grant |

App credentials cannot access MCP. MCP credentials cannot access REST or submit answers. Every query is tenant-scoped. Composite foreign keys also prevent cross-account answer insertion. Published packs and answers use unique constraints for concurrent/retried writes. Answer keys never reach the phone before an attempt, except for past-day review. Quizzes are closed according to the server's clock and saved IANA time zone; callers cannot pass a fictitious current date.

## MCP

Streamable HTTP JSON-RPC at `/mcp`, OAuth authorization code with S256 PKCE and resource-bound scopes `quiz:read` / `quiz:write`. Discovery is at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.

| Tool | Scope | Purpose |
| --- | --- | --- |
| `get_quiz_instructions` | read | Current versioned guidance; optional `knownVersion` returns `{version, changed: false}` if current, or the full document with `changed: true` |
| `get_quiz_context` | read | Preferences, local day, current quiz, streaks, topic totals over up to 90 recent quizzes, latest 7 history items, upcoming days and `agentInstructions` version/URL/tool metadata |
| `get_quiz_history` | read | Up to 90 history items with actual choices, results and explanations |
| `update_quiz_preferences` | write | Set defaults or apply user-requested changes |
| `publish_daily_quiz` | write | Publish one immutable five-question pack and its host message |

Pack input is `{day, title, hostMessage, questions}`. Each question has `{prompt, topic, choices, correctIndex, explanation, sourceURL?}`. There must be exactly five distinct prompts, four distinct choices each, and one correct index 0–3. Sources, when supplied, must use HTTPS. The server validates shape; the publishing agent is responsible for factual verification and the user's content preferences.

No server-side cron generates questions. The user schedules tool calls in their agent. No third-party AI key is required by the service.

Each run should read context and compare `agentInstructions.version` with the guidance it last read. Refresh through `get_quiz_instructions` only when new, or every run if the agent cannot persist its guidance. Version metadata rides on the existing context call; there is no extra change-polling request, subscription or persistent connection. Old prompts that already call context also receive the new version and pointer to current guidance.

`scripts/smoke-production.mjs` checks the official deployment using a short-lived synthetic account, including publish/retry, scoring, streaks, feedback, credential separation and the OAuth redirect to Apple. It requires authenticated Wrangler, prints no raw credentials, and removes its own account in a finally block. It does not test an actual human's Apple consent round trip.

## App Review access

Reviewer access is disabled unless `REVIEW_TENANT_IDS` names a dedicated synthetic tenant. Run `node scripts/provision-review.mjs` to provision one (or `--local` for development). The raw high-entropy code is written only to ignored `../00quiz-www/.private/reviewer-access/appstore.json` (relative to the app repository root) with mode 0600; D1 stores its hash and expiry. Add the printed tenant UUID to the Worker variable, deploy after verifying Wrangler authentication, and place the code in App Store Connect’s secure reviewer password field. Never put it in notes, screenshots, source control or a distributed app binary.

Both native and MCP review sign-in require an unrevoked, unexpired code and an allowlisted tenant whose Apple subject is null. A real Apple account cannot be used even if the allowlist is misconfigured. The native exchange issues a normal app-only credential; MCP still uses resource-bound OAuth, PKCE and consent. Review access creates five fixed questions for the real local day and three completed sample days, preserves existing answers and agent-published packs, and offers a reviewer-only reset. Personal accounts never receive these fixtures.

`node scripts/smoke-review.mjs` exercises the deployed synthetic reviewer account, scoring, reset, OAuth consent, PKCE, MCP context and app/MCP credential separation. It restores today’s sample quiz and revokes only its own test grants. Removing the tenant from `REVIEW_TENANT_IDS` disables further review exchanges; revoke its existing credentials as well when retiring access.

## Post-quiz feedback

Native sessions can `PUT /v1/quizzes/:id/feedback` with `{ "message": "More nature, a little harder" }` after all five answers. Notes are trimmed, limited to 1,000 UTF-16 code units, and saved once per account-owned quiz; an empty message removes the note. Identical retries preserve the note’s timestamp. Notes cascade with account/quiz deletion and are included in snapshots and history as nullable `feedback`. Review sample reset also removes that day’s note.

MCP can read but cannot write feedback. `get_quiz_context.recentFeedback` returns up to 20 notes ordered by their latest edit, independently of its seven-item quiz history. The versioned hosted guidance tells agents to use these as requests about future quiz content, without changing published packs or silently replacing saved preferences. Apply the additive `0002_quiz_feedback.sql` migration before deploying this server. Older iOS clients ignore the added response field.

`node scripts/smoke-feedback.mjs` verifies native save/edit/remove and read-only MCP delivery against an unnoted completed quiz in the separate synthetic OpenAI account. It leaves answers, scores, streaks and preferences unchanged, removes its own temporary note and revokes its own temporary credentials. Wrangler authentication is required for cleanup.

## OpenAI plugin review

The plugin upload source and review materials are in the private sibling `../../00quiz-www/plugin-submission` directory; its README documents packaging and review status. `GET /dashboard` offers a read-only browser view of preferences, quiz progress, current questions, recent history and future quiz titles. Apple sign-in reuses the registered web Services ID and callback, with a signed ten-minute state/nonce cookie and a signed 24-hour HttpOnly browser session. These cookies are not app or MCP credentials. Every read rechecks the account; synthetic reviewer sessions also recheck the code’s revocation, expiry, allowlist and absence of an Apple subject. The dashboard cannot submit answers or edit account data. Question and host text is HTML-escaped; future question contents remain hidden.

Run `node scripts/provision-review.mjs --plugin` to provision the separate synthetic OpenAI reviewer account. Add its printed UUID alongside the existing Apple reviewer UUID in `REVIEW_TENANT_IDS`. The raw code stays only in ignored `00quiz-www/.private/reviewer-access/openai.json` (0600). Secure portal-field instructions are in ignored `00quiz-www/.private/reviewer-access/openai-instructions.md`; neither belongs in the plugin ZIP. `node plugin-submission/scripts/reset-plugin-review.mjs` (from `00quiz-www`) explicitly prepares only that OpenAI test account’s preferences, today’s answers and future packs, plus a labelled sample feedback note on a completed quiz, for another rehearsal.

`node plugin-submission/scripts/smoke-plugin-review.mjs` (from `00quiz-www`) exercises five backend contracts through actual OAuth/PKCE/consent and MCP calls, tool annotations, unsupported-tool boundaries and dashboard isolation. It restores preferences, deletes only its own created packs and revokes its own grant. Its passing status does not establish that natural-language review cases passed in ChatGPT or that a demo was recorded.

For portal domain verification, set the portal’s exact `OPENAI_APPS_CHALLENGE_TOKEN` in ignored Wrangler variables. `GET /.well-known/openai-apps-challenge` returns only that token as uncached plain text; HEAD has no body, the route is 404 while unset, and there is no trailing-slash alias. Do not invent a token or report ownership verified until OpenAI confirms it.

Reviewer operator scripts resolve credentials outside this public checkout, defaulting to the private sibling `00quiz-www/.private/reviewer-access/`. Set `QUIZ_REVIEW_ACCESS_DIR` for another private operator directory. Provisioning refuses paths inside this checkout and writes owner-only files. Submission-specific reset and smoke scripts live in `00quiz-www/plugin-submission/scripts/`.
