#!/usr/bin/env python3
from argparse import ArgumentParser
from pathlib import Path

from PIL import Image

CANVAS_WIDTH = 1600
CANVAS_HEIGHT = 360
HORIZONTAL_PADDING = 24
VERTICAL_PADDING = 18
ALPHA_THRESHOLD = 8


def get_trim_box(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError("No visible bottle pixels found after background removal.")
    return bounds


def normalize_bottle(source: Path, output: Path) -> None:
    bottle = Image.open(source).convert("RGBA")
    bottle = bottle.crop(get_trim_box(bottle))
    bottle.thumbnail(
        (
            CANVAS_WIDTH - (HORIZONTAL_PADDING * 2),
            CANVAS_HEIGHT - (VERTICAL_PADDING * 2),
        ),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    position = (
        (CANVAS_WIDTH - bottle.width) // 2,
        (CANVAS_HEIGHT - bottle.height) // 2,
    )
    canvas.alpha_composite(bottle, dest=position)

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    normalize_bottle(args.input, args.out)
