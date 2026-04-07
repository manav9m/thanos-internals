import os
import time
from playwright.sync_api import sync_playwright

def verify_tsdb_sim():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Setup a reasonably large viewport to capture the whole page
        context = browser.new_context(viewport={'width': 1280, 'height': 1000})
        page = context.new_page()

        # Build absolute file path to the TSDB lab
        current_dir = os.getcwd()
        file_url = f"file://{current_dir}/labs/tsdb.html"

        print(f"Loading {file_url}...")
        page.goto(file_url)

        # Wait for simulation to be ready
        page.wait_for_selector('.simulation-canvas')
        page.wait_for_selector('#btn-scrape')

        # Take initial screenshot
        os.makedirs('/home/jules/verification', exist_ok=True)
        page.screenshot(path="/home/jules/verification/tsdb_initial.png", full_page=True)

        print("Scraping a few times to fill a chunk and WAL...")
        # Scrape 5 times to fill a chunk (max 4) and create a second one
        for _ in range(5):
            page.click('#btn-scrape')
            time.sleep(0.1) # brief pause for UI update

        page.screenshot(path="/home/jules/verification/tsdb_scraped.png", full_page=True)

        print("Cutting a block...")
        page.click('#btn-cut')
        # Wait for the async block cut logic (delay of 1000ms in js)
        time.sleep(1.5)

        page.screenshot(path="/home/jules/verification/tsdb_cut.png", full_page=True)

        print("Simulating a crash...")
        page.click('#btn-crash')
        time.sleep(0.5)
        page.screenshot(path="/home/jules/verification/tsdb_crashed.png", full_page=True)

        print("Recovering from crash...")
        page.click('#btn-recover')
        # Wait for recovery delay (800ms + 1200ms)
        time.sleep(2.5)
        page.screenshot(path="/home/jules/verification/tsdb_recovered.png", full_page=True)

        print("Verification complete. Screenshots saved in /home/jules/verification/")
        browser.close()

if __name__ == "__main__":
    verify_tsdb_sim()
