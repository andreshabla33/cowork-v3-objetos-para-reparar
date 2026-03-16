# QA Testing — Cowork Virtual Workspace

Framework de pruebas automatizadas con **Playwright** para el cowork virtual.

---

## Suites de prueba

| Suite | Comando | Descripción |
|-------|---------|-------------|
| **Smoke** | `npm run test:smoke` | Pruebas de humo — lo mínimo que debe funcionar siempre |
| **E2E** | `npm run test:e2e` | End-to-end — flujos completos de usuario |
| **Funcional** | `npm run test:funcional` | Funcionales — features individuales (chat, 3D, tareas, reuniones, i18n) |
| **Regresión** | `npm run test:regresion` | Regresión — escenarios de bugs conocidos, performance, rutas |
| **Caja Negra** | `npm run test:caja-negra` | Caja negra — validación input/output, API responses, accesibilidad |
| **Mobile** | `npm run test:mobile` | Responsive — smoke tests en viewport móvil |
| **Todas** | `npm run test:all` | Ejecuta todas las suites (excepto mobile) |

---

## Setup rápido

### 1. Instalar dependencias
```bash
npm install
npx playwright install chromium
```

### 2. Crear usuarios de prueba (una sola vez)
```bash
# Configurar variables de entorno
# PowerShell:
$env:VITE_SUPABASE_URL="https://xxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Ejecutar seed
npm run test:seed
```

### 3. Configurar credenciales
Copiar `tests/.env.test.example` → `tests/.env.test` y completar con tus valores.

### 4. Ejecutar tests
```bash
# Pruebas de humo (recomendado empezar aquí)
npm run test:smoke

# Todas las suites
npm run test:all

# Con interfaz visual
npm run test:ui

# En modo debug (paso a paso)
npm run test:debug
```

---

## Estructura de archivos

```
tests/
├── .auth/                          # Estado de autenticación (gitignored)
├── helpers/
│   ├── test-config.ts              # Configuración centralizada
│   ├── auth.ts                     # Utilidades de autenticación
│   └── page-objects/
│       ├── LoginPage.ts            # Page Object: login/registro
│       ├── DashboardPage.ts        # Page Object: dashboard
│       ├── WorkspacePage.ts        # Page Object: workspace 3D
│       └── index.ts
├── scripts/
│   └── seed-test-users.mjs         # Crear usuarios de prueba en Supabase
├── smoke/
│   ├── auth.smoke.spec.ts          # S-AUTH-01..06
│   ├── app-carga.smoke.spec.ts     # S-APP-01..06
│   └── navegacion.smoke.spec.ts    # S-NAV-01..04
├── e2e/
│   ├── flujo-login-workspace.e2e.spec.ts   # E2E-01..03
│   ├── flujo-invitado.e2e.spec.ts          # E2E-INV-01..03
│   └── flujo-registro.e2e.spec.ts          # E2E-REG-01..04
├── funcional/
│   ├── chat.funcional.spec.ts              # F-CHAT-01..04
│   ├── workspace-3d.funcional.spec.ts      # F-3D-01..05
│   ├── tareas.funcional.spec.ts            # F-TASK-01..02
│   ├── reuniones.funcional.spec.ts         # F-MEET-01..03
│   └── i18n.funcional.spec.ts              # F-I18N-01..03
├── regresion/
│   ├── auth-regresion.spec.ts              # R-AUTH-01..06
│   ├── rendimiento-regresion.spec.ts       # R-PERF-01..05
│   └── rutas-regresion.spec.ts             # R-RUTA-01..05
├── caja-negra/
│   ├── formularios.caja-negra.spec.ts      # CN-FORM-01..08
│   ├── api-responses.caja-negra.spec.ts    # CN-API-01..05
│   └── accesibilidad.caja-negra.spec.ts    # CN-A11Y-01..06
├── global.setup.ts                 # Setup global de autenticación
├── .env.test.example               # Template de variables de entorno
└── README.md                       # Este archivo
```

---

## Convención de IDs de test

Cada test tiene un ID único con el formato `{SUITE}-{MÓDULO}-{NÚMERO}`:

- **S-** → Smoke
- **E2E-** → End-to-end
- **F-** → Funcional
- **R-** → Regresión
- **CN-** → Caja Negra

Ejemplo: `S-AUTH-02` = Smoke, módulo Auth, test #02.

---

## Comandos útiles

```bash
# Ejecutar un solo archivo de test
npx playwright test tests/smoke/auth.smoke.spec.ts

# Ejecutar un test específico por nombre
npx playwright test -g "S-AUTH-02"

# Generar tests con el codegen (abre un browser interactivo)
npx playwright codegen http://localhost:3000

# Ver el último reporte HTML
npm run test:report

# Ejecutar con tracing completo (para debug)
npx playwright test --trace on
```

---

## CI/CD

Los tests se ejecutan automáticamente en GitHub Actions:

- **Pull Request**: `validar` → `test-smoke` → `test-e2e`
- **Push a main**: `validar` → `test-smoke` → `test-e2e` + `test-full` (todas las suites)

### Secrets necesarios en GitHub
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `TEST_USER_EMAIL`
- `TEST_USER_PASSWORD`

---

## Agregar nuevos tests

1. Identificar la suite correcta (smoke, e2e, funcional, regresion, caja-negra)
2. Crear archivo `{nombre}.{suite}.spec.ts` en la carpeta correspondiente
3. Seguir la convención de IDs: `{SUITE}-{MÓDULO}-{NÚMERO}`
4. Usar Page Objects de `helpers/page-objects/` cuando sea posible
5. Usar `test.skip()` si un feature no está disponible (no fallar)

---

## Notas

- Los tests que requieren features que pueden no estar disponibles (chat, tareas, etc.) usan `test.skip()` en vez de fallar, para evitar falsos negativos.
- El proyecto usa `test.describe.configure({ mode: 'serial' })` solo cuando los tests dentro de un describe dependen entre sí.
- Los tests de performance (`R-PERF-*`) usan métricas reales del browser (FCP, bundle size).
- Los tests de seguridad (`CN-FORM-04..05`, `R-RUTA-04`) verifican SQLi y XSS básicos.
