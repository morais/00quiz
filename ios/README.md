# 00Quiz for iPhone

SwiftUI, iOS 27+. Xcode and XcodeGen are required. Copy `project.yml.sample` to ignored `project.yml`, supply your Apple team, bundle ID and API origin, then run `xcodegen generate`.

For a simulator build:

```sh
xcodebuild -project ZeroZeroQuiz.xcodeproj -scheme ZeroZeroQuiz \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
```

The sign-in page's **Try with demo data** opens a clearly labelled local sample quiz. Debug builds also accept `--demo` as a launch argument. Demo answers never contact the backend or update a real account. Preferences start empty in both demo and real accounts, so the agent chooses unless the user supplies them.

After completing all five questions, **Let a friend try** opens a fresh in-memory attempt at the same quiz. The normal question view reveals feedback only after each guest answer. The end screen compares both scores and question results. Guest answers are discarded on closing; they never enter the account store, backend, history, streak or agent performance data.

After an answer is saved, both normal and friend rounds scroll to the bottom so the explanation and next button are visible. Advancing to another question or the results returns to the top. Automatic scrolling respects Reduce Motion.

Touch targets follow Apple’s 44 × 44 pt guidance. Primary and secondary quiz actions use large native controls; compact custom labels use `quizTapTarget()` inside the Button/Link label so their added space participates in hit testing. See [the touch-target audit](../docs/ios-touch-target-audit.md) for measurements and scope.

Run the guest-session checks from the repository root:

```sh
swiftc -module-cache-path /tmp/00quiz-swift-module-cache \
  ios/Sources/Models.swift ios/Sources/DemoData.swift \
  ios/Sources/FriendQuizSession.swift ios/Tests/FriendQuizSessionTests.swift \
  -o /tmp/00quiz-friend-tests
/tmp/00quiz-friend-tests
```

The approved option 2 artwork lives in `docs/brand/sources/00quiz-app-icon-master.png`. Run `python3 ios/scripts/generate-brand.py` from the repository root (requires Pillow) to resize it into opaque App Store/iPhone icons and the shared in-app mark. The script validates the source and preserves the artwork; it does not redraw it.

## TestFlight

Register the App ID with Sign in with Apple, create its App Store Connect record, and create an App Store distribution profile containing the capability. The official Release configuration uses manual signing and a dedicated distribution profile. Set `CURRENT_PROJECT_VERSION` to a fresh Lisbon timestamp (`TZ=Europe/Lisbon date +%Y%m%d%H%M`) before each archive.

Archive with `xcodebuild -project ZeroZeroQuiz.xcodeproj -scheme ZeroZeroQuiz -configuration Release -destination 'generic/platform=iOS' -archivePath build/00Quiz.xcarchive archive`. Export using an ignored export-options plist specifying App Store Connect distribution, your team, manual signing and the bundle-to-profile mapping, then upload with Xcode's `altool` and the existing App Store Connect API key.

After Apple processing, `scripts/assign-testflight.py --app-id APP_ID --group-id GROUP_ID --build BUILD_NUMBER` assigns the build to the internal group and verifies it. Set `ASC_KEY_PATH` explicitly if `~/.appstoreconnect/private_keys` holds multiple keys. `scripts/apple-api.py` provides a credential-safe helper for administrative API calls. `ios/.apple-deploy.json` contains ignored local deployment identifiers and key paths, never secret contents.

The app supports portrait and landscape, Dynamic Type, system dark mode and accessible labels for correct/incorrect answers. Read cached data offline; submitting an answer requires a connection. Sessions use Keychain with a device-only accessibility class. Cache files are per account and protected, and are removed on sign-out/deletion/session expiry. Only 90 previous quizzes are loaded into the app; streak totals cover the complete retained account history.

## App Store preparation

See `../docs/appstore/README.md` for the prepared listing and validation record. `ScreenshotDemo/README.md` documents the isolated simulator app that captures production views with fictional fixtures. It is excluded from the shipping target. The six opaque native screenshots live in `../docs/appstore/screenshots`.

From the repository root, `python3 ios/scripts/upload-appstore-screenshots.py --app-id APP_ID` uploads and verifies the screenshot list in `docs/appstore/metadata.json`. It uses the same credential setup as the Apple API helper, skips identical complete assets and never submits an app for review.

The sign-in screen’s **Reviewer access** accepts the code supplied through App Store Connect’s secure password field. It exchanges the code with the backend and stores only the resulting app session in Keychain. The clearly labelled synthetic account can exercise live quiz APIs and restart its sample day. Personal accounts still use Sign in with Apple and fresh Apple authentication for deletion. See `../server/README.md` for provisioning and security boundaries.
