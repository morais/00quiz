# App Review notes

This is an iPhone app for five-question quizzes supplied by the user’s own remote MCP agent. It contains no bundled AI provider, subscription, advertising or in-app purchase. The shipping app uses Sign in with Apple for personal accounts.

## Review without a personal agent

On the sign-in screen, expand **Reviewer access**, enter the password from App Store Connect’s secure Sign-In Information field as the **Review access code**, and tap **Open sample account**. The username field is descriptive; no Apple account, mailbox, invitation, payment or external AI account is needed for this dedicated synthetic account.

The sample account exercises the deployed backend. It has five questions for the current real local day and three completed sample days for history and streaks. It is clearly marked as an App Review sample account. Review access cannot reach or modify a real Apple account. It is configured only for one allowlisted synthetic account and can be disabled by the operator.

1. Open today’s quiz. Choose and lock one answer for each question. Correct answers and explanations appear after an attempt.
2. Finish all five to see the score, streak and completion stamp. The completed state is earned regardless of score.
3. Tap **Let a friend try**. This starts a fresh temporary attempt at the same five questions. After the last answer, compare both scores and question results. Guest answers are never sent to the backend or saved to the account.
4. Open **Your streak** to review the previous sample quizzes and explanations.
5. In **Settings → Your interests & preferences**, edit or clear interests, language and difficulty. Leaving them unset lets the user’s agent choose. New accounts have no preset values.
6. **Settings → Restart sample quiz** clears only this synthetic account’s answers for today so the flow can be tested again.
7. **Settings → Your agent** contains the MCP address and setup instructions, a connection list and revocation controls. An agent with remote MCP/OAuth can connect to `https://api.00quiz.com/mcp`. Select reviewer access in its authorization flow and use the same review code, then approve the normal quiz scopes. Question packs are immutable; a tool test may publish tomorrow through seven days ahead. Future quizzes appear in the app only on their real local day.

The hosted instructions require general-audience questions, choices, explanations, host messages and linked sources. Agents must avoid adult, graphic, frightening, hateful and other unsuitable material, gambling or prizes, substance topics and medical treatment advice; user interests do not override these limits. The app has no built-in AI or automated server-side content classifier.

Generating quizzes automatically requires scheduling in the user’s separate agent. A local reminder is only a reminder and does not generate questions. There is no in-app chat, public feed, social account discovery, gambling, prize or paid contest.

## Personal Apple accounts

You may also sign in with Apple without an invitation or pre-created account. Such an account begins with empty preferences and no question pack until an agent publishes one. **Settings → Delete account** requires a fresh matching Apple authentication and removes the personal account and associated quiz data. The synthetic reviewer account instead offers a reset and sign-out. The separate **Try with demo data** button opens a fully local labelled sample quiz.

Privacy: https://00quiz.com/privacy. Support: https://00quiz.com/support.

The raw review code is stored only in the ignored `../00quiz-www/.private/reviewer-access/appstore.json` and App Store Connect’s secure reviewer password field, never in this file or screenshots.
