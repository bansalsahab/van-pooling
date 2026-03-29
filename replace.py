"""Apply targeted UI text replacements safely.

Usage:
  python replace.py
  python replace.py --dry-run
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parent


def replace_exact_block(
    content: str,
    old_block: str,
    new_block: str,
    *,
    label: str,
) -> tuple[str, bool]:
    """Replace one exact block while tolerating LF/CRLF source files."""
    if old_block in content:
        return content.replace(old_block, new_block), True
    old_crlf = old_block.replace("\n", "\r\n")
    if old_crlf in content:
        return content.replace(old_crlf, new_block.replace("\n", "\r\n")), True
    print(f"[warn] Could not find expected block for: {label}")
    return content, False


def update_live_map(content: str) -> tuple[str, bool]:
    old_jsx = """      {error ? (
        <div className="map-empty">{error}</div>
      ) : markers.length === 0 && polylines.length === 0 ? (
        <div className="map-empty">{emptyMessage}</div>
      ) : ("""
    new_jsx = """      {error ? (
        <div className="map-empty"><div className="map-empty-content">{error}</div></div>
      ) : markers.length === 0 && polylines.length === 0 ? (
        <div className="map-empty"><div className="map-empty-content">{emptyMessage}</div></div>
      ) : ("""
    return replace_exact_block(content, old_jsx, new_jsx, label="LiveMap empty state")


def update_styles(content: str) -> tuple[str, bool]:
    any_change = False

    old_shell = """.auth-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
}"""
    new_shell = """.auth-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
}"""
    content, changed = replace_exact_block(
        content,
        old_shell,
        new_shell,
        label="styles .auth-shell columns",
    )
    any_change = any_change or changed

    old_card = """.auth-card {
  margin: 2rem;
  background: rgba(7, 15, 28, 0.72);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.5rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.26);
}"""
    new_card = """.auth-card {
  margin: auto 4rem auto 2rem;
  max-width: 520px;
  width: 100%;
  background: rgba(7, 15, 28, 0.72);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.5rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.26);
}"""
    content, changed = replace_exact_block(
        content,
        old_card,
        new_card,
        label="styles .auth-card layout",
    )
    any_change = any_change or changed
    return content, any_change


def process_file(path: Path, updater, *, dry_run: bool) -> bool:
    if not path.exists():
        print(f"[error] Missing file: {path}")
        return False

    original = path.read_text(encoding="utf-8")
    updated, changed = updater(original)
    if changed and updated != original and not dry_run:
        path.write_text(updated, encoding="utf-8")
        print(f"[ok] Updated: {path.relative_to(ROOT)}")
    elif changed and dry_run:
        print(f"[dry-run] Would update: {path.relative_to(ROOT)}")
    else:
        print(f"[skip] No changes: {path.relative_to(ROOT)}")
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply deterministic UI replacements.")
    parser.add_argument("--dry-run", action="store_true", help="Do not write files.")
    args = parser.parse_args()

    live_map_path = ROOT / "frontend" / "src" / "components" / "LiveMap.tsx"
    styles_path = ROOT / "frontend" / "src" / "styles.css"

    print("Applying JSX and CSS layout fixes...")
    changed_live_map = process_file(live_map_path, update_live_map, dry_run=args.dry_run)
    changed_styles = process_file(styles_path, update_styles, dry_run=args.dry_run)

    if changed_live_map or changed_styles:
        print("Done updates.")
        return 0

    print("No update blocks were applied. Check source snippets before retrying.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

