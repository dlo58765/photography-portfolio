"""Generate thumbnails, per-chapter manifests, and inline them into the HTML.

Accepts .jpg / .jpeg / .png / .heic (HEIC requires the `pillow-heif` pip
package — the script prints a hint and skips HEIC files if it's missing).

For every image found in each chapter folder:
  - writes a downscaled JPEG to <folder>/thumbs/<stem>.jpg (max 1600px on
    the long edge, quality 82). cover.jpg / cover.png / cover.heic get the
    larger 2400px "hero" size.
  - for HEIC originals, ALSO writes a full-resolution JPEG next to the
    thumb at <folder>/thumbs/<stem>.full.jpg — browsers can't display HEIC,
    so the lightbox needs a JPEG copy.
  - JPG/PNG originals are used as-is for the lightbox (their real file
    path is stored in the manifest).

Then writes each chapter's manifest.json and injects a combined
window.<VAR>_MANIFESTS object into each HTML target between
MANIFEST_BEGIN / MANIFEST_END markers, so the page renders under file://
without a fetch.

Structure the tool now expects:
    Norway/
      cover.jpg                 <- series cover (optional)
      tromso/
        cover.jpg               <- chapter cover (optional)
        anything.jpg
        IMG_4321.HEIC
        sunset.png
        ...
        thumbs/                 <- generated (all .jpg)
        manifest.json           <- generated

Re-run this anytime you add / rename / delete photos. Existing thumbs are
overwritten only if the source file is newer than the thumb.
"""

import json
import re
import sys
from pathlib import Path

# --- Dependency check ------------------------------------------------------
# Pillow (imported as PIL) is required. If the user runs this in a Python
# environment that doesn't have it, print an install command they can copy
# and paste — using THIS interpreter's path so multi-Python setups on
# Windows (Store Python vs python.org vs venv) install into the right one.
try:
    from PIL import Image, ImageOps
except ImportError:
    py = sys.executable
    print("ERROR: Pillow is not installed for this Python.\n")
    print(f"       Current Python: {py}")
    print( "       Install it with:\n")
    print(f'         "{py}" -m pip install Pillow\n')
    print("       (Optional, to also handle .heic photos:)")
    print(f'         "{py}" -m pip install pillow-heif\n')
    sys.exit(1)

# Optional HEIC support. Falls back to a warning instead of crashing so
# people without the extra dep can still process jpg/png.
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    HEIC_OK = True
except ImportError:
    HEIC_OK = False

ROOT = Path(__file__).parent
SOURCE_DIRS = ["Norway", "Iceland"]

# Which HTML files should have their inline manifest block rewritten,
# and which folder each one pulls from.
INLINE_TARGETS = {
    "norway.html":  ("Norway",  "NORWAY_MANIFESTS"),
}

# Accepted source extensions (case-insensitive). Everything else is ignored.
JPEG_EXTS = {".jpg", ".jpeg"}
PNG_EXT   = ".png"
HEIC_EXTS = {".heic", ".heif"}
ALL_EXTS  = JPEG_EXTS | {PNG_EXT} | HEIC_EXTS

THUMB_MAX = 1600      # px on the long edge — grid tiles
HERO_MAX  = 2400      # px on the long edge — cover.* for hero background
QUALITY   = 82


def save_jpeg(im: Image.Image, dst: Path, max_edge: int) -> None:
    """Downscale (if needed) and write `im` as JPEG to `dst`."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = ImageOps.exif_transpose(im)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    if max(im.size) > max_edge:
        im.thumbnail((max_edge, max_edge), Image.LANCZOS)
    im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)


def newer(src: Path, dst: Path) -> bool:
    return not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime


def process_image(src: Path, thumb_dir: Path, is_cover: bool
                  ) -> tuple[int, dict] | None:
    """Produce thumb (and, for HEIC, a display-JPEG); return (wrote_n, entry).

    entry is the manifest record: {"thumb": "...", "full": "..."} paths
    relative to the chapter folder. Returns None to skip (unreadable HEIC
    with no pillow-heif installed, or an unexpected error).
    """
    ext = src.suffix.lower()
    stem_lower = src.stem.lower()
    max_edge = HERO_MAX if is_cover else THUMB_MAX
    thumb = thumb_dir / f"{stem_lower}.jpg"

    wrote = 0
    try:
        if ext in HEIC_EXTS:
            if not HEIC_OK:
                print(f"  [skip HEIC — install `pip install pillow-heif`] {src.name}")
                return None
            # HEIC needs a display copy too, since browsers can't render it.
            display = thumb_dir / f"{stem_lower}.full.jpg"
            if newer(src, thumb) or newer(src, display):
                with Image.open(src) as im:
                    save_jpeg(im.copy(), thumb, max_edge)
                    # For the "full" copy, don't downscale — clamp only if
                    # the original is truly huge (> 4000px).
                    save_jpeg(im.copy(), display, 4000)
                wrote = 1
                print(f"  {src.name:>28}  ->  thumbs/{thumb.name} + {display.name}")
            full_rel = f"thumbs/{display.name}"
        else:
            if newer(src, thumb):
                with Image.open(src) as im:
                    save_jpeg(im, thumb, max_edge)
                wrote = 1
                print(f"  {src.name:>28}  ->  thumbs/{thumb.name}")
            full_rel = src.name    # browser can show jpg/png natively
    except Exception as e:
        print(f"  [error {e.__class__.__name__}] {src.name}: {e}")
        return None

    return wrote, {
        "thumb": f"thumbs/{thumb.name}",
        "full":  full_rel,
    }


def process_folder(folder: Path, label: str) -> tuple[int, int, dict | None]:
    """Thumb every image in `folder` (non-recursive) and write manifest.json.

    Returns (wrote_count, skipped_count, manifest_dict_or_None).
    """
    thumb_dir = folder / "thumbs"
    made = skipped = 0
    frames: list[dict] = []   # non-cover entries, in filename sort order
    cover_entry: dict | None = None

    # Case-insensitive dedupe + sort. Skip the thumbs/ subfolder itself.
    srcs = sorted({p for p in folder.iterdir()
                   if p.is_file() and p.suffix.lower() in ALL_EXTS})
    for src in srcs:
        is_cover = src.stem.lower() == "cover"
        result = process_image(src, thumb_dir, is_cover)
        if result is None:
            skipped += 1
            continue
        wrote, entry = result
        if wrote:
            made += 1
        else:
            skipped += 1
        if is_cover:
            cover_entry = entry
        else:
            frames.append(entry)

    # Only chapter folders (those with actual frames) get a manifest.
    # The series root — Norway/, Iceland/ — usually holds only cover.jpg;
    # writing a manifest there would be misleading.
    manifest = None
    if frames:
        manifest = {
            "cover":  cover_entry,   # entry dict or null
            "frames": frames,
        }
        (folder / "manifest.json").write_text(
            json.dumps(manifest, indent=2), encoding="utf-8")

    return made, skipped, manifest


def process_tree(root_name: str) -> tuple[int, int, dict[str, dict]]:
    """Thumb the whole tree; return totals + {slug: manifest} for chapters."""
    src_dir = ROOT / root_name
    if not src_dir.is_dir():
        print(f"[skip] {root_name} — no such directory")
        return 0, 0, {}

    total_wrote = total_skip = 0
    chapter_manifests: dict[str, dict] = {}

    # Root folder itself (series cover.*; ignore any loose frames here).
    w, s, _ = process_folder(src_dir, root_name)
    total_wrote += w
    total_skip  += s

    # Each subfolder = one chapter. Ignore `thumbs/`.
    for sub in sorted(p for p in src_dir.iterdir() if p.is_dir()):
        if sub.name == "thumbs":
            continue
        w, s, m = process_folder(sub, f"{root_name}/{sub.name}")
        total_wrote += w
        total_skip  += s
        if m is not None:
            chapter_manifests[sub.name] = m

    print(f"[{root_name}] wrote {total_wrote}, up-to-date {total_skip}")
    return total_wrote, total_skip, chapter_manifests


def inject_into_html(html_path: Path, var_name: str, data: dict) -> None:
    """Rewrite the block between MANIFEST_BEGIN/END markers in `html_path`."""
    if not html_path.is_file():
        print(f"[inline] {html_path.name}: not found, skipping")
        return
    text = html_path.read_text(encoding="utf-8")
    payload = (
        f"      // MANIFEST_BEGIN — generated by make_thumbs.py, do not edit\n"
        f"      window.{var_name} = {json.dumps(data, indent=8, ensure_ascii=False)};\n"
        f"      // MANIFEST_END"
    )
    pattern = re.compile(
        r"      // MANIFEST_BEGIN.*?// MANIFEST_END",
        re.DOTALL,
    )
    if not pattern.search(text):
        print(f"[inline] {html_path.name}: no MANIFEST markers found — skipped")
        return
    new_text = pattern.sub(payload, text)
    if new_text != text:
        html_path.write_text(new_text, encoding="utf-8")
        print(f"[inline] {html_path.name}: refreshed {var_name} "
              f"({len(data)} chapters)")
    else:
        print(f"[inline] {html_path.name}: already up to date")


if __name__ == "__main__":
    if not HEIC_OK:
        print("[note] HEIC support disabled — `pip install pillow-heif` to enable.\n")

    per_tree: dict[str, dict[str, dict]] = {}
    for d in SOURCE_DIRS:
        _, _, chapters = process_tree(d)
        per_tree[d] = chapters

    for html_name, (folder, var_name) in INLINE_TARGETS.items():
        inject_into_html(ROOT / html_name, var_name, per_tree.get(folder, {}))

    print("\nDone. Grid reads window.<VAR> injected into the HTML "
          "— no fetch, no server required.")
