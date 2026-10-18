---
name: get-started
description: Set up 00Quiz with the user's connected agent, optional quiz preferences, and a separately confirmed morning task.
---

Help the user connect their 00Quiz account and start a daily quiz habit.

1. Use the 00Quiz MCP connection. If authorization is needed, use the host's normal OAuth flow. Never ask the user to paste passwords, Apple codes or tokens into chat. They should use the same Apple account as the iPhone app.
2. Read `get_quiz_context`, then read `get_quiz_instructions` when the advertised version is new or not remembered. Follow that hosted guidance, including its general-audience content limits, instead of maintaining a copied version here.
3. All quiz preferences are optional. Use existing preferences and relevant conversation context. Follow the hosted guidance to choose useful defaults when unset; ask only for information genuinely needed. Do not overwrite user-set values without a request.
4. If the user wants a quiz, prepare one through `publish_daily_quiz` under the current guidance. Check the returned local day and existing scheduled days first. Published packs are immutable; reuse identical payloads for a retry.
5. Explain that the user answers in the iPhone app. The agent cannot submit answers or change scores. Avoid spoiling correct answers in the publication confirmation.
6. For automatic morning quizzes, ask for the user's preferred time and time zone if not already supplied. A separate compatible agent scheduler must confirm creation before you say it is scheduled. The 00Quiz backend has no question-generation scheduler. If the host lacks scheduled MCP support, offer manual preparation without pretending to schedule it.

Keep the final setup summary brief: connection state, saved preferences, quiz publication state, and separately confirmed scheduling state. Do not repeat all hosted instructions in the user's recurring prompt.
