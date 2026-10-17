#!/usr/bin/env python3
"""Copy production views into an isolated, fictional simulator-only app."""
import json
from pathlib import Path
import shutil
import tempfile

root = Path(__file__).resolve().parents[1]
output = Path(tempfile.mkdtemp(prefix="00quiz-screenshots-", dir="/private/tmp"))
shutil.copytree(root / "Sources", output / "Sources", ignore=shutil.ignore_patterns("ZeroZeroQuizApp.swift"))
shutil.copytree(root / "Resources/App/Assets.xcassets", output / "Assets.xcassets")
for name in ("App.swift", "Fixtures.swift"):
    shutil.copy(root / "ScreenshotDemo" / name, output / "Sources" / name)


def replace_body(source, signature, body):
    assert source.count(signature) == 1, signature
    start = source.index("{", source.index(signature)); depth = 1; end = start + 1
    while depth:
        if source[end] == "{": depth += 1
        elif source[end] == "}": depth -= 1
        end += 1
    return source[:start + 1] + "\n" + body + "\n    " + source[end - 1:]


p = output / "Sources/QuizStore.swift"
s = p.read_text()
s = replace_body(s, "    init()", "        ScreenshotFixtures.configure(self)")
s = replace_body(s, "    func refresh()", "        return")
s = replace_body(s, "    func loadConnections()", "        return")
s = replace_body(s, "    private func request<T:", '        throw QuizError(message: "Screenshot app: service access is disabled")')
s = replace_body(s, "    private func readSession()", "        return nil")
s = replace_body(s, "    private func saveSession(", '        throw QuizError(message: "Screenshot app: sign-in is disabled")')
s = replace_body(s, "    private func clearLocalSession()", "        ScreenshotFixtures.configure(self)")
s = replace_body(s, "    private func persist()", "        return")
s = replace_body(s, "    var localDay:", '        return "2026-10-17"')
p.write_text(s)

p = output / "Sources/ContentView.swift"; s = p.read_text()
s = s.replace('    @State private var selected: Int?', '    @State private var selected: Int? = ScreenshotFixtures.scene == "question" ? 1 : nil')
s = s.replace('if quiz?.day == store.localDay, let next', 'if ScreenshotFixtures.scene != "explanation", quiz?.day == store.localDay, let next')
p.write_text(s)
p = output / "Sources/FriendQuizView.swift"; s = p.read_text()
s = s.replace('@State private var started = false', '@State private var started = ScreenshotFixtures.scene == "friend"')
s = s.replace('@State private var results = false', '@State private var results = ScreenshotFixtures.scene == "friend"')
p.write_text(s)
p = output / "Sources/DemoData.swift";p.write_text(p.read_text().replace('from: .now', 'from: ScreenshotFixtures.now'))

project = {"name": "ScreenshotDemo", "options": {"deploymentTarget": {"iOS": "27.0"}},
    "settings": {"base": {"SWIFT_VERSION": "5.10", "CODE_SIGNING_ALLOWED": "NO", "TARGETED_DEVICE_FAMILY": "1"}},
    "targets": {"ScreenshotDemo": {"type": "application", "platform": "iOS", "sources": ["Sources", "Assets.xcassets"],
        "settings": {"base": {"PRODUCT_BUNDLE_IDENTIFIER": "com.00quiz.screenshots", "TARGETED_DEVICE_FAMILY": "1",
            "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon", "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor"}},
        "info": {"path": "Info.plist", "properties": {"CFBundleDisplayName": "00Quiz Screenshots", "UILaunchScreen": {},
            "UISupportedInterfaceOrientations": ["UIInterfaceOrientationPortrait", "UIInterfaceOrientationLandscapeLeft", "UIInterfaceOrientationLandscapeRight"]}}}},
    "schemes": {"ScreenshotDemo": {"build": {"targets": {"ScreenshotDemo": "all"}}}}}
(output / "project.json").write_text(json.dumps(project, indent=2))
print(output)
