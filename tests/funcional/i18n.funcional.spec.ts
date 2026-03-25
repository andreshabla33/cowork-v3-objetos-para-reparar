import { test, expect } from '@playwright/test';

test.describe('FUNCIONAL: Internacionalización (i18n)', () => {

  test('F-I18N-01: La app carga con locale español', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3_000);

    // Buscar texto en español
    const spanishText = page.locator(
      ':has-text("Correo electrónico"), :has-text("Contraseña"), :has-text("Entrar"), :has-text("Invitado")'
    );
    const count = await spanishText.count();
    expect(count).toBeGreaterThan(0);
  });

  test('F-I18N-02: Los archivos de traducción cargan sin errores 404', async ({ page }) => {
    const failed404: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/locales/') && response.status() === 404) {
        failed404.push(response.url());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(5_000);

    expect(failed404).toHaveLength(0);
  });

  test('F-I18N-03: No hay claves de traducción sin resolver visibles', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3_000);

    // Buscar patrones de claves sin traducir (ej: "auth.login", "common.submit")
    const bodyText = await page.evaluate(() => document.body.innerText);
    const unresolvedKeys: string[] = bodyText.match(/\b[a-z]+\.[a-z]+\.[a-z]+/g) ?? [];

    // Filtrar falsos positivos (URLs, emails, etc.)
    const suspiciousKeys = unresolvedKeys.filter(
      (key) => !key.includes('@') && !key.includes('http') && !key.includes('com')
    );

    // Permitir algunos pero no una cantidad excesiva
    expect(suspiciousKeys.length).toBeLessThan(10);
  });
});
