# Bring your own quiz host

1. In ChatGPT, add the [00Quiz plugin](https://chatgpt.com/plugins/plugin_asdk_app_6ad8aaae6cbc8191b9b1dad69f643593). For another remote-MCP-compatible agent, add `https://api.00quiz.com/mcp`.
2. Sign in with the same Apple account as the iPhone app and approve quiz access.
3. Ask the agent to read `get_quiz_instructions` and prepare today's quiz following that guidance.
4. Ask that agent to create a recurring morning task. Connecting MCP and scheduling a task are separate actions. Confirm that its scheduler can call MCP tools without an open conversation; compatibility varies by agent. If it cannot, you can request quizzes manually or use a compatible scheduler.

Tell your agent:

> Prepare today’s 00Quiz, then do it again every morning at 7:00.

The app’s **Copy** button copies only this sentence. The MCP address and connection details for other agents are inside **Using another agent?**. The connected-agent list refreshes when this screen opens or the app becomes active.

The guidance is maintained on the backend in `server/src/agentInstructions.ts`. The agent gets its current version, URL and MCP tool name with every `get_quiz_context` response. It should read the full document on its first run and whenever that version changes. If it cannot retain guidance between runs, it should read it each time. The version is a hash of the document and changes automatically when guidance is edited and deployed; no app update or replacement setup prompt is needed for those edits.

Agents can use `get_quiz_instructions({knownVersion: "<saved version>"})` for a small `{version, changed: false}` response when their guidance is current. A missing or older version returns the full guidance and `changed: true`. HTTP clients can instead read [the public instructions endpoint](https://api.00quiz.com/agent-instructions), save its `ETag`, and send `If-None-Match` on future GET or HEAD requests; unchanged content returns a body-free 304. This endpoint contains generic service guidance only, never account data.

Changes are checked when the agent next runs. The stateless MCP server does not push instructions-change notifications or create additional background polling.

Published quizzes are immutable. An identical retry is safe. Agents can prepare up to seven days ahead. The server never invents performance or generates fallback questions. Streaks require completing all five on consecutive calendar days, so check that your recurring agent task is working.

You can edit/clear interests, language and difficulty in the app. Preferences are optional. The agent can see recent questions, chosen answers and results after authorization, helping it adapt difficulty and review missed concepts. Agents cannot submit answers for you.

Use Settings → Your agent to see connection expiration and revoke access. New MCP connections last 365 days; existing connections retain their original expiry until reauthorized. Access can be revoked at any time. Connection status does not prove a recurring task exists; check the schedule in your agent. Reconnect when a grant expires. Optional iPhone reminders are independent of the agent's schedule.

The hosted guidance requires general-audience questions, choices, explanations, host messages and source links. Interests and difficulty do not override its content limits. Connected agents discover updated limits through the same content-derived instructions version.
