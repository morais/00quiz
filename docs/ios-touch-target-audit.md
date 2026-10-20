# iOS touch-target audit

Checked October 20, 2026 against [Apple’s button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons), which recommends a hit region of at least 44 × 44 points. This audit covers interactive target sizing across the app, not every HIG topic.

## Measurements and fixes

Rendered production SwiftUI views in the isolated screenshot app on an iPhone 17 Pro Max simulator, iOS 27.0, using Xcode 27.1. Temporary `onGeometryChange` probes measured the actual styled controls and compact labels; the probes and forced review fixtures are excluded from the shipping app.

| Control | Before | After, default text size |
| --- | --- | --- |
| Back to today | 34.33 pt high | 50.33 pt high, full width |
| Let a friend try | 42.34 pt high | 50.34 pt high, full width |
| Made for you, by your agent | 16.67 pt label height | 44 pt high |
| Try with demo data | Regular native size | 50.33 pt high |
| Privacy / Support on sign-in | Footnote labels without a minimum | 44 pt high, each at least 44 pt wide |
| Explore the source | Footnote label without a minimum | 44 pt high |
| Reviewer access disclosure | Footnote label without a minimum | 44 pt high |
| Next question | Already a large control | 50.33 pt high; full width now belongs to its label |

The two results actions now share `.controlSize(.large)`. The same large styling is used by Today’s play/revisit and connect actions. The friend button is shared with Today, so that fix applies in both locations. Compact custom targets use `quizTapTarget()` inside their labels: a minimum 44 × 44 pt frame plus a rectangular content shape. This includes the empty-state refresh action, the nested Disconnect action, sample-account action and standalone policy/source links. The standalone reviewer code field also has a 44 pt minimum and focuses when its surrounding target is tapped.

At the largest accessibility text size, the results controls grew to 93.33 pt and 155.33 pt respectively instead of retaining a fixed height. Minimum frames allow larger text to grow.

## Remaining controls inspected

- Answer choices already have a 30 pt badge and 16 pt padding on each side, giving at least 62 pt height. An explicit rounded content shape makes the complete card interactive.
- Lock in my answer, friend introduction and friend completion actions already use large native controls.
- Both Sign in with Apple controls already have a 52 pt height.
- Settings, preferences, reminders and history use native List/Form rows, navigation links, pickers, toggles and date pickers, retaining native row hit regions. The custom nested Disconnect action has its own minimum because it is inside a row’s VStack.
- Toolbar actions, tabs, alerts and confirmation dialogs retain system controls with no compact sizing overrides.

## Validation

The shipping app and isolated fixture build successfully for iOS Simulator. Runtime measurements verify the sizes above and growth at accessibility text size 5. No account data, quiz behavior or backend was changed. A final visual and edge-tap check is pending because computer control reported that the Mac was locked; geometry measurements alone do not certify every aspect of accessibility or HIG compliance.
