import sys
from playwright.sync_api import sync_playwright

def main():
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width': 1400, 'height': 900})
            page = context.new_page()

            import os
            filepath = os.path.abspath('labs/ruler.html')
            page.goto(f'file://{filepath}')

            page.wait_for_timeout(2000)

            screenshot_path = "/home/jules/verification/ruler_lab.png"
            page.screenshot(path=screenshot_path, full_page=True)

            print(f"Screenshot successfully saved to {screenshot_path}")
            browser.close()
    except Exception as e:
        print(f"Error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
