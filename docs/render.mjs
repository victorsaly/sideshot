// Renders the README's figures from their sources in docs/assets: hero.html to hero.png, and how.html to
// how-light.png and how-dark.png. Run from the repository root: node docs/render.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');

// Twice the drawn size, so a figure shown at 960px in the README stays sharp on a dense display.
const scale = 2;

/** @type {{ source: string, width: number, height: number, what: string, schemes: ('light' | 'dark')[], font?: string }[]} */
const figures = [
  // The hero is as tall as its pictures make it; the viewport only has to be wide enough.
  { source: 'hero.html', width: 1600, height: 1000, what: 'body', schemes: ['light'], font: '900 52px Inter' },
  { source: 'how.html', width: 1400, height: 560, what: 'svg', schemes: ['light', 'dark'] },
];

const browser = await chromium.launch();
try {
  for (const figure of figures) {
    for (const colorScheme of figure.schemes) {
      const page = await browser.newPage({
        viewport: { width: figure.width, height: figure.height },
        deviceScaleFactor: scale,
      });
      // A page themes itself from prefers-color-scheme, as the README's <picture> does.
      await page.emulateMedia({ colorScheme });
      await page.goto(`file://${path.join(assets, figure.source)}`);
      await page.evaluate('document.fonts.ready');
      if (figure.font && !(await page.evaluate(`document.fonts.check(${JSON.stringify(figure.font)})`))) {
        console.warn(`${figure.source}: ${figure.font} did not load; the figure is in the fallback font`);
      }
      const name = figure.source.replace(/\.html$/, '');
      const out = path.join(assets, figure.schemes.length > 1 ? `${name}-${colorScheme}.png` : `${name}.png`);
      await page.locator(figure.what).screenshot({ path: out });
      console.log(`wrote ${path.relative(process.cwd(), out)}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
