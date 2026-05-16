/**
 * Captura screenshot de la pantalla de login del preview de Vercel para
 * verificar que el bundle se sirve correctamente (no requiere credenciales).
 *
 * USO: node scripts/capture-preview.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const URL = process.env.PREVIEW_URL
  ?? 'https://urpeverso-eenj3ljkl-andres-maldonados-projects-0d92e053.vercel.app';

const OUT_DIR = 'scripts/preview-screenshots';
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// Capturar response headers + HTML del initial load
const responses = [];
page.on('response', (r) => {
  if (r.url() === URL || r.url() === URL + '/') {
    responses.push({ status: r.status(), url: r.url() });
  }
});

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Screenshot de la pantalla inicial (login page)
  const screenshotPath = path.join(OUT_DIR, 'login-screen.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });

  // Extraer bundle URLs del HTML
  const html = await page.content();
  const bundleMatches = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)];
  const bundles = bundleMatches.map((m) => m[1]);

  // Fetch del bundle principal y grep por símbolos del fix
  const mainBundle = bundles.find((b) => b.includes('index-')) ?? bundles[0];
  if (mainBundle) {
    const fullUrl = URL + mainBundle;
    const bundleResp = await page.request.get(fullUrl);
    const bundleText = await bundleResp.text();
    const hasSidebarJuntas = bundleText.includes('SidebarJuntasGroup')
      || bundleText.includes('proximityClusters')
      || bundleText.includes('Áreas activas');
    const hasOldPanel = bundleText.includes('JuntasPanel')
      && !bundleText.includes('SidebarJuntasGroup');

    writeFileSync(
      path.join(OUT_DIR, 'verification.json'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        url: URL,
        responses,
        bundles,
        mainBundle,
        hasSidebarJuntasSymbol: hasSidebarJuntas,
        hasOldPanelSymbol: hasOldPanel,
        title: await page.title(),
      }, null, 2),
    );

    console.log('✅ Screenshot:', screenshotPath);
    console.log('✅ Main bundle:', mainBundle);
    console.log('✅ Contains "SidebarJuntasGroup" / "proximityClusters" / "Áreas activas":', hasSidebarJuntas);
    console.log('✅ Bundle ID rotated (no stale "JuntasPanel" alone):', !hasOldPanel);
  }
} catch (err) {
  console.error('❌ Error:', err.message);
} finally {
  await browser.close();
}
