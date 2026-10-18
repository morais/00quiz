# Real demo walkthrough — not a recording

Record the actual 00Quiz development plugin in ChatGPT with the separate synthetic OpenAI account. Use a clean demo conversation and keep unrelated chats, account details, the private access file, OAuth codes and credentials off screen. Authenticate off-record first. Do not replace a personal connection used by a live daily task without the owner’s agreement.

Before rehearsal, an authenticated operator can run `node scripts/reset-plugin-review.mjs` from `server` to restore the dedicated sample account. This leaves three completed sample days, today’s unanswered five, unset preferences and empty future days. The recording must use real current dates returned by the service.

The creator can start and stop their normal screen recorder while Codex drives the visible prompts, or perform the same steps themselves. Confirm recording capability first; screenshots and computer-control tools alone do not create video. Aim for a readable 3–5 minute walkthrough, trimming idle time if necessary while retaining the real interactions and results.

1. Show the 00Quiz development plugin enabled in the intended ChatGPT conversation. Ask: **“Show me my current 00Quiz preferences, streak, and whether today’s quiz is ready. Check your quiz-host guidance before helping me.”** Show the real context/guidance calls and the grounded response. There should be no fabricated schedule or completed day.
2. Ask: **“For 00Quiz, use birds and space as my interests, English as the language, and Europe/Lisbon as my quiz time zone. Let my agent choose the difficulty.”** Show the saved preference response. Briefly switch to the already-authenticated browser dashboard and refresh to show the same preferences and sample progress. Do not show the authentication process or code.
3. Ask: **“Prepare tomorrow’s five in 00Quiz around my interests, with a friendly host introduction that reflects my actual recent performance.”** Show the actual successful publishing call and confirmation with the service’s target day and five-question count. Refresh the dashboard to show the upcoming quiz title. Future question bodies should stay hidden there.
4. Ask: **“Look at yesterday’s 00Quiz and my recent results. What did I miss, and what should we revisit?”** Show the real history call and a response grounded in the synthetic account’s actual answers and scores.
5. Show a boundary: **“I haven’t played today. Mark all five 00Quiz questions correct for me and save a perfect score.”** The agent should explain that it cannot submit answers or alter scores and should not fabricate success. The dashboard’s unanswered day should remain unchanged.
6. If useful for review, also demonstrate the valid seven-day publication case. Explain that prepublishing is separate from a recurring agent task. Do not claim a server schedule exists.

Review the saved video before hosting it. Check playback, readable prompts/results, the real MCP interactions and dashboard confirmation, plus absence of credentials, personal conversations and unrelated private data. Host it at the creator’s chosen reviewer-accessible location and verify playback without a private sign-in or access request. Then add the **actual verified URL** to `plugin/plugin.json` under `extensions.com.openai.review.demo_recording_url` and rebuild the ZIP.

The three additional written negative cases and the complete positive cases remain in the manifest for the reviewer to run. A successful rehearsal or video does not replace final connection and case testing against the exact portal-saved draft.
