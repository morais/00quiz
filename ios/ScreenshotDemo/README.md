# Isolated App Store screenshot app

Follows 00Food's production-view screenshot pattern. `prepare-screenshot-demo.py` copies app sources into a temporary simulator project, injects fictional quiz history and a fixed clock, and disables service requests, persistence and Keychain access. The shipping target includes `Sources`, not this directory. Never upload the screenshot binary or install it on a physical device.

Run `python3 ios/scripts/prepare-screenshot-demo.py` from the repository root, then run XcodeGen and a simulator build in the printed directory. Install `ScreenshotDemo.app` on an iPhone 17 Pro Max simulator and launch `com.00quiz.screenshots --scene SCENE`.

Scenes: `today`, `question`, `explanation`, `completed`, `history`, `friend`, `preferences`, `setup`, `sign-in`, `onboarding`, `connections`. Add `--dark` to review any scene in dark mode. Captures use the app's existing SwiftUI screens. Fixture interests and progress are fictional and do not change production defaults. Set the simulator status bar to 9:41 before capture. The release screenshots in `docs/appstore/screenshots` are unframed native 6.9-inch captures.
