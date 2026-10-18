# 00Quiz OpenAI plugin preparation

Prepared October 18, 2026. **The local package is structurally validated, but it is not yet ready for submission.** Publisher/country/commerce confirmations and a real reviewer-accessible demo recording are pending. Nothing has been uploaded to the submission portal or submitted for review in this task.

## Package and listing

The public upload source is `plugin/`, version **1.0.1**. It preserves the existing development package’s internal identity while keeping the private development installation, release and app bindings unchanged. The public copy declares the actual remote MCP endpoint rather than a private `.app.json` binding. Portal-generated bindings in a finalized release must be preserved separately.

| Field | Draft |
| --- | --- |
| Display name | 00Quiz: Your AI Quizmaster |
| Subtitle | Your personal daily quiz host |
| Category | Other, preserved from the existing development listing |
| Publisher | Awaiting confirmation of the intended verified individual or business |
| Countries | Awaiting explicit targeting; not inferred from the App Store record |
| Commerce | Awaiting confirmation that the service is free with no purchases or checkout |
| Branding | Approved green option 2 artwork; 1024-pixel listing PNG and 120-pixel composer PNG |
| Website | https://00quiz.com/ |
| Support | https://00quiz.com/support |
| Privacy | https://00quiz.com/privacy |
| Terms | https://00quiz.com/terms |
| MCP | https://api.00quiz.com/mcp, Streamable HTTP, OAuth with dynamic registration |
| Skills | `get-started`, `host-quiz`; onboarding references the included setup skill |

All four URLs were fetched successfully, redirects followed, and their actual text inspected. They identify 00Quiz/Pedro Morais and cover the stated service, agent access, account data, support and policies. These checks do not substitute for the portal’s own validation. The logo was inspected and both PNG dimensions, sizes and paths were verified in the actual ZIP. Optional dark artwork and colors are omitted pending preference; their omission is not a submission blocker.

The listing explains that the iPhone app is required for playing and saving answers, that the agent cannot answer for the user, and that scheduling belongs to a separate compatible agent scheduler. App Store Connect currently reports the companion app’s 1.0 version as **Ready for Review**. Coordinate public plugin publication with the companion app’s availability; do not claim that it is already downloadable from the App Store.

## Build and validation

```sh
python3 scripts/package-plugin.py
python3 scripts/package-plugin.py --require-ready
```

The first command builds `artifacts/plugin/00quiz-1.0.1-preparation.zip` while required preparation facts are missing. It writes a separate `package-report.json`. The strict command refuses an incomplete package. Once all required metadata is present, the filename uses `submission` instead of `preparation`.

The builder reopens the actual ZIP and verifies its inventory, contained icon references, PNG dimensions, manifest identities, OAuth transport/scopes, skill frontmatter, listing lengths, prompts, case counts, required case fields and absence of credential material, private app bindings or lifecycle hooks. It is a local structural validator, not OpenAI’s submission validator. Do not rename an incomplete artifact to imply readiness.

Unknown publication values stay absent. In `extensions.com.openai`, a confirmed publisher populates `interface.developerName` and the root `author.name`; country targeting populates `publication.countries` (an explicit empty array means no country restriction); commerce belongs under `review`, not publication. The selected verified portal identity remains authoritative. No translations are invented. A real verified recording URL belongs in `review.demo_recording_url`; never put a placeholder there.

## Review cases and evidence

The manifest contains exactly five positive and three negative cases. Their descriptions include setup and observable outcomes; positive cases name exact expected tools.

| Case | Behavior | Natural-language host status |
| --- | --- | --- |
| P1 | Read real context and current hosted guidance | Not run in ChatGPT |
| P2 | Save explicit interests/language/time zone with agent-chosen difficulty | Not run in ChatGPT |
| P3 | Explain actual recent misses and topic performance | Not run in ChatGPT |
| P4 | Publish tomorrow’s valid five-question quiz and host message | Not run in ChatGPT |
| P5 | Publish at the inclusive seven-day-ahead limit | Not run in ChatGPT |
| N1 | Refuse to submit answers or fabricate a perfect score | Not run in ChatGPT |
| N2 | Explain that account deletion needs the app and fresh Apple authentication | Not run in ChatGPT |
| N3 | Explain that 00Quiz has no backend question scheduler | Not run in ChatGPT |

The separate [backend contract report](backend-contract-results.json) records a passing live rehearsal through OAuth, PKCE, consent and actual MCP calls. It covers current instructions/version checks, preference persistence, sample history, both publication dates, retry safety, immutable-pack conflicts, unsupported-tool boundaries, all required boolean annotations and browser isolation. This does **not** establish model routing or saved-portal-version results. The rehearsal restored preferences, removed only its created future packs and revoked only its own grant.

The server suite passes **47 tests**, including tenant isolation, answer redaction, future-content hiding, HTML escaping, browser cookie expiry/tampering/revocation, fresh Apple flow binding, and exact domain-challenge routing. TypeScript typecheck passes. The deployed Worker version is `c585e6a2-7fa6-45e7-8ed2-10ce3203cc8a`. The live login response includes the final contrast and policy-link updates; a visual browser check remains pending because the Mac was locked.

## Reviewer access and recording

A separate synthetic OpenAI reviewer account is provisioned and enabled alongside the Apple reviewer account. Its high-entropy code and expiry are in ignored, owner-readable `server/.plugin-review-access.json`; the private portal-field instructions are in `server/.plugin-review-access.md`. No reviewer credentials or login instructions are in the public upload. The read-only browser dashboard is deployed, so reviewers need no iPhone to inspect the plugin’s saved data. Normal accounts can use Apple sign-in for their own dashboard.

An authenticated operator can run `node scripts/reset-plugin-review.mjs` from `server` to reset **only** the dedicated OpenAI sample account before another rehearsal. Keep the account and its access active for later reviews. Do not substitute a real personal account or change the existing development connection’s account without checking whether it is used by a live task.

See [the recording flow](demo-walkthrough.md). **No recording has been made or hosted.** The visible walkthrough requires a development connection in ChatGPT authorized to the synthetic account. Computer control does not itself record video; the creator has been offered a guided recording session. A script, local screenshots or the backend report cannot replace a real demo video.

## Final online setup, after preparation

After the missing facts and verified video link are supplied, rebuild with `--require-ready`. Only then proceed with an authorized portal upload using the intended organization/project and verified publisher. The existing development plugin is a rehearsal environment; do not create a duplicate private plugin merely to upload or record.

In the saved portal draft, verify imported listing, seven-file inventory, two skills, one real MCP connection, cases, recording, country targeting and commerce. Connect through OAuth and run all eight natural-language cases against that exact saved version. Wait for required scans and resolve reported issues.

The production domain-verification endpoint is ready but returns **404 while no actual OpenAI challenge is configured**. Obtain the exact challenge from the intended portal draft, configure it and verify ownership there before marking the domain verified. No fabricated token or verification claim has been added.

Have the authorized developer complete policy/legal attestations in the portal. Submission for review and publication after approval are separate actions; this preparation has performed neither.

Official references: [Package format](https://developers.openai.com/plugins/build/plugins), [submission and field mappings](https://developers.openai.com/plugins/deploy/submission), [remote MCP review](https://developers.openai.com/plugins/deploy/app-review).
