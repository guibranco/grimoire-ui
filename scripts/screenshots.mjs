/**
 * Captures README screenshots of Grimoire UI running against the built-in
 * mock API (demo data). No Grimoire API instance is required.
 *
 * Usage:
 *   npx playwright install chromium   # first run only
 *   npm run screenshots
 *
 * Output: docs/screenshots/*.png
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const port = Number(process.env.SCREENSHOT_PORT ?? 4173);
const viewport = { width: 1440, height: 900 };

await mkdir(outDir, { recursive: true });

const server = await createServer({
  root,
  configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  server: { port, strictPort: true, hmr: false },
  logLevel: 'error',
});
await server.listen();

const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await context.newPage();
  const shot = async (name) => {
    // Let toasts and motion transitions settle before capturing.
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${outDir}${name}.png` });
    console.log(`  ✓ ${name}.png`);
  };
  const dismissToasts = async () => {
    await page.evaluate(() =>
      document.querySelectorAll('[role="status"]').forEach((el) => el.closest('div[style]')?.remove()),
    );
  };

  console.log('Capturing Grimoire UI screenshots (mock API)…');

  // 1. Connect screen
  await page.goto(`http://localhost:${port}/`);
  await page.getByText('Launch Live Demo').waitFor();
  await shot('01-connect');

  // 2. Application secrets, with the first secret expanded to show per-environment values
  await page.getByText('Launch Live Demo').click();

  // Dashboard home: estate overview, attention items and recent activity
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
  await page.getByRole('list', { name: 'Applications' }).waitFor();
  await dismissToasts();
  await shot('08-dashboard');

  await page.locator('aside').getByText('Production Gateway').first().click();
  await page.getByText('DATABASE_PASSWORDS').first().click();
  await page.waitForTimeout(800);
  await dismissToasts();
  await shot('02-application-secrets');

  // 3. Secret version history
  await page.getByText('Auth Provider Security').first().click();
  await page.getByText('JWT_SIGNING_SECRET').first().click();
  await page.locator('[title="View version history"]').first().click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(800);
  await shot('03-secret-versions');
  await page.keyboard.press('Escape');

  // 4. Application configuration
  await page.getByText('Production Gateway').first().click();
  await page.getByRole('tab', { name: /configuration/i }).click();
  await page.waitForTimeout(800);
  await shot('04-application-configuration');

  // 5 & 6. Global configuration and secrets inherited by every application
  await page.locator('aside').getByText('Global', { exact: true }).click();
  await page.getByRole('tab', { name: /config/i }).click();
  await page.waitForTimeout(800);
  await shot('05-global-configuration');

  await page.getByRole('tab', { name: /secrets/i }).click();
  await page.waitForTimeout(800);
  await shot('06-global-secrets');

  // 7. Create application dialog
  await page.getByText('New Application').click();
  await page.getByRole('dialog').waitFor();
  await shot('07-create-application');
} finally {
  await browser.close();
  await server.close();
}
