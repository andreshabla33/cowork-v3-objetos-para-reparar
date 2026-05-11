/**
 * @module hooks/space3d/useSpace3DKeyboardShortcuts
 *
 * Centraliza los atajos de teclado del espacio 3D:
 *   - Escape durante colocación de objeto → cancela colocación
 *   - Escape durante colocación de plantilla de zona → cancela + notifica
 *   - Ctrl/Cmd+C / Ctrl/Cmd+V en modo edición → copiar / pegar objetos
 *
 * Clean Architecture: **Presentation → Infrastructure de input**. Extrae los
 * `window.addEventListener('keydown')` que estaban dispersos en tres `useEffect`
 * en `VirtualSpace3D.tsx`. El hook en sí no contiene lógica de negocio — solo
 * traduce eventos de teclado a los callbacks que le inyecta el consumidor.
 *
 * Evita anti-patrones:
 *  - No usa `useEffect` como orquestador de flujo (los callbacks son props).
 *  - Los handlers no estables se capturan vía `useRef` para evitar reinstalar
 *    listeners en cada render (React 19: equivalente al patrón oficial de
 *    useEffectEvent sin requerir la feature flag).
 *
 * Ref: https://react.dev/reference/react/useEffectEvent
 */

import { useEffect, useRef } from 'react';

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface Space3DKeyboardShortcutsParams {
  /** true cuando hay un objeto en estado de colocación. */
  objetoEnColocacion: boolean;
  /** true cuando hay una plantilla de zona en estado de colocación. */
  plantillaZonaEnColocacion: boolean;
  /** true cuando el modo de edición está activo (habilita Ctrl+C/V). */
  editMode: boolean;

  /** Callback: cancelar colocación de objeto. Invocado al pulsar Escape. */
  onCancelObjectPlacement: () => void;
  /** Callback: cancelar colocación de plantilla. Invocado al pulsar Escape. */
  onCancelTemplatePlacement: () => void;
  /** Callback: copiar objetos seleccionados (Ctrl/Cmd+C). */
  onCopySelectedObjects: () => void;
  /** Callback: pegar objetos copiados (Ctrl/Cmd+V). Puede ser async. */
  onPasteObjects: () => void | Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSpace3DKeyboardShortcuts(params: Space3DKeyboardShortcutsParams): void {
  // Capturar callbacks en un ref — evita reinstalar listeners cuando cambian
  // las referencias de los handlers (patrón análogo a useEffectEvent).
  const handlersRef = useRef(params);
  handlersRef.current = params;

  // ── Escape: cancelar colocación de objeto ─────────────────────────────────
  useEffect(() => {
    if (!params.objetoEnColocacion) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handlersRef.current.onCancelObjectPlacement();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [params.objetoEnColocacion]);

  // ── Escape: cancelar colocación de plantilla ──────────────────────────────
  useEffect(() => {
    if (!params.plantillaZonaEnColocacion) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handlersRef.current.onCancelTemplatePlacement();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [params.plantillaZonaEnColocacion]);

  // ── Ctrl/Cmd+C / Ctrl/Cmd+V en modo edición ──────────────────────────────
  useEffect(() => {
    if (!params.editMode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Ignorar si el foco está en un input / textarea.
      const focused = document.activeElement;
      if (
        focused?.tagName === 'INPUT' ||
        focused?.tagName === 'TEXTAREA' ||
        (focused instanceof HTMLElement && focused.isContentEditable)
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier) return;

      const key = event.key.toLowerCase();
      if (key === 'c') {
        handlersRef.current.onCopySelectedObjects();
      } else if (key === 'v') {
        void handlersRef.current.onPasteObjects();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [params.editMode]);
}
