/**
 * @file globe.spec.js
 * @module GlobeTests
 * @description Playwright E2E tests for Aetheris 4D.
 *              Validates globe render, layer toggles, timeline scrubber,
 *              hover data card, and FPS counter across desktop and mobile viewports.
 * @author Aetheris 4D
 */

import { test, expect } from '@playwright/test';

test.describe('Aetheris 4D Globe Render Tests', () => {

  test('Globe renders on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:5173');

    // Wait for Cesium globe canvas to appear
    await page.waitForSelector('canvas', { timeout: 20000 });

    // Assert canvas has non-zero dimensions
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);

    // Assert TopBar is visible
    await expect(page.locator('[data-testid="layer-toggle-wind"]')).toBeVisible({ timeout: 20000 });

    // Assert Timeline Scrubber is visible
    await expect(page.locator('[data-testid="timeline-scrubber"]')).toBeVisible({ timeout: 20000 });
  });

  test('Globe renders on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro
    await page.goto('http://localhost:5173');

    await page.waitForSelector('canvas', { timeout: 20000 });

    // Assert canvas exists and UI does not overflow
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(0);

    // Assert body has no horizontal scroll
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 10); // 10px tolerance

    // Timeline scrubber should still be present
    await expect(page.locator('[data-testid="timeline-scrubber"]')).toBeVisible({ timeout: 20000 });
  });

  test('Layer toggle — Wind particles appear and disappear', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Wait for app boot and layer toggles to be present
    await page.waitForSelector('[data-testid="layer-toggle-wind"]', { timeout: 25000 });

    const toggle = page.locator('[data-testid="layer-toggle-wind"]');

    // Get initial state (should be active/on)
    const initialPressed = await toggle.getAttribute('aria-pressed');
    expect(initialPressed).toBe('true');

    // Click wind toggle OFF
    await toggle.click();
    await page.waitForTimeout(300);

    const pressedOff = await toggle.getAttribute('aria-pressed');
    expect(pressedOff).toBe('false');

    // Click wind toggle ON again
    await toggle.click();
    await page.waitForTimeout(300);

    const pressedOn = await toggle.getAttribute('aria-pressed');
    expect(pressedOn).toBe('true');
  });

  test('Timeline scrubber changes displayed date', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Wait for timeline to be interactive
    await page.waitForSelector('[data-testid="current-datetime"]', { timeout: 25000 });

    const dateDisplay = page.locator('[data-testid="current-datetime"]');
    const initialDate = await dateDisplay.innerText();

    // Use the step-forward button (+1h) to advance time reliably
    const stepForwardBtn = page.locator('button[aria-label="Forward 1h"]');
    await stepForwardBtn.click();
    await page.waitForTimeout(200);

    const newDate = await dateDisplay.innerText();
    expect(newDate).not.toBe(initialDate);
  });

  test('Hover card appears on globe hover', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:5173');

    // Wait for canvas and app boot
    await page.waitForSelector('canvas', { timeout: 20000 });
    await page.waitForTimeout(3000); // Allow Cesium to finish loading terrain

    // Move to center of viewport (over the globe)
    await page.mouse.move(960, 540);
    await page.waitForTimeout(500);

    // The hover card should appear within 5 seconds
    await page.waitForSelector('[data-testid="hover-data-card"]', { timeout: 8000 });
    await expect(page.locator('[data-testid="hover-data-card"]')).toBeVisible();
  });

  test('FPS counter displays a positive number', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Wait for FPS counter to populate
    const fpsEl = await page.waitForSelector('[data-testid="fps-counter"]', { timeout: 25000 });
    await page.waitForTimeout(1500); // Give render loop time to accumulate samples

    const text = await fpsEl.innerText();
    const fps = parseInt(text.replace(/[^0-9]/g, ''), 10);
    expect(fps).toBeGreaterThan(0);
  });

});
