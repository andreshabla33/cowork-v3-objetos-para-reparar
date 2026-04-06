/**
 * @module infrastructure/di/DIProvider
 *
 * React Context Provider que expone el contenedor DI a toda la app.
 * Permite a los hooks y componentes acceder a los use cases sin
 * importar directamente los adapters (respetando Dependency Rule).
 *
 * Uso en la raíz de la app:
 * @example
 * <DIProvider>
 *   <App />
 * </DIProvider>
 *
 * Uso en componentes:
 * @example
 * const { textureFactory, renderingOptimization } = useDI();
 * const uc = new GestionarMaterialesSueloUseCase(textureFactory);
 *
 * Clean Architecture: esta es la capa de "wiring" — une la infraestructura
 * con la presentación a través del contexto de React.
 *
 * Ref CLEAN-ARCH-F3
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { DIContainer } from './container';
import { getDIContainer } from './container';

// ─── Context ──────────────────────────────────────────────────────────────────

const DIContext = createContext<DIContainer | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface DIProviderProps {
  children: React.ReactNode;
  /** Para tests: inyectar un container mock */
  containerOverride?: DIContainer;
}

/**
 * Provider que inicializa el contenedor DI de forma asíncrona.
 * Muestra null mientras carga (el Suspense de la app maneja esto).
 */
export function DIProvider({ children, containerOverride }: DIProviderProps): React.ReactElement | null {
  const [container, setContainer] = useState<DIContainer | null>(containerOverride ?? null);

  useEffect(() => {
    if (containerOverride) return;

    let cancelled = false;

    getDIContainer()
      .then((c) => {
        if (!cancelled) setContainer(c);
      })
      .catch((err) => {
        console.error('[DIProvider] Error inicializando container DI:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [containerOverride]);

  if (!container) return null;

  return (
    <DIContext.Provider value={container}>
      {children}
    </DIContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook para acceder al contenedor DI.
 * @throws Error si se usa fuera de DIProvider.
 */
export function useDI(): DIContainer {
  const ctx = useContext(DIContext);
  if (!ctx) {
    throw new Error('[useDI] Debe usarse dentro de <DIProvider>. Verifica el árbol de componentes.');
  }
  return ctx;
}

/**
 * Hook para acceder a un use case específico desde la capa de aplicación.
 * El callback recibe el container y devuelve el use case instanciado.
 *
 * @example
 * const uc = useDIUseCase((c) => new GestionarMaterialesSueloUseCase(c.textureFactory));
 */
export function useDIUseCase<T>(factory: (container: DIContainer) => T): T {
  const container = useDI();
  return factory(container);
}
