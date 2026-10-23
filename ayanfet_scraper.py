"""
Scraper for ayanfettogracious.com (WooCommerce) -> JSON

Uses your REAL installed Google Chrome with a saved profile folder, so once you
pass the Cloudflare check yourself, the cookie is remembered for later runs.

Setup:
    pip install playwright
    (Google Chrome must be installed - no extra browser download needed)

Usage:
    python ayanfet_scraper.py                 # everything
    python ayanfet_scraper.py --max-pages 1   # quick test
    python ayanfet_scraper.py --from-raw ayanfet_raw.json
"""
import argparse
import html
import json
import re
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

SITE = "https://ayanfettogracious.com"
API = SITE + "/wp-json/wc/store/v1/products?per_page=100&page={page}"
PROFILE_DIR = "chrome_profile"


def strip_html(t):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t or "")).strip())


def money(value, minor):
    try:
        return int(value) / (10 ** int(minor))
    except (TypeError, ValueError):
        return None


def clean_api_product(p):
    pr = p.get("prices") or {}
    minor = pr.get("currency_minor_unit", 2)
    rng = pr.get("price_range") or {}
    return {
        "id": p.get("id"),
        "name": strip_html(p.get("name")),
        "url": p.get("permalink"),
        "sku": p.get("sku"),
        "type": p.get("type"),
        "price": money(pr.get("price"), minor),
        "regular_price": money(pr.get("regular_price"), minor),
        "sale_price": money(pr.get("sale_price"), minor),
        "price_min": money(rng.get("min_amount"), minor) if rng else None,
        "price_max": money(rng.get("max_amount"), minor) if rng else None,
        "currency": pr.get("currency_code"),
        "on_sale": p.get("on_sale"),
        "in_stock": p.get("is_in_stock"),
        "low_stock_remaining": p.get("low_stock_remaining"),
        "categories": [c.get("name") for c in p.get("categories", [])],
        "short_description": strip_html(p.get("short_description")),
        "description": strip_html(p.get("description")),
        "images": [i.get("src") for i in p.get("images", [])],
        "tags": [t.get("name") for t in p.get("tags", [])],
        "brands": [b.get("name") for b in p.get("brands", [])],
        "average_rating": p.get("average_rating"),
        "review_count": p.get("review_count"),
        "is_purchasable": p.get("is_purchasable"),
        "on_backorder": p.get("is_on_backorder"),
        "weight": p.get("weight"),
        "dimensions": p.get("dimensions"),
        "variation_ids": [v.get("id") for v in p.get("variations", [])],
        "attributes": [
            {"name": a.get("name"), "options": [t.get("name") for t in a.get("terms", [])]}
            for a in p.get("attributes", [])
        ],
    }


def is_challenge(page):
    try:
        return "just a moment" in page.title().lower()
    except Exception:
        return True


def wait_for_clear(page, url, timeout_s=180):
    page.goto(url, wait_until="domcontentloaded")
    start = time.time()
    told = False
    while is_challenge(page):
        if not told:
            print("Cloudflare check is showing. Tick the box / wait in the Chrome window...")
            told = True
        if time.time() - start > timeout_s:
            return False
        page.wait_for_timeout(2000)
    return True


def scrape_api(page, max_pages, delay):
    raw, clean = [], []
    for n in range(1, max_pages + 1):
        url = API.format(page=n)
        if not wait_for_clear(page, url):
            print(f"API page {n}: still blocked.")
            return None if n == 1 else (raw, clean)
        try:
            items = json.loads(page.inner_text("body"))
        except json.JSONDecodeError:
            print(f"API page {n}: did not return JSON.")
            return None if n == 1 else (raw, clean)
        if not isinstance(items, list) or not items:
            break
        raw.extend(items)
        clean.extend(clean_api_product(p) for p in items)
        print(f"API page {n}: {len(items)} items (total {len(clean)})")
        if len(items) < 100:
            break
        time.sleep(delay)
    return raw, clean


VAR_API = SITE + "/wp-json/wc/store/v1/products?type=variation&parent={pid}&per_page=100"


def clean_variation(v):
    pr = v.get("prices") or {}
    minor = pr.get("currency_minor_unit", 2)
    return {
        "id": v.get("id"),
        "attributes": {a.get("name"): a.get("value") for a in v.get("attributes", [])},
        "price": money(pr.get("price"), minor),
        "regular_price": money(pr.get("regular_price"), minor),
        "sale_price": money(pr.get("sale_price"), minor),
        "in_stock": v.get("is_in_stock"),
        "low_stock_remaining": v.get("low_stock_remaining"),
        "sku": v.get("sku"),
        "images": [i.get("src") for i in v.get("images", [])],
    }


def add_variations(page, clean, delay):
    todo = [c for c in clean if c.get("type") == "variable"]
    print(f"\nFetching variations for {len(todo)} variable products...")
    for i, c in enumerate(todo, 1):
        url = VAR_API.format(pid=c["id"])
        if not wait_for_clear(page, url):
            print(f"  blocked at product {c['id']}, stopping variations.")
            break
        try:
            items = json.loads(page.inner_text("body"))
        except json.JSONDecodeError:
            print(f"  product {c['id']}: no JSON, skipped")
            continue
        if isinstance(items, list):
            c["variations"] = [clean_variation(v) for v in items]
        if i % 10 == 0 or i == len(todo):
            print(f"  variations {i}/{len(todo)}")
        time.sleep(delay)


def scrape_html(page, max_pages, delay):
    clean, seen = [], set()
    for n in range(1, max_pages + 1):
        url = f"{SITE}/shop/" if n == 1 else f"{SITE}/shop/page/{n}/"
        if not wait_for_clear(page, url):
            print(f"Shop page {n}: still blocked.")
            break
        try:
            page.wait_for_selector("div.product, li.product", timeout=15000)
        except PWTimeout:
            break
        cards = page.eval_on_selector_all(
            "div.product, li.product",
            """els => els.map(e => ({
                name: (e.querySelector('.wd-entities-title a, .woocommerce-loop-product__title, h3 a') || {}).innerText,
                url: (e.querySelector('a[href*="/product/"]') || {}).href,
                price: (e.querySelector('.price') || {}).innerText,
                image: (e.querySelector('img') || {}).src,
            }))""",
        )
        new = 0
        for c in cards:
            if c["url"] and c["url"] not in seen:
                seen.add(c["url"])
                clean.append(c)
                new += 1
        print(f"HTML page {n}: {new} new (total {len(clean)})")
        if new == 0:
            break
        time.sleep(delay)
    return clean


def save(clean):
    with open("ayanfet_products.json", "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    print(f"\nSaved {len(clean)} products to ayanfet_products.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-pages", type=int, default=100)
    ap.add_argument("--delay", type=float, default=1.5)
    ap.add_argument("--no-variations", action="store_true")
    ap.add_argument("--connect", action="store_true")
    ap.add_argument("--from-raw", nargs="+", metavar="FILE")
    args = ap.parse_args()

    if args.from_raw:
        seen, clean = set(), []
        for path in args.from_raw:
            with open(path, encoding="utf-8") as f:
                items = json.load(f)
            for p in items:
                if p.get("id") not in seen:
                    seen.add(p.get("id"))
                    clean.append(clean_api_product(p))
            print(f"{path}: {len(items)} items")
        if not clean:
            print("No products found in those files.")
            return
        save(clean)
        return

    with sync_playwright() as p:
        if args.connect:
            try:
                browser = p.chromium.connect_over_cdp("http://localhost:9222")
            except Exception as e:
                print(f"Could not connect to Chrome on port 9222 ({e}).")
                return
            ctx = browser.contexts[0]
            page = ctx.new_page()
        else:
            try:
                ctx = p.chromium.launch_persistent_context(
                    PROFILE_DIR, channel="chrome", headless=False, no_viewport=True
                )
            except Exception as e:
                print(f"Could not start Google Chrome ({e}). Is Chrome installed?")
                return
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

        if not wait_for_clear(page, SITE):
            print("Could not get past the check. Try again and complete it in the window.")
            ctx.close()
            return
        print(f"Homepage OK | title: {page.title()!r}")

        result = scrape_api(page, args.max_pages, args.delay)
        if result and result[1]:
            raw, clean = result
            with open("ayanfet_raw.json", "w", encoding="utf-8") as f:
                json.dump(raw, f, ensure_ascii=False, indent=2)
            if not args.no_variations:
                add_variations(page, clean, args.delay)
        else:
            print("WooCommerce API not available, falling back to shop pages...")
            clean = scrape_html(page, args.max_pages, args.delay)
        ctx.close()

    if not clean:
        print("Nothing collected. Send me the output.")
        return
    save(clean)


if __name__ == "__main__":
    main()
