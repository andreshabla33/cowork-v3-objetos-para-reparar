/**
 * @module infrastructure/di/container
 *
 * Contenedor de Dependency Injection para el proyecto.
 * Conecta ports del dominio con sus adapters de infraestructura.
 *
 * Clean Architecture: este archivo es el único lugar donde se instancian
 * los adapters concretos. El resto del código depende de los ports (interfaces).
 *
 * Patrón: Singleton lazy (se crea una sola vez en runtime).
 *
 * Ref CLEAN-ARCH-F3
 */

import type { ITextureFactory } from '../../domain/ports/ITextureFactory';
import type { IRenderingOptimizationService } from '../../domain/ports/IRenderingOptimizationService';
import type { IAuthRepository } from '../../domain/ports/IAuthRepository';
import type { IWorkspaceRepository } from '../../domain/ports/IWorkspaceRepository';
import type { IProfileRepository } from '../../domain/ports/IProfileRepository';
import type { IChatRepository } from '../../domain/ports/IChatRepository';
import type { IBatchedMeshService } from '../../domain/ports/IBatchedMeshService';
import type { IMultiBatchMeshService } from '../../domain/ports/IMultiBatchMeshService';
import type { ITextureAtlasService } from '../../domain/ports/ITextureAtlasService';
import type { IGPUSkinnedInstanceService } from '../../domain/ports/IGPUSkinnedInstanceService';
import type { IBatchMaterialPropertiesService } from '../../domain/ports/IBatchMaterialPropertiesService';
import type { IInvitacionRepository } from '../../domain/ports/IInvitacionRepository';
import type { IEnviarInvitacionRepository } from '../../domain/ports/IEnviarInvitacionRepository';
import type { IOnboardingRepository } from '../../domain/ports/IOnboardingRepository';
import type { IConfiguracionPerimetroRepository } from '../../domain/ports/IConfiguracionPerimetroRepository';

// ─── Tipo del contenedor ──────────────────────────────────────────────────────

export interface DIContainer {
  /** Fábrica de texturas PBR para suelos 3D */
  textureFactory: ITextureFactory;
  /** Servicio de optimización de renderizado (instancing, salud de frame) */
  renderingOptimization: IRenderingOptimizationService;
  /** Repositorio de autenticación */
  auth: IAuthRepository;
  /** Repositorio de workspaces */
  workspace: IWorkspaceRepository;
  /** Repositorio de perfil de usuario */
  profile: IProfileRepository;
  /** Repositorio de chat */
  chat: IChatRepository;
  /** Fase 3 — BatchedMesh para objetos estáticos (1 draw call por material) */
  batchedMesh: IBatchedMeshService;
  /** Fase 4A — Multi-material BatchedMesh (N batches, uno por material) */
  multiBatch: IMultiBatchMeshService;
  /** Fase 3 — Atlas de texturas Canvas2D (reduce texture switches) */
  textureAtlas: ITextureAtlasService;
  /** Fase 3 — GPU instanced skinning para 500 avatares (DataTexture RGBA32F) */
  gpuSkinnedInstance: IGPUSkinnedInstanceService;
  /** Fase 4D — Per-instance PBR material properties via DataTexture + shader injection */
  materialProps: IBatchMaterialPropertiesService;
  /** Repositorio de verificación y aceptación de invitaciones */
  invitacion: IInvitacionRepository;
  /** Repositorio de envío de invitaciones (Edge Function) */
  enviarInvitacion: IEnviarInvitacionRepository;
  /** Repositorio de onboarding de miembros */
  onboarding: IOnboardingRepository;
  /** Configuración del cerramiento perimetral por espacio (tabla dedicada + Realtime) */
  configuracionPerimetro: IConfiguracionPerimetroRepository;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _container: DIContainer | null = null;

/**
 * Inicializa y devuelve el contenedor DI (singleton).
 * Lazy initialization: solo crea los adapters cuando se llama por primera vez.
 *
 * @throws Error si se llama antes de que los adapters estén disponibles
 */
export async function getDIContainer(): Promise<DIContainer> {
  if (_container) return _container;

  // Imports dinámicos para evitar circular deps y permitir tree-shaking
  const [
    { ThreeTextureFactoryAdapter },
    { RenderingOptimizationAdapter },
    { AuthSupabaseRepository },
    { WorkspaceSupabaseRepository },
    { ProfileSupabaseRepository },
    { chatRepository },
    { getBatchedMeshAdapter },
    { getMultiBatchMeshAdapter },
    { getTextureAtlasAdapter },
    { getGPUSkinnedInstanceAdapter },
    { getBatchMaterialPropertiesAdapter },
    { InvitacionSupabaseRepository },
    { EnviarInvitacionSupabaseRepository },
    { OnboardingSupabaseRepository },
    { ConfiguracionPerimetroSupabaseRepository },
  ] = await Promise.all([
    import('../adapters/ThreeTextureFactoryAdapter'),
    import('../adapters/RenderingOptimizationAdapter'),
    import('../adapters/AuthSupabaseRepository'),
    import('../adapters/WorkspaceSupabaseRepository'),
    import('../adapters/ProfileSupabaseRepository'),
    import('../adapters/ChatSupabaseRepository'),
    import('../adapters/BatchedMeshThreeAdapter'),
    import('../adapters/MultiBatchMeshThreeAdapter'),
    import('../adapters/TextureAtlasCanvasAdapter'),
    import('../adapters/GPUSkinnedInstanceAdapter'),
    import('../adapters/BatchMaterialPropertiesThreeAdapter'),
    import('../adapters/InvitacionSupabaseRepository'),
    import('../adapters/EnviarInvitacionSupabaseRepository'),
    import('../adapters/OnboardingSupabaseRepository'),
    import('../adapters/ConfiguracionPerimetroSupabaseRepository'),
  ]);

  _container = {
    textureFactory: new ThreeTextureFactoryAdapter(),
    renderingOptimization: new RenderingOptimizationAdapter(),
    auth: new AuthSupabaseRepository(),
    workspace: new WorkspaceSupabaseRepository(),
    profile: new ProfileSupabaseRepository(),
    chat: chatRepository,
    batchedMesh: getBatchedMeshAdapter(),
    multiBatch: getMultiBatchMeshAdapter(),
    textureAtlas: getTextureAtlasAdapter(),
    gpuSkinnedInstance: getGPUSkinnedInstanceAdapter(),
    materialProps: getBatchMaterialPropertiesAdapter(),
    invitacion: new InvitacionSupabaseRepository(),
    enviarInvitacion: new EnviarInvitacionSupabaseRepository(),
    onboarding: new OnboardingSupabaseRepository(),
    configuracionPerimetro: new ConfiguracionPerimetroSupabaseRepository(),
  };

  return _container;
}

/**
 * Versión síncrona para uso en componentes que ya inicializaron el container.
 * @throws Error si el container no ha sido inicializado aún.
 */
export function getDIContainerSync(): DIContainer {
  if (!_container) {
    throw new Error(
      '[DI] Container no inicializado. Llama a getDIContainer() en el bootstrap de la app.',
    );
  }
  return _container;
}

/** Limpia el contenedor (útil en tests y hot-reload) */
export function resetDIContainer(): void {
  _container = null;
}
