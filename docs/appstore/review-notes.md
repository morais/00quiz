# App Review notes

This is an iPhone and iPad app for five-question quizzes supplied by the user’s own remote MCP agent. It also runs in a resizable window on Apple silicon Macs. It contains no bundled AI provider, subscription, advertising or in-app purchase. The shipping app uses Sign in with Apple for personal accounts.

## Review without a personal agent

On the sign-in screen, expand **Reviewer access**, enter the password from App Store Connect’s secure Sign-In Information field as the **Review access code**, and tap **Open sample account**. The username field is descriptive; no Apple account, mailbox, invitation, payment or external AI account is needed for this dedicated synthetic account.

The labelled sample account exercises the deployed backend with five questions for today and three completed sample days. It cannot access a real Apple account.

1. Open today’s quiz. Choose and lock one answer for each question. Correct answers and explanations appear after an attempt.
2. Finish all five to see the score, streak and completion stamp. The completed state is earned regardless of score. **Share feedback** saves an optional note that the connected agent can read to adapt future quizzes; it does not change saved answers or scores.
3. Tap **Let a friend try**. This starts a fresh temporary attempt at the same five questions. After the last answer, compare both scores and question results. Guest answers are never sent to the backend or saved to the account.
4. Open **Your streak** to review the previous sample quizzes and explanations.
5. In **Settings → Your interests & preferences**, edit or clear interests, language and difficulty. Leaving them unset lets the user’s agent choose. New accounts have no preset values.
6. **Settings → Restart sample quiz** clears only this synthetic account’s answers for today so the flow can be tested again.
7. **Settings → Your agent** contains ChatGPT and Claude setup links, a connection list and revocation controls. Expand **Using another agent?** for the MCP address and manual setup instructions. An agent with remote MCP/OAuth can connect to `https://api.00quiz.com/mcp`. Select reviewer access in its authorization flow and use the same review code, then approve the normal quiz scopes. Question packs are immutable. Publish test packs for tomorrow through seven days ahead; they appear on their real local day.
8. The welcome flow appears after first sign-in. To replay it, tap **Version** in Settings, enable **Replay onboarding on next launch**, then quit and reopen the app. **Done** on its agent screen completes onboarding; the replay keeps existing account data.

Hosted instructions require general-audience content and sources. Adult, graphic, frightening, hateful and other unsuitable material, gambling/prizes, substance topics and medical treatment advice are prohibited. User interests do not override these limits. There is no built-in AI or automated server-side content classifier.

Generating quizzes automatically requires scheduling in the user’s separate agent. A local reminder is only a reminder and does not generate questions. There is no in-app chat, public feed, social account discovery, gambling, prize or paid contest.

## Personal Apple accounts

Apple sign-in needs no invitation. New accounts have empty preferences and no quiz until an agent publishes one. **Settings → Delete account** requires a fresh matching Apple authentication and removes the personal account and associated quiz data. The synthetic reviewer account instead offers a reset and sign-out. The separate **Try with demo data** button opens a fully local labelled sample quiz.

Privacy: https://00quiz.com/privacy. Support: https://00quiz.com/support.

The raw review code is stored only in the ignored `../00quiz-www/.private/reviewer-access/appstore.json` and App Store Connect’s secure reviewer password field, never in this file or screenshots.
