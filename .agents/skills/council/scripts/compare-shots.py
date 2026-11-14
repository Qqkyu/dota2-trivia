"""Create annotated PNG pairs and scrollable sheets from the council captures."""

import argparse
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile


def dimensions(image):
    with image.open("rb") as stream:
        header = stream.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG capture: {image}")
    return struct.unpack(">II", header[16:24])


def thumbnail(image, width, height):
    return subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(image),
        "-vf", f"pad={width}:{height}:0:0:color=0x090b0c,scale=64:{math.ceil(height * 64 / width)}",
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ])


def changed_boxes(before, after, width, height):
    left, right = thumbnail(before, width, height), thumbnail(after, width, height)
    rows = math.ceil(height * 64 / width)
    changed = set()
    for index in range(64 * rows):
        pixel = index * 3
        if sum(abs(left[pixel + channel] - right[pixel + channel]) for channel in range(3)) > 90:
            x, y = index % 64, index // 64
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if 0 <= x + dx < 64 and 0 <= y + dy < rows:
                        changed.add((x + dx, y + dy))
    boxes = []
    while changed:
        start = changed.pop()
        stack, region = [start], [start]
        while stack:
            x, y = stack.pop()
            for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if point in changed:
                    changed.remove(point)
                    stack.append(point)
                    region.append(point)
        if len(region) < 16:
            continue
        xs, ys = zip(*region)
        x = max(2, int(min(xs) * width / 64) - 3)
        y = max(2, int(min(ys) * height / rows) - 3)
        right_edge = min(width - 2, math.ceil((max(xs) + 1) * width / 64) + 3)
        bottom = min(height - 2, math.ceil((max(ys) + 1) * height / rows) + 3)
        boxes.append((x, y, right_edge - x, bottom - y))
    return sorted(boxes, key=lambda box: box[2] * box[3], reverse=True)[:6]


def wrap(text, count):
    lines, line = [], ""
    for word in text.split():
        candidate = (line + " " + word).strip()
        if line and len(candidate) > count:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def pair(before, after, output, title, changes, scratch):
    bw, bh = dimensions(before)
    aw, ah = dimensions(after)
    if bw != aw:
        raise ValueError(f"Viewport mismatch: {before.name} / {after.name}")
    width, height = bw, max(bh, ah)
    boxes = changed_boxes(before, after, width, height)
    notes = changes or (["Layout and styling changed inside the red rectangles."] if boxes else ["No visible change in this state."])
    notes += ["Clock digits can differ between captures; they are not design changes."]
    lines = ["What changed:"]
    for note in notes:
        lines.extend(wrap("- " + note, max(52, int((width * 2 + 24) / 10))))
    text = scratch / (output.stem + ".txt")
    text.write_text("\n".join(lines), encoding="utf-8")
    font = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
    canvas_width, canvas_height = width * 2 + 72, height + 124 + 27 * len(lines)
    box_filter = ",".join(f"drawbox=x={x}:y={y}:w={w}:h={h}:color=0xff253f:t=3" for x, y, w, h in boxes)
    pad = f"pad={width}:{height}:0:0:color=0x090b0c"
    image_filter = pad + ("," + box_filter if box_filter else "")
    title_file = scratch / (output.stem + "-title.txt")
    title_file.write_text(title, encoding="utf-8")
    graph = (
        f"[1:v]{image_filter}[before];[2:v]{image_filter}[after];"
        f"[0:v]drawtext=fontfile={font}:textfile='{title_file}':x=24:y=12:fontsize=24:fontcolor=0xededeb,"
        f"drawtext=fontfile={font}:text='BEFORE':x=24:y=47:fontsize=22:fontcolor=0xd4d8d6,"
        f"drawtext=fontfile={font}:text='AFTER':x={width + 48}:y=47:fontsize=22:fontcolor=0xff354f[base];"
        f"[base][before]overlay=24:86[a];[a][after]overlay={width + 48}:86[b];"
        f"[b]drawtext=fontfile={font}:textfile='{text}':x=24:y={height + 104}:fontsize=19:line_spacing=5:fontcolor=0xdde1de[out]"
    )
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
        f"color=c=0x1c2123:s={canvas_width}x{canvas_height}", "-i", str(before), "-i", str(after),
        "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", "-compression_level", "9", str(output),
    ], check=True)
    return {"file": output.name, "before": before.name, "after": after.name, "boxes": boxes, "changes": changes}


def sheet(images, output):
    if not images:
        return
    if len(images) == 1:
        shutil.copyfile(images[0], output)
        return
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for image in images:
        command += ["-i", str(image)]
    graph = "".join(f"[{index}:v]" for index in range(len(images))) + f"vstack=inputs={len(images)}[out]"
    subprocess.run(command + ["-filter_complex", graph, "-map", "[out]", "-frames:v", "1", "-compression_level", "9", str(output)], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--captions", type=Path, help="JSON keyed by scene name, with title and changes fields")
    parser.add_argument("--prefix", default="en-390x844-")
    parser.add_argument("--scenes", required=True, help="Comma-separated scene names in reading order")
    parser.add_argument("--sheet", default="ALL-phone.png")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    captions = json.loads(args.captions.read_text()) if args.captions else {}
    manifest, images = [], []
    # Text files are task-local and removed before returning.
    with tempfile.TemporaryDirectory(prefix="comparison-", dir=args.before.parent) as temp:
        for index, scene in enumerate(args.scenes.split(","), 1):
            filename = args.prefix + scene + ".png"
            before, after = args.before / filename, args.after / filename
            if not before.exists() or not after.exists():
                raise FileNotFoundError(f"Missing matching capture: {filename}")
            caption = captions.get(scene, {})
            image = args.output / f"{index:02}-{args.prefix}{scene}.png"
            manifest.append(pair(before, after, image, caption.get("title", scene.replace("-", " ").capitalize()), list(caption.get("changes", [])), Path(temp)))
            images.append(image)
        sheet(images, args.output / args.sheet)
    (args.output / (Path(args.sheet).stem + "-index.json")).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Created {len(images)} annotated pairs and {args.output / args.sheet}")


if __name__ == "__main__":
    main()
