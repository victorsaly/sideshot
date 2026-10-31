// Renders docs/assets/how.html, the "How it works" figure, to how-light.png and how-dark.png.
// Run from the repository root: node docs/render-how.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'assets', 'how.html');

// Twice the drawn size, so the README's 960px-wide figure stays sharp on a dense display.
const scale = 2;

const browser = await chromium.launch();
try {
  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 560 }, deviceScaleFactor: scale });
    // The page themes itself from prefers-color-scheme, as the README's <picture> does.
    await page.emulateMedia({ colorScheme });
    await page.goto(`file://${source}`);
    await page.evaluate('document.fonts.ready');
    const out = path.join(here, 'assets', `how-${colorScheme}.png`);
    await page.locator('svg').screenshot({ path: out });
    console.log(`wrote ${path.relative(process.cwd(), out)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
