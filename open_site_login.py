"""
Open ayanfettogracious.com in the Playwright Chrome profile.

NOTE: Google login often fails here with "browser may not be secure"
because Playwright automation is detected. You usually only need to
pass Cloudflare (no Google login). For a real Google sign-in, use:

    .\\start_chrome_debug.ps1
    python download_product_images.py --connect

Usage:
    python open_site_login.py
"""
from playwright.sync_api import sync_playwright

SITE = "https://ayanfettogracious.com"
PROFILE_DIR = "chrome_profile"


def main():
    print("Opening Chrome with your saved profile...")
    print("1) Complete Cloudflare if it appears")
    print("2) Sign in on the site if you need to")
    print("3) Come back here and press Enter when ready\n")

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            PROFILE_DIR,
            channel="chrome",
            headless=False,
            no_viewport=True,
            ignore_https_errors=True,
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            page.goto(SITE, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            print(f"Navigation note: {e}")
            print("Use the Chrome window to open the site manually if needed.")

        input("Press Enter here after Cloudflare + login are done... ")
        print(f"Window title: {page.title()!r}")
        print("Closing browser and saving profile cookies...")
        ctx.close()

    print("\nProfile saved. Next run:")
    print("  python download_product_images.py")


if __name__ == "__main__":
    main()
