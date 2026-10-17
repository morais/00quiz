# Security policy

## Reporting a vulnerability

Please report security issues **privately**, not through public GitHub issues.

Use GitHub's [private vulnerability
reporting](https://github.com/morais/00quiz/security/advisories/new), the
"Report a vulnerability" button under this repository's **Security** tab. It
opens a private advisory only you and the maintainers can see.

Please include:

- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- The affected component (`server/`, `ios/`, or specific files)
- Whether you'd like to be credited in the fix announcement

You'll get an acknowledgement within 3 working days. We aim to ship a fix or
mitigation within 30 days for high-severity issues; coordinated disclosure
timelines are negotiable.

## Scope

In scope:

- The Cloudflare Worker under `server/` (REST API, MCP endpoint, OAuth
  authorization server, Sign in with Apple, tenant isolation)
- The iOS app under `ios/` (Keychain handling, cached quiz snapshots, guest
  friend rounds)

Out of scope:

- Noisy or destructive probes against the hosted deployment at
  `api.00quiz.com`. Bugs in the code apply equally to a local Worker.
- Bugs in upstream dependencies (zod, Wrangler, Cloudflare Workers, Apple
  frameworks). Report those upstream.
- The content of questions an agent publishes. Agents are chosen and
  authorized by the user.
- Issues that require physical access to an unlocked device, or a malicious
  profile or sideloaded build.

## Defensive properties this project tries to maintain

If you find a way to break any of these, please report it:

1. **Tenant isolation.** Every quiz, answer, preference, and credential row
   is scoped by `tenant_id`, and account deletion cascades to all of them.
2. **Credential opacity.** App and MCP credentials are stored only as SHA-256
   hashes. App credentials cannot call MCP, and MCP credentials cannot call
   REST.
3. **Hidden answer keys.** The app never receives a question's correct answer
   or explanation before that question is answered, and each question accepts
   one answer. Agents can publish quizzes but have no tool to submit answers.
4. **Apple identity validation.** Sign-in verifies the identity token's RS256
   signature against Apple's keys, its issuer, audience, lifetime, and nonce,
   then exchanges the one-time code with Apple and requires the same subject.
5. **OAuth for MCP.** Authorization codes require S256 PKCE, are bound to the
   client, redirect URI, and resource, and are redeemable exactly once. The
   consent page is protected by a per-flow secret cookie and form token.
6. **Bounded inputs.** Every endpoint caps request bodies and validates field
   lengths.

## Things that look bad but aren't

- `wrangler.toml.sample` and `project.yml.sample` contain placeholders such as
  `REPLACE_WITH_D1_DATABASE_ID` and `com.example`. The real `wrangler.toml`
  and `project.yml` are gitignored.
- `server/scripts/smoke-production.mjs` creates a synthetic account directly
  in the maintainer's D1 database and deletes it afterwards. It needs Wrangler
  access to that database and cannot run against the hosted service otherwise.
- The demo quiz and its answer key in `ios/Sources/DemoData.swift` are sample
  content for the app's offline demo mode, not account data.
