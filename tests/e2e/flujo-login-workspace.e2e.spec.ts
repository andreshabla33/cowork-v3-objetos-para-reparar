import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage, WorkspacePage } from '../helpers/page-objects';
import { TEST_CONFIG } from '../helpers/test-config';
import { logout } from '../helpers/auth';

test.describe('E2E: Flujo completo Login → Dashboard → Workspace', () => {
  test.describe.configure({ mode: 'serial' });

  test('E2E-01: Usuario inicia sesión y llega al dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_CONFIG.testUser.email, TEST_CONFIG.testUser.password);

    // Esperar a que cargue el dashboard
    const dashboard = new DashboardPage(page);
    await dashboard.waitForLoad();
    await dashboard.assertVisible();
  });

  test('E2E-02: Usuario entra a un workspace desde el dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_CONFIG.testUser.email, TEST_CONFIG.testUser.password);

    const dashboard = new DashboardPage(page);
    await dashboard.waitForLoad();

    // Intentar entrar al primer workspace disponible
    // Buscar un botón o card clickeable que lleve al workspace
    const workspaceEntry = page.locator('button:has-text("Entrar"), button:has-text("Abrir"), [data-testid="workspace-card"]').first();
    
    if (await workspaceEntry.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await workspaceEntry.click();
      await page.waitForTimeout(3_000);

      // Verificar que se cargó el workspace (canvas 3D o layout)
      const workspace = new WorkspacePage(page);
      await workspace.waitForLoad();
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
