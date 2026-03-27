# Registro de Cambios - Visibilidad de Usuarios

**Fecha:** 9 de Febrero 2026
**Autor:** Cascade (Asistente de IA)
**Contexto:** Corrección de visibilidad de usuarios en el espacio virtual.

## 📋 Descripción del Cambio

Se ha eliminado la opción de configuración `sharePresenceWithTeam` (Compartir presencia con el equipo) para garantizar que todos los usuarios sean visibles en el espacio virtual por defecto. Anteriormente, esta opción podía estar desactivada, lo que causaba que los usuarios no se vieran entre sí.

La privacidad de la ubicación exacta sigue siendo controlable mediante la opción `showLocationInSpace`.

## 🛠 Archivos Modificados

### 1. `lib/userSettings.ts`
- **Cambio:** Se eliminó `sharePresenceWithTeam` de la interfaz `UserSettings['privacy']`.
- **Cambio:** Se eliminó `sharePresenceWithTeam` del objeto `defaultSettings.privacy`.

### 2. `components/settings/sections/SettingsPrivacy.tsx`
- **Cambio:** Se eliminó la propiedad `sharePresenceWithTeam` de la interfaz local `PrivacySettings`.
- **Cambio:** Se eliminó el componente `<SettingToggle>` correspondiente a "Compartir presencia".

### 3. `components/settings/SettingsModal.tsx`
- **Cambio:** Se eliminó `sharePresenceWithTeam` del objeto `defaultSettings` local del modal.

### 4. `components/WorkspaceLayout.tsx`
- **Cambio:** Se eliminó la condición que bloqueaba el envío de presencia (`channel.track`) si `sharePresenceWithTeam` era falso.
- **Resultado:** Ahora el usuario siempre transmite su presencia básica (ID, nombre, avatar, rol) al canal de Realtime. La transmisión de coordenadas X/Y sigue dependiendo de `showLocationInSpace`.

## ✅ Verificación

- Se verificó que no existen referencias a `sharePresenceWithTeam` en el código fuente (`.ts`, `.tsx`).
- La lógica de presencia en `WorkspaceLayout` ahora es incondicional para el tracking básico.
