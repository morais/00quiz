# 00Quiz OpenAI plugin preparation

Updated October 21, 2026. **The local package is structurally validated, but it is not yet ready for submission.** The creator confirmed Pedro Morais as publisher, all supported countries, and free use with no purchases. A real reviewer-accessible demo recording is still pending. Nothing has been uploaded to the submission portal or submitted for review in this task.

## Package and listing

The public upload source is `plugin/`, version **1.0.1**. It preserves the existing development package’s internal identity while keeping the private development installation, release and app bindings unchanged. The public copy declares the actual remote MCP endpoint rather than a private `.app.json` binding. Portal-generated bindings in a finalized release must be preserved separately.

| Field | Draft |
| --- | --- |
| Display name | 00Quiz: Your AI Quizmaster |
| Subtitle | Your personal daily quiz host |
| Category | Entertainment, the supported category matching the daily trivia game |
| Publisher | Pedro Morais, confirmed by the creator; verify the selected identity in the portal |
| Countries | All supported countries, explicitly confirmed; `publication.countries: []` |
| Commerce | Free, with no purchases, subscriptions or checkout; external agent services may charge separately |
| Branding | Approved green option 2 artwork; 1024-pixel listing PNG and 120-pixel composer PNG |
| Website | https://00quiz.com/ |
| Support | https://00quiz.com/support |
| Privacy | https://00quiz.com/privacy |
| Terms | https://00quiz.com/terms |
| MCP | https://api.00quiz.com/mcp, Streamable HTTP, OAuth with dynamic registration |
| Skills | `get-started`, `host-quiz`; onboarding references the included setup skill |

All four URLs were fetched successfully, redirects followed, and their actual text inspected. They identify 00Quiz/Pedro Morais and cover the stated service, agent access, account data, support and policies. These checks do not substitute for the portal’s own validation. The logo was inspected and both PNG dimensions, sizes and paths were verified in the actual ZIP. Optional dark artwork and colors are omitted pending preference; their omission is not a submission blocker.

On October 21 the existing website’s privacy and support pages were updated and published from `../00quiz-www` to describe feedback storage, its use by authorized agents, app-only editing/removal and account deletion. The public responses were checked after deployment. This preserves the existing Cloudflare site and domain; no new Site or audience was created.

The listing includes app-authored post-quiz feedback: the agent reads notes to steer future quizzes, while only the user can edit them in the app. It explains that the iPhone app is required for playing and saving answers, that the agent cannot answer for the user, and that scheduling belongs to a separate compatible agent scheduler. On October 21, App Store Connect reports the companion app’s 1.0 version as **Waiting for Review**. Coordinate public plugin publication with the companion app’s availability; do not claim that it is already downloadable from the App Store.

## Build and validation

```sh
python3 scripts/package-plugin.py
python3 scripts/package-plugin.py --require-ready
```

The first command builds `artifacts/plugin/00quiz-1.0.1-preparation.zip` while the verified demo is missing. It writes a separate `package-report.json`. The strict command refuses an incomplete package. Once all required metadata is present, the filename uses `submission` instead of `preparation`.

The builder reopens the actual ZIP and verifies its inventory, contained icon references, PNG dimensions, manifest identities, OAuth transport/scopes, skill frontmatter, listing lengths, exact supported category, publisher consistency, country field shape, prompts, case counts, required case fields and absence of credential material, private app bindings or lifecycle hooks. It is a local structural validator, not OpenAI’s submission validator. Do not rename an incomplete artifact to imply readiness.

The confirmed publisher populates `interface.developerName` and the root `author.name`; the selected verified portal identity remains authoritative and its verification is not established by the package. An explicit empty `publication.countries` array means no country restriction. `review.commerce` is false, with a matching description. Four natural review prompts are included in addition to the eight MCP cases. No translations are invented. A real verified recording URL belongs in `review.demo_recording_url`; the creator’s planned Dropbox destination is kept privately until it contains the correct video.

## Review cases and evidence

The manifest contains exactly five positive and three negative cases. Their descriptions include setup and observable outcomes; positive cases name exact expected tools.

| Case | Behavior | Natural-language host status |
| --- | --- | --- |
| P1 | Read real context and current hosted guidance | Not run in ChatGPT |
| P2 | Save explicit interests/language/time zone with agent-chosen difficulty | Not run in ChatGPT |
| P3 | Explain actual misses and app-authored feedback for future quizzes | Not run in ChatGPT |
| P4 | Publish tomorrow’s five using saved preferences, feedback and actual performance | Not run in ChatGPT |
| P5 | Publish at the inclusive seven-day-ahead limit | Not run in ChatGPT |
| N1 | Refuse to submit answers or fabricate a perfect score | Not run in ChatGPT |
| N2 | Explain that account deletion needs the app and fresh Apple authentication | Not run in ChatGPT |
| N3 | Explain that 00Quiz has no backend question scheduler | Not run in ChatGPT |

The separate [backend contract report](backend-contract-results.json) records a passing live rehearsal through OAuth, PKCE, consent and actual MCP calls. It covers current instructions/version checks, preference persistence, sample history, both publication dates, retry safety, immutable-pack conflicts, unsupported-tool boundaries, all required boolean annotations and browser isolation. This does **not** establish model routing or saved-portal-version results. The rehearsal restored preferences, removed only its created future packs and revoked only its own grant.

On October 20 the server suite passed **53 tests**, including tenant isolation, answer redaction, future-content hiding, feedback persistence/edit/removal, read-only MCP feedback, HTML escaping, browser session checks and exact domain-challenge routing. TypeScript typecheck and GitHub CI passed. A separate live feedback check verified native save, edit and removal plus MCP delivery, leaving scores, answers, streaks and saved preferences unchanged. Its test note and grants were removed. This later feedback check is separate from the dated October 18 contract report. The deployed Worker version is `3d6dc426-7cc6-4a93-894c-485a181c7172`; the latest internal TestFlight build is `202610201241`. A visual browser check was previously blocked by the Mac being locked.

## Reviewer access and recording

A separate synthetic OpenAI reviewer account is provisioned and enabled alongside the Apple reviewer account. Its high-entropy code and expiry are in ignored, owner-readable `server/.plugin-review-access.json`; the private portal-field instructions are in `server/.plugin-review-access.md`. No reviewer credentials or login instructions are in the public upload. The read-only browser dashboard is deployed, so reviewers need no iPhone to inspect the plugin’s saved data. Normal accounts can use Apple sign-in for their own dashboard.

An authenticated operator can run `node scripts/reset-plugin-review.mjs` from `server` to prepare **only** the dedicated OpenAI sample account before another rehearsal: optional preferences unset, today unanswered, future days free, and a sample note on a completed quiz asking for more nature questions and a little more challenge. Keep the account and its access active for later reviews. Do not substitute a real personal account or change the existing development connection’s account without checking whether it is used by a live task.

See [the recording flow](demo-walkthrough.md). **No 00Quiz recording has been verified.** The creator will record it and replace the file at their planned Dropbox destination; they stated that the current file belongs to another project. That URL is stored only in ignored `artifacts/private/plugin-demo-plan.json`, not in the upload. The visible walkthrough requires the development connection in ChatGPT authorized to the synthetic account. A script, screenshots, a video from another project or a backend report cannot replace the actual demo.

## Final online setup, after preparation

After verifying the correct recording and its access, add its actual URL and rebuild with `--require-ready`. Only then proceed with an authorized portal upload using the intended organization/project and verified publisher. The existing development plugin is a rehearsal environment; do not create a duplicate private plugin merely to upload or record.

In the saved portal draft, verify imported listing, seven-file inventory, two skills, one real MCP connection, cases, recording, country targeting and commerce. Connect through OAuth and run all eight natural-language cases against that exact saved version. Wait for required scans and resolve reported issues.

The production domain-verification endpoint is ready but returns **404 while no actual OpenAI challenge is configured**. Obtain the exact challenge from the intended portal draft, configure it and verify ownership there before marking the domain verified. No fabricated token or verification claim has been added.

Have the authorized developer complete policy/legal attestations in the portal. Submission for review and publication after approval are separate actions; this preparation has performed neither.

Official references: [Package format](https://developers.openai.com/plugins/build/plugins), [submission and field mappings](https://developers.openai.com/plugins/deploy/submission), [remote MCP review](https://developers.openai.com/plugins/deploy/app-review).
