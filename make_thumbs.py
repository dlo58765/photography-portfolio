"""Generate thumbnails for the photography portfolio.

For every JPG in each SOURCE_DIR, writes a downscaled JPEG to
<SOURCE_DIR>/thumbs/ (max 1600px on the long edge, quality 82).

Also creates a 2400px "hero" version of cover.jpg alongside the thumbs.

Re-run this anytime you add new photos. Existing thumbs are overwritten only
if the source file is newer than the thumb.
"""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).parent
SOURCE_DIRS = ["Norway", "Iceland"]
THUMB_MAX = 1600      # px on the long edge — grid tiles
HERO_MAX  = 2400      # px on the long edge — cover.jpg for hero background
QUALITY   = 82


def resize_one(src: Path, dst: Path, max_edge: int) -> str:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return "skip"
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)         # honor camera rotation
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        w, h = im.size
        if max(w, h) > max_edge:
            im.thumbnail((max_edge, max_edge), Image.LANCZOS)
        im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return "wrote"


def process_dir(folder: str) -> None:
    src_dir = ROOT / folder
    if not src_dir.is_dir():
        print(f"[skip] {folder} — no such directory")
        return
    thumb_dir = src_dir / "thumbs"
    made = skipped = 0
    for jpg in sorted(src_dir.glob("*.jpg")) + sorted(src_dir.glob("*.JPG")):
        name = jpg.name.lower()
        max_edge = HERO_MAX if name == "cover.jpg" else THUMB_MAX
        out = thumb_dir / jpg.name.lower()
        status = resize_one(jpg, out, max_edge)
        if status == "wrote":
            made += 1
            print(f"  {jpg.name:>12}  →  thumbs/{out.name}")
        else:
            skipped += 1
    print(f"[{folder}] wrote {made}, up-to-date {skipped}")


if __name__ == "__main__":
    for d in SOURCE_DIRS:
        process_dir(d)
    print("\nDone. Grid uses <folder>/thumbs/NN.jpg; originals stay at <folder>/NN.jpg for lightbox.")
