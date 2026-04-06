import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # Desktop
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto('file:///app/labs/retention.html')
        await page.screenshot(path='/home/jules/verification/verify_desktop_layout.png', full_page=True)
        # Mobile
        page_mobile = await browser.new_page(viewport={"width": 400, "height": 800})
        await page_mobile.goto('file:///app/labs/retention.html')
        await page_mobile.screenshot(path='/home/jules/verification/verify_mobile_layout.png', full_page=True)
        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
