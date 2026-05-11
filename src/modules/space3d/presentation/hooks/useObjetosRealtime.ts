/**
 * @module hooks/space3d/useObjetosRealtime
 *
 * Clean Architecture — Presentation hook que aísla la suscripción Realtime
 * a `espacio_objetos`. Extraído de `useEspacioObjetos` para que el hook
 * principal no orqueste fetch + mutations + realtime en 760+ líneas.
 *
 * Pattern: el hook recibe handlers vía closure y los wrappea con la última
 * referencia (vía `useRef`) para que el callback que pasa al port no se
 * recree por cambios de identidad. Eso evita re-suscripciones inútiles.
 *
 * El port (`IEspacioObjetosRepository.suscribirCambios`) abstrae Supabase.
 */

import { useEffect, useRef } from 'react';
import { useDI } from '@/src/core/infrastructure/di/DIProvider';
import type { ObjetoEspacio3D as EspacioObjeto } from '@/src/core/domain/entities/espacio3d';

export interface UseObjetosRealtimeHandlers {
  onInsert: (objeto: EspacioObjeto) => void;
  onUpdate: (objeto: EspacioObjeto) => void;
  onDelete: (objetoId: string) => void;
}

/**
 * Suscribe a INSERT/UPDATE/DELETE de `espacio_objetos` filtrados por espacio.
 * Si `espacioId` es null, no suscribe nada. Limpia la subscription en unmount
 * o cuando cambia el `espacioId`.
 */
export function useObjetosRealtime(
  espacioId: string | null | undefined,
  handlers: UseObjetosRealtimeHandlers,
): void {
  const container = useDI();
  // Refs estables: los handlers pueden recrearse cada render sin que
  // disparemos una re-subscription Realtime.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!espacioId) return;

    const unsubscribe = container.espacioObjetos.suscribirCambios(espacioId, {
      onInsert: (obj) => handlersRef.current.onInsert(obj),
      onUpdate: (obj) => handlersRef.current.onUpdate(obj),
      onDelete: (id) => handlersRef.current.onDelete(id),
    });

    return unsubscribe;
  }, [espacioId, container]);
}
