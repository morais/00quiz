#!/usr/bin/env python3
"""Package the approved option 2 artwork; never redraw the mascot.

Requires Pillow. Run from any directory. The opaque RGB master is shared by
the Home Screen icon, App Store icon and both in-app brand placements.
"""
import json
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "docs/brand/sources/00quiz-app-icon-master.png"
ASSETS = ROOT / "ios/Resources/App/Assets.xcassets"
INFO = {"author": "xcode", "version": 1}


def write_catalog(directory, images):
    (directory / "Contents.json").write_text(
        json.dumps({"images": images, "info": INFO}, indent=2) + "\n"
    )


with Image.open(MASTER) as source:
    assert source.width == source.height, "Icon master must be square"
    if "A" in source.getbands():
        assert source.getchannel("A").getextrema() == (255, 255), "Icon must be opaque"
    artwork = source.convert("RGB")
    assert max(ImageStat.Stat(artwork).stddev) > 10, "Refusing to package blank artwork"

    icon_dir = ASSETS / "AppIcon.appiconset"
    icon_dir.mkdir(parents=True, exist_ok=True)
    images = []
    for points in (20, 29, 40, 60):
        for scale in (2, 3):
            filename = f"app-icon-{points}@{scale}x.png"
            artwork.resize((points * scale, points * scale), Image.Resampling.LANCZOS).save(icon_dir / filename)
            images.append({"filename": filename, "idiom": "iphone", "size": f"{points}x{points}", "scale": f"{scale}x"})
    artwork.resize((1024, 1024), Image.Resampling.LANCZOS).save(icon_dir / "app-icon.png")
    images.append({"filename": "app-icon.png", "idiom": "ios-marketing", "size": "1024x1024", "scale": "1x"})
    write_catalog(icon_dir, images)

    mark_dir = ASSETS / "BrandMark.imageset"
    mark_dir.mkdir(parents=True, exist_ok=True)
    artwork.resize((512, 512), Image.Resampling.LANCZOS).save(mark_dir / "brand-mark.png")
    write_catalog(mark_dir, [{"filename": "brand-mark.png", "idiom": "universal"}])

print("Packaged approved 00Quiz option 2: eight iPhone renditions, App Store icon and in-app mark")
