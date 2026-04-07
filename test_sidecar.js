const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({
        viewport: { width: 1280, height: 800 }
    });

    // Convert relative path to absolute file URL
    const filePath = `file://${path.resolve('labs/sidecar.html')}`;
    console.log(`Navigating to: ${filePath}`);

    await page.goto(filePath);
    await page.screenshot({ path: 'sidecar_test_after_fix.png', fullPage: true });
    console.log('Saved sidecar_test_after_fix.png');

    await browser.close();
})();
