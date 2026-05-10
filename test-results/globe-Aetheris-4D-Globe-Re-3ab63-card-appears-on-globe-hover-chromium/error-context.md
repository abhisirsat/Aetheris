# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: globe.spec.js >> Aetheris 4D Globe Render Tests >> Hover card appears on globe hover
- Location: tests\globe.spec.js:101:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
Call log:
  - navigating to "http://localhost:5173/", waiting until "load"

```

# Test source

```ts
  3   |  * @module GlobeTests
  4   |  * @description Playwright E2E tests for Aetheris 4D.
  5   |  *              Validates globe render, layer toggles, timeline scrubber,
  6   |  *              hover data card, and FPS counter across desktop and mobile viewports.
  7   |  * @author Aetheris 4D
  8   |  */
  9   | 
  10  | import { test, expect } from '@playwright/test';
  11  | 
  12  | test.describe('Aetheris 4D Globe Render Tests', () => {
  13  | 
  14  |   test('Globe renders on desktop viewport', async ({ page }) => {
  15  |     await page.setViewportSize({ width: 1920, height: 1080 });
  16  |     await page.goto('http://localhost:5173');
  17  | 
  18  |     // Wait for Cesium globe canvas to appear
  19  |     await page.waitForSelector('canvas', { timeout: 20000 });
  20  | 
  21  |     // Assert canvas has non-zero dimensions
  22  |     const canvas = page.locator('canvas').first();
  23  |     const box = await canvas.boundingBox();
  24  |     expect(box).not.toBeNull();
  25  |     expect(box.width).toBeGreaterThan(0);
  26  |     expect(box.height).toBeGreaterThan(0);
  27  | 
  28  |     // Assert TopBar is visible
  29  |     await expect(page.locator('[data-testid="layer-toggle-wind"]')).toBeVisible({ timeout: 20000 });
  30  | 
  31  |     // Assert Timeline Scrubber is visible
  32  |     await expect(page.locator('[data-testid="timeline-scrubber"]')).toBeVisible({ timeout: 20000 });
  33  |   });
  34  | 
  35  |   test('Globe renders on mobile viewport', async ({ page }) => {
  36  |     await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro
  37  |     await page.goto('http://localhost:5173');
  38  | 
  39  |     await page.waitForSelector('canvas', { timeout: 20000 });
  40  | 
  41  |     // Assert canvas exists and UI does not overflow
  42  |     const canvas = page.locator('canvas').first();
  43  |     const box = await canvas.boundingBox();
  44  |     expect(box).not.toBeNull();
  45  |     expect(box.width).toBeGreaterThan(0);
  46  | 
  47  |     // Assert body has no horizontal scroll
  48  |     const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
  49  |     const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
  50  |     expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 10); // 10px tolerance
  51  | 
  52  |     // Timeline scrubber should still be present
  53  |     await expect(page.locator('[data-testid="timeline-scrubber"]')).toBeVisible({ timeout: 20000 });
  54  |   });
  55  | 
  56  |   test('Layer toggle — Wind particles appear and disappear', async ({ page }) => {
  57  |     await page.goto('http://localhost:5173');
  58  | 
  59  |     // Wait for app boot and layer toggles to be present
  60  |     await page.waitForSelector('[data-testid="layer-toggle-wind"]', { timeout: 25000 });
  61  | 
  62  |     const toggle = page.locator('[data-testid="layer-toggle-wind"]');
  63  | 
  64  |     // Get initial state (should be active/on)
  65  |     const initialPressed = await toggle.getAttribute('aria-pressed');
  66  |     expect(initialPressed).toBe('true');
  67  | 
  68  |     // Click wind toggle OFF
  69  |     await toggle.click();
  70  |     await page.waitForTimeout(300);
  71  | 
  72  |     const pressedOff = await toggle.getAttribute('aria-pressed');
  73  |     expect(pressedOff).toBe('false');
  74  | 
  75  |     // Click wind toggle ON again
  76  |     await toggle.click();
  77  |     await page.waitForTimeout(300);
  78  | 
  79  |     const pressedOn = await toggle.getAttribute('aria-pressed');
  80  |     expect(pressedOn).toBe('true');
  81  |   });
  82  | 
  83  |   test('Timeline scrubber changes displayed date', async ({ page }) => {
  84  |     await page.goto('http://localhost:5173');
  85  | 
  86  |     // Wait for timeline to be interactive
  87  |     await page.waitForSelector('[data-testid="current-datetime"]', { timeout: 25000 });
  88  | 
  89  |     const dateDisplay = page.locator('[data-testid="current-datetime"]');
  90  |     const initialDate = await dateDisplay.innerText();
  91  | 
  92  |     // Use the step-forward button (+1h) to advance time reliably
  93  |     const stepForwardBtn = page.locator('button[aria-label="Forward 1h"]');
  94  |     await stepForwardBtn.click();
  95  |     await page.waitForTimeout(200);
  96  | 
  97  |     const newDate = await dateDisplay.innerText();
  98  |     expect(newDate).not.toBe(initialDate);
  99  |   });
  100 | 
  101 |   test('Hover card appears on globe hover', async ({ page }) => {
  102 |     await page.setViewportSize({ width: 1920, height: 1080 });
> 103 |     await page.goto('http://localhost:5173');
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
  104 | 
  105 |     // Wait for canvas and app boot
  106 |     await page.waitForSelector('canvas', { timeout: 20000 });
  107 |     await page.waitForTimeout(3000); // Allow Cesium to finish loading terrain
  108 | 
  109 |     // Move to center of viewport (over the globe)
  110 |     await page.mouse.move(960, 540);
  111 |     await page.waitForTimeout(500);
  112 | 
  113 |     // The hover card should appear within 5 seconds
  114 |     await page.waitForSelector('[data-testid="hover-data-card"]', { timeout: 8000 });
  115 |     await expect(page.locator('[data-testid="hover-data-card"]')).toBeVisible();
  116 |   });
  117 | 
  118 |   test('FPS counter displays a positive number', async ({ page }) => {
  119 |     await page.goto('http://localhost:5173');
  120 | 
  121 |     // Wait for FPS counter to populate
  122 |     const fpsEl = await page.waitForSelector('[data-testid="fps-counter"]', { timeout: 25000 });
  123 |     await page.waitForTimeout(1500); // Give render loop time to accumulate samples
  124 | 
  125 |     const text = await fpsEl.innerText();
  126 |     const fps = parseInt(text.replace(/[^0-9]/g, ''), 10);
  127 |     expect(fps).toBeGreaterThan(0);
  128 |   });
  129 | 
  130 | });
  131 | 
```