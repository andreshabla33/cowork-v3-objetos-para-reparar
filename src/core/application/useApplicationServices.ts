/**
 * @module application/useApplicationServices
 *
 * Hook de React que expone el `ApplicationServicesContainer` singleton
 * a los componentes/hooks de presentación. Es un simple `useRef` sobre
 * la instancia global — cero allocación adicional, referencia estable
 * entre renders (ideal como dep de `useCallback`/`useMemo`).
 *
 * Uso:
 *   const { interaccionObjeto, aplicarPlantillaZona } = useApplicationServices();
 *   const plan = interaccionObjeto.execute(input);
 *
 * No se usa React Context porque el container no cambia durante la vida
 * de la aplicación y el patrón singleton es suficiente. Ver:
 *   https://react.dev/learn/passing-data-deeply-with-context
 */

import { useRef } from 'react';
import {
  getApplicationServices,
  type ApplicationServices,
} from './ApplicationServicesContainer';

export function useApplicationServices(): ApplicationServices {
  const ref = useRef<ApplicationServices | null>(null);
  if (!ref.current) {
    ref.current = getApplicationServices();
  }
  return ref.current;
}
