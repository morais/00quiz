# 00Quiz App Store preparation

Version 1.0 was prepared on October 17, 2026 for [App Store Connect](https://appstoreconnect.apple.com/apps/6823917960/distribution/ios/version/inflight). The app and its review draft are **Ready for Review**, with no submitted date. **It has not been submitted to App Review.**

## Prepared release

| Item | Configuration |
| --- | --- |
| App | 00Quiz: Your AI Quizmaster · `com.00quiz.app` |
| Version/build | 1.0 / 202610172208 |
| Platforms | iPhone, iOS 27+, portrait and landscape; Mac and Apple Vision distribution disabled |
| Build | Apple processing VALID; selected for version 1.0 and assigned to the existing internal TestFlight group |
| Release | Manual release after approval |
| Listing | English (US); text and URLs in `metadata.json` |
| Categories | Games → Trivia; secondary Education |
| Price | Free; no advertising, purchases or subscription |
| Availability | 174 regions enabled; mainland China disabled, matching the sibling availability pattern; new territories require explicit configuration |
| Rating | 13+ calculated by Apple for frequent trivia contests; no adult override; general-audience content limits in the hosted agent guidance |
| Screenshots | Six opaque 1320 × 2868 native captures, all COMPLETE in `APP_IPHONE_67` |
| Reviewer | Live synthetic account with secure code in App Store Connect’s reviewer password field; contact copied from the existing 00Food record |

Apple requires additional authorizations for games in mainland China; no authorization number has been supplied or invented. See [Apple’s regional requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/).

## Privacy

The app’s bundled privacy manifest and the prepared App Store privacy answers declare email address and user ID for account functionality, plus gameplay and other user content for functionality and personalization. All are linked to the account; none are used for tracking. UserDefaults uses required-reason code CA92.1.

The user approved the final App Store privacy attestation. Publication was verified in App Store Connect after the Mac was unlocked: the page shows Published and the same four data types.

The public [privacy](https://00quiz.com/privacy), [support](https://00quiz.com/support), and [marketing](https://00quiz.com/) URLs return successful responses and contain the account, agent, deletion and support information.

## Reviewer access

`review-notes.md` documents the feature walkthrough. The secure review code is only in ignored `../00quiz-www/.private/reviewer-access/appstore.json` and Apple’s reviewer password field. It is not embedded in the app, screenshots, notes or repository. The synthetic account is allowlisted, cannot be a personal Apple account, and exercises normal backend APIs. Its sample questions follow the server’s real local day. It supports repeat testing without altering a personal account. The same code can enter the normal OAuth/PKCE/consent flow for an MCP test.

Keep the code active during review. The provisioned credential expires in October 2027. See `server/README.md` for provisioning, revocation and safe test commands.

## Assets and validation

The screenshots follow 00Food’s isolated production-view pattern. See `ios/ScreenshotDemo/README.md` to reproduce them. The screenshot target has no service access or persistence and is excluded from the release target. Fixture preferences are fictional; production defaults remain unset so the agent chooses.

Validated:

- 39 backend tests and TypeScript typecheck.
- Swift friend-round checks: eligibility, hidden keys, single attempts, scoring, fresh rounds and owner isolation.
- Live isolated production smoke test: guidance versions/304, MCP/REST separation, quiz publishing, retries, scoring, streaks, agent feedback and OAuth-to-Apple redirect.
- Live reviewer smoke test: sign-in, redacted questions, scoring, reset, OAuth consent/PKCE, MCP context and credential separation. Test grants were revoked and today’s sample answers reset.
- Simulator Debug build, signed Release archive, App Store export and successful upload/processing.
- Interactive simulator checks: normal and friend answers scroll to the visible explanation and next button, including in a short landscape viewport; advancing resets the question to the top.
- Release archive is iPhone-only, contains the privacy manifest and app icon, excludes screenshot sources, and does not contain the raw review code.
- All six Apple screenshot assets completed processing; reviewer credential absent from every tracked/candidate repository file.

## Final handoff

The final App Store Connect draft screen was verified after unlocking the Mac. It shows **Item Ready to Submit**, version **1.0 (202610172208)**, and an enabled **Submit for Review** button, with no missing-item messages. The button was left unclicked. App Information also shows the selected name and calculated **13+** rating. The next step is the user’s final submission for review. [Apple distinguishes adding a draft from submitting it](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).
