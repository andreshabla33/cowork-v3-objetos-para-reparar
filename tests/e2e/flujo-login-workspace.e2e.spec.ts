import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage, WorkspacePage } from '../helpers/page-objects';
import { TEST_CONFIG } from '../helpers/test-config';
import { logout } from '../helpers/auth';

test.describe('E2E: Flujo completo Login → Dashboard → Workspace', () => {
  test.describe.configure({ mode: 'serial' });

  test('E2E-01: Usuario inicia sesión, persiste tras recarga y llega al dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_CONFIG.testUser.email, TEST_CONFIG.testUser.password);

    // Esperar a que cargue el dashboard
    const dashboard = new DashboardPage(page);
    await dashboard.waitForLoad();
    await dashboard.assertVisible();

    // Validar persistencia: recargar la página y seguir en el dashboard
    await page.reload();
    await dashboard.waitForLoad();
    await dashboard.assertVisible();
  });

  test('E2E-02: Usuario entra a un workspace y visualiza el entorno 3D', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_CONFIG.testUser.email, TEST_CONFIG.testUser.password);

    const dashboard = new DashboardPage(page);
    await dashboard.waitForLoad();

    // Intentar entrar al primer workspace disponible
    const workspaceEntry = page.locator('button:has-text("Entrar"), button:has-text("Abrir"), [data-testid="workspace-card"]').first();
    
    if (await workspaceEntry.isVisible({ timeout: 10_000 })) {
      await workspaceEntry.click();
      
      // Verificar que se cargó el workspace (canvas 3D)
      const workspace = new WorkspacePage(page);
      await workspace.waitForLoad();
      await workspace.assertCanvasVisible();
    }
  });

  test('E2E-03: Usuario puede cerrar sesión y volver al login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_CONFIG.testUser.email, TEST_CONFIG.testUser.password);

    // Esperar carga
    await page.waitForSelector('input[name="email"]', { state: 'hidden', timeout: 20_000 });
    await page.waitForTimeout(2_000);

    // Logout
    await logout(page);

    // Debería volver al login
    await loginPage.assertVisible();
  });
});
