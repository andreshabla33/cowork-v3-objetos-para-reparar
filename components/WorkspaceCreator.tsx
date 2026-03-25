/**
 * @deprecated WorkspaceCreator está OBSOLETO desde v3.1.
 *
 * El sistema ahora opera con un único espacio global (kronos) en Supabase.
 * La creación de nuevos espacios está deshabilitada por diseño:
 *  - El espacio global se identifica dinámicamente vía configuracion->>'es_global' = true
 *  - Los nuevos usuarios se vinculan al espacio global a través del flujo OnboardingCreador
 *  - El Dashboard ya no expone ningún botón de "Crear espacio"
 *
 * Si en el futuro se necesita volver a habilitar esta funcionalidad,
 * restaurar desde git: components/WorkspaceCreator.tsx (antes de commit v3.1-refactor-espacio-unico)
 *
 * @see OnboardingCreador.tsx — flujo de incorporación al espacio global
 * @see store/useStore.ts — lógica initialize() con auto-selección de espacio único
 */

export {};
