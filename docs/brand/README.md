# 00Quiz brand artwork

The production master is `sources/00quiz-app-icon-master.png`. It uses the selected option 2 answer-bubble mouth with a forest green background, changed on 2026-10-17 to distinguish 00Quiz from 00Widget's navy icon. The original navy concepts remain in `options/` for reference.

The built-in image_gen tool edited the approved option 2 raster. `ios/scripts/generate-brand.py` only resizes the master into opaque iPhone/App Store and in-app assets. Run it after any approved source replacement.

## Exact background-edit prompt

```text
Use case: precise-object-edit. Input image 1 is the edit target: the approved 00Quiz answer-bubbles icon. Change ONLY the square background outside the mascot from dark navy blue to a rich deep forest green gradient, approximately #174D38 at the upper left fading to #092B20 at the lower right. The background must read clearly as green, visibly different from navy blue, with the same subtle smooth tonal shading and no texture. Preserve the mascot exactly: identical white fedora and navy hat band, both navy slashed-zero eyes, four teal answer bubbles forming a smile with a white check in the third bubble, layered white cards, blue/purple rim, all original navy outlines, shading, shadows, perspective, dimensions, framing, scale and position. Do not recolor any part of the mascot, even its navy outlines. No text, no added objects, no border, no rounded canvas corners, no mockup. Output one opaque square production app icon.
```
