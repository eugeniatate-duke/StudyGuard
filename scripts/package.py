"""Build the upload zip for the Chrome Web Store (or a GitHub Release).

Run from the repository root:   python scripts/package.py
Output:                         dist/studyguard-v<version>.zip

It includes only what the extension needs: manifest.json, every file the
manifest or the HTML pages refer to, and the PNG icons. Tests, evaluation
data, Python code, docs and Git files are left out. Standard library only.
"""
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def local_refs(html_path):
    """Local script/stylesheet/image files an HTML page loads."""
    text = html_path.read_text(encoding="utf-8")
    refs = re.findall(r'(?:src|href)="([^"#?:]+)"', text)
    return [r for r in refs if not r.startswith(("http", "//", "/"))]


def collect():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    files = {"manifest.json"}

    for script in manifest.get("content_scripts", []):
        files.update(script.get("js", []))
        files.update(script.get("css", []))
    files.update(manifest.get("icons", {}).values())
    action = manifest.get("action", {})
    files.update(action.get("default_icon", {}).values())

    pages = {action.get("default_popup"), manifest.get("side_panel", {}).get("default_path")}
    # Pages opened from the popup with chrome.runtime.getURL(...)
    for page in ROOT.glob("*.html"):
        pages.add(page.name)
    for page in sorted(p for p in pages if p):
        files.add(page)
        for ref in local_refs(ROOT / page):
            files.add(ref)

    # Scripts these pages may load by name (side panel, dashboard, journal).
    missing = sorted(f for f in files if not (ROOT / f).is_file())
    return manifest, sorted(files), missing


def main():
    manifest, files, missing = collect()
    if missing:
        print("Missing files referenced by the extension:", *missing, sep="\n  ")
        sys.exit(1)
    out_dir = ROOT / "dist"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"studyguard-v{manifest['version']}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(ROOT / f, f)
    size = out.stat().st_size / 1024
    print(f"Wrote {out.relative_to(ROOT)} ({len(files)} files, {size:.0f} KiB)")
    for f in files:
        print("  ", f)


if __name__ == "__main__":
    main()
