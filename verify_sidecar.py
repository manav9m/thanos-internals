import asyncio
from playwright.async_api import async_playwright

async def verify_sidecar():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use an absolute URL based on typical local server serving the repo root
        # If running via a file URI, adjust accordingly. We'll use file URI for pure static sites.
        import os
        filepath = "file://" + os.path.abspath("labs/sidecar.html")

        page = await browser.new_page()
        await page.goto(filepath)

        # Initial State
        await page.screenshot(path="verification/sidecar_initial.png", full_page=True)

        # Scrape 3 times
        await page.click('#btn-scrape')
        await page.click('#btn-scrape')
        await page.click('#btn-scrape')
        await page.wait_for_timeout(500) # wait for animations
        await page.screenshot(path="verification/sidecar_scraped.png")

        # Cut Block
        await page.click('#btn-cut-block')
        await page.wait_for_timeout(1000) # Wait to show 'Uploading...'
        await page.screenshot(path="verification/sidecar_uploading.png")

        # Wait for upload to complete
        await page.wait_for_timeout(3000)
        await page.screenshot(path="verification/sidecar_uploaded.png")

        # Uncheck external labels and repeat
        await page.uncheck('#flag-ext-labels')
        await page.click('#btn-scrape')
        await page.click('#btn-scrape')
        await page.click('#btn-scrape')
        await page.click('#btn-cut-block')
        await page.wait_for_timeout(1500)
        await page.screenshot(path="verification/sidecar_label_failure.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_sidecar())