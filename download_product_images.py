"""
Download product images through the saved Chrome profile (Cloudflare cookies).

Skips products with no usable price.

Setup:
    pip install playwright
    # complete Cloudflare once via ayanfet_scraper.py so chrome_profile/ exists

Usage:
    python download_product_images.py
    python download_product_images.py --limit 5   # quick test
"""
from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

SITE = "https://ayanfettogracious.com"
PROFILE_DIR = "chrome_profile"
PRODUCTS_JSON = "ayanfet_products.json"
OUT_DIR = Path("scraped-media")
MANIFEST = OUT_DIR / "manifest.json"


def money(v):
    try:
        n = float(v)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def has_price(p: dict) -> bool:
    if money(p.get("sale_price")) or money(p.get("price")) or money(p.get("regular_price")) or money(p.get("price_min")):
        return True
    for v in p.get("variations") or []:
        if money(v.get("sale_price")) or money(v.get("price")) or money(v.get("regular_price")):
            return True
    return False


def slug_from_url(url: str) -> str:
    m = re.search(r"/product/([^/?#]+)", url or "", re.I)
    if m:
        return m.group(1).strip("/").lower()
    return ""


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower())
    return s.strip("-")[:80]


def product_slug(p: dict, used: set[str]) -> str:
    slug = slug_from_url(p.get("url") or "") or slugify(p.get("name") or "") or f"product-{p.get('id')}"
    if slug in used:
        slug = f"{slug}-{p.get('id')}"
    used.add(slug)
    return slug


def collect_image_urls(p: dict) -> list[str]:
    urls = []
    for u in p.get("images") or []:
        if u and u not in urls:
            urls.append(u)
    for v in p.get("variations") or []:
        for u in v.get("images") or []:
            if u and u not in urls:
                urls.append(u)
    return urls


def ext_from_url(url: str) -> str:
    path = urlparse(url).path
    m = re.search(r"\.(jpe?g|png|webp|gif|avif)$", path, re.I)
    return (m.group(1).lower() if m else "jpg").replace("jpeg", "jpg")


def is_challenge(page) -> bool:
    try:
        return "just a moment" in page.title().lower()
    except Exception:
        return True


def wait_for_clear(page, url: str, timeout_s: int = 600) -> bool:
    last_err = None
    for attempt in range(1, 6):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            last_err = None
            break
        except Exception as e:
            last_err = e
            print(f"Navigation retry {attempt}/5: {e}")
            page.wait_for_timeout(2000 * attempt)
    if last_err is not None:
        raise last_err

    start = time.time()
    told = False
    while is_challenge(page):
        if not told:
            print("Cloudflare check is showing. Complete it in the Chrome window...")
            told = True
        if time.time() - start > timeout_s:
            return False
        page.wait_for_timeout(2000)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max products to download (0 = all with price)")
    ap.add_argument("--delay", type=float, default=0.35)
    ap.add_argument("--connect", action="store_true", help="attach to Chrome on :9222")
    args = ap.parse_args()

    products = json.loads(Path(PRODUCTS_JSON).read_text(encoding="utf-8"))
    used_slugs: set[str] = set()
    jobs = []
    skipped_no_price = 0

    for p in products:
        if not has_price(p):
            skipped_no_price += 1
            continue
        slug = product_slug(p, used_slugs)
        urls = collect_image_urls(p)
        if not urls:
            continue
        jobs.append({"id": p.get("id"), "slug": slug, "name": p.get("name"), "urls": urls})

    if args.limit > 0:
        jobs = jobs[: args.limit]

    print(f"Will download images for {len(jobs)} products (skipped {skipped_no_price} with no price)")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {}
    if MANIFEST.exists():
        try:
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {}

    with sync_playwright() as p:
        if args.connect:
            browser = p.chromium.connect_over_cdp("http://localhost:9222")
            ctx = browser.contexts[0]
            page = ctx.new_page()
        else:
            ctx = p.chromium.launch_persistent_context(
                PROFILE_DIR,
                channel="chrome",
                headless=False,
                no_viewport=True,
                ignore_https_errors=True,
            )
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

        if not wait_for_clear(page, SITE):
            print("Could not pass Cloudflare. Complete the check and re-run.")
            ctx.close()
            return
        print(f"Homepage OK | {page.title()!r}")

        ok_products = 0
        fail_images = 0

        for i, job in enumerate(jobs, 1):
            slug = job["slug"]
            dest = OUT_DIR / slug
            dest.mkdir(parents=True, exist_ok=True)
            saved = []

            # Skip if already fully downloaded
            existing = sorted(dest.glob("*"))
            if existing and len(existing) >= len(job["urls"]):
                saved = [str(f.as_posix()) for f in existing]
                manifest[slug] = {"files": saved, "sourceUrls": job["urls"]}
                ok_products += 1
                if i % 25 == 0 or i == len(jobs):
                    print(f"… {i}/{len(jobs)} (reused local)")
                continue

            for idx, url in enumerate(job["urls"], 1):
                ext = ext_from_url(url)
                path = dest / f"{idx}.{ext}"
                if path.exists() and path.stat().st_size > 0:
                    saved.append(str(path.as_posix()))
                    continue
                try:
                    resp = ctx.request.get(url, timeout=60000)
                    if not resp.ok:
                        print(f"  FAIL {slug} #{idx}: HTTP {resp.status}")
                        fail_images += 1
                        continue
                    body = resp.body()
                    if len(body) < 200:
                        print(f"  FAIL {slug} #{idx}: tiny body")
                        fail_images += 1
                        continue
                    path.write_bytes(body)
                    saved.append(str(path.as_posix()))
                except Exception as e:
                    msg = str(e).encode("ascii", "replace").decode("ascii")
                    print(f"  FAIL {slug} #{idx}: {msg}")
                    fail_images += 1
                time.sleep(args.delay)

            if saved:
                ok_products += 1
                manifest[slug] = {"files": saved, "sourceUrls": job["urls"]}
            else:
                print(f"  no images saved for {slug}")

            if i % 10 == 0 or i == len(jobs):
                print(f"… {i}/{len(jobs)} products | ok={ok_products} image_fails={fail_images}")
                MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        ctx.close()

    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nDone. Products with files: {ok_products}/{len(jobs)}")
    print(f"Manifest: {MANIFEST}")
    print(f"Image failures: {fail_images}")


if __name__ == "__main__":
    main()
