# 00Quiz

**Five questions. Something new, every day.**

Website: [00quiz.com](https://00quiz.com) · [Support](https://00quiz.com/support) · [Privacy](https://00quiz.com/privacy)

00Quiz is a native iPhone quiz app whose question source is your own MCP agent. Connect an agent, ask it to choose your first questions, and schedule a daily task in that agent. Every morning it reads your interests and performance, then publishes five multiple-choice questions and a friendly host message. There is no bundled AI provider, API key requirement, or automatic question generator inside the app.

The implementation follows sibling projects 00Todo and 00Food: SwiftUI, a Cloudflare Worker with D1, native Sign in with Apple, separate app/MCP credentials, and remote MCP OAuth with Apple web sign-in and explicit consent.

- Exactly five questions per published local calendar day, four choices each, one attempt per question. Correct answers, explanations and optional HTTPS sources appear after answering. Past quizzes reveal their explanations for review.
- Finish all five on consecutive calendar days to earn a streak, regardless of score. A missed day resets it. Today remains open until midnight in the saved time zone.
- After completing a quiz, let a friend try the same five questions on your phone. Guest answers stay in memory, with scores and question results compared at the end. They never change account history, streaks or agent performance data.
- Interests, language and difficulty are optional. The agent can establish defaults; the app can edit or clear them. New native accounts use the iPhone's time zone. Later logins preserve it; Settings can update it when travelling.
- Published quizzes are immutable. Publishing identical content for the same day is idempotent. An agent can prepare today through seven days ahead; future quizzes remain hidden from the app until their day.
- App snapshots cache today's quiz and up to 90 previous quizzes. New answers need a network connection so answer keys stay on the server. Retrying the same submitted choice is safe, including after midnight if the first submission succeeded.
- The app checks for updates every 30 seconds while active. Optional local reminders use the iPhone's current local clock; delivery of a reminder does not establish that a quiz exists. There is no push-notification backend in this version.
- Settings includes active MCP connections, revocation, sign-out, and deletion with fresh Apple reauthentication.
- Quiz-host guidance lives on the backend, available through `get_quiz_instructions` and `/agent-instructions`. Every context response advertises its content-derived version so agents can refresh only when it changes. The copied setup prompt stays short; future guidance changes need only a backend deployment.

## Development

See [Worker setup](server/README.md), [iOS setup](ios/README.md), and the [agent setup guide](docs/agent-setup.md).

The official backend is `https://api.00quiz.com`; its MCP endpoint is `https://api.00quiz.com/mcp`. Real deployment/signing configurations are ignored. Generic `.sample` files are committed. Secrets belong in Cloudflare Worker secrets and private Apple key storage, never in Git.

## Privacy

The service stores an Apple account identifier, optional email, optional interests/language/difficulty, time zone, quizzes, answers and scores. Credentials are stored as hashes in D1. The app holds its credential in Keychain and caches its account's quiz snapshot in protected application storage. The user grants a connected agent access to quiz preferences and performance; the agent can publish quizzes but cannot submit answers. The chosen agent's privacy terms apply to its processing.

The deployed service exposes `/privacy` and a support contact. Account deletion removes quizzes, answers, preferences, OAuth flows and credentials. There is no advertising or cross-app tracking.

## License

Source code is MIT licensed; see [LICENSE](LICENSE). The 00Quiz name and artwork are not; see [docs/brand/LICENSE](docs/brand/LICENSE). Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## App Store release preparation

The listing, six native screenshots and review walkthrough are in [`docs/appstore`](docs/appstore/README.md). A separate simulator-only screenshot app uses production views with fictional fixtures. The release app also supports a clearly labelled, isolated reviewer account so App Review can exercise the live backend without a personal agent account. Credentials and signing/deployment state remain ignored.

## OpenAI plugin preparation

The portable upload source is in [`plugin`](plugin), with review status and recording steps in [`docs/plugin`](docs/plugin/README.md). It connects to the existing OAuth MCP server and reads hosted quiz instructions when their version changes. Run `python3 scripts/package-plugin.py` to build and inspect a public preparation ZIP, or add `--require-ready` to reject missing publication facts or a demo URL. The existing private development plugin remains separate.
