/**
 * Realtime Room Module - Clean Architecture implementation
 * 
 * This module provides:
 * - Domain types and entities
 * - Application coordinators for media and realtime
 * - Infrastructure adapters for LiveKit and browser APIs
 */

// Domain
export * from './domain/types';
export type { AudioSettings, CameraSettings } from './domain/MediaSettings';
export { defaultAudioSettings, defaultCameraSettings } from './domain/MediaSettings';
export { resolveDeliveryReliable, resolveDeliveryMode, type DeliveryMode } from './domain/DataDeliveryPolicy';

// Application
export { SpaceMediaCoordinator } from './application/SpaceMediaCoordinator';
export type { SpaceMediaCoordinatorOptions, SpaceMediaCoordinatorState } from './application/SpaceMediaCoordinator';
export { SpaceRealtimeCoordinator } from './application/SpaceRealtimeCoordinator';
export type { SpaceRealtimeCoordinatorOptions, SpaceRealtimeCoordinatorState } from './application/SpaceRealtimeCoordinator';
export { SpaceInteractionCoordinator } from './application/SpaceInteractionCoordinator';
export type { SpaceInteractionCoordinatorOptions, SpaceInteractionCoordinatorState, SpaceInteractionCoordinatorRuntime } from './application/SpaceInteractionCoordinator';
export { RealtimeEventBus } from './application/RealtimeEventBus';
export type { RealtimeEventEnvelope, RealtimeEventListener } from './application/RealtimeEventBus';
export { RealtimeDataPublisher } from './application/RealtimeDataPublisher';
export type { RoomProvider } from './application/RealtimeDataPublisher';
export { RealtimeEventParser } from './application/RealtimeEventParser';
export type { OnDataReceivedCallback } from './application/RealtimeEventParser';
export { LiveKitRoomGateway } from './application/LiveKitRoomGateway';
export type { LiveKitRoomGatewayOptions, LiveKitRoomGatewayState } from './application/LiveKitRoomGateway';
export { ActiveSpeakerPolicy } from './application/ActiveSpeakerPolicy';
export type { ActiveSpeakerPolicyInput } from './application/ActiveSpeakerPolicy';
export { GalleryPolicy } from './application/GalleryPolicy';
export type { GalleryPolicyInput } from './application/GalleryPolicy';
export { GalleryViewportPolicy } from './application/GalleryViewportPolicy';
export type { GalleryViewportCapacityDecision, GalleryViewportPolicyInput, GalleryViewportTier } from './application/GalleryViewportPolicy';
export { MeetingLayoutModelBuilder } from './application/MeetingLayoutModel';
export type { MeetingGalleryLayoutConfig, MeetingLayoutModel, MeetingLayoutModelInput, MeetingLayoutTemplate } from './application/MeetingLayoutModel';
export { RaiseHandUseCase } from './application/RaiseHandUseCase';
export type { RaiseHandApplyInput, RaiseHandDecision, RaiseHandToggleInput } from './application/RaiseHandUseCase';
export { GuidedOnboardingService } from './application/GuidedOnboardingService';
export type { GuidedOnboardingStep } from './application/GuidedOnboardingService';
export { RecordingDiagnosticsService } from './application/RecordingDiagnosticsService';
export type { RecordingDiagnostics, RecordingDiagnosticsCode, RecordingDiagnosticsSeverity, RecordingDiagnosticsSnapshot, RecordingProcessingStep } from './application/RecordingDiagnosticsService';
export { SpaceVideoHudLayoutModelBuilder } from './application/SpaceVideoHudLayoutModel';
export type { SpaceVideoHudLayoutModel, SpaceVideoHudLayoutModelInput, SpaceVideoHudRemoteCameraTile, SpaceVideoHudRemoteScreenShareTile } from './application/SpaceVideoHudLayoutModel';
export { VisualSnapshotService } from './application/VisualSnapshotService';
export type { MeetingVisualSnapshotInput, MeetingVisualSnapshotResult, SpaceVideoHudSnapshotInput, SpaceVideoHudSnapshotResult } from './application/VisualSnapshotService';
export { PinningPolicy } from './application/PinningPolicy';
export type { PinningPolicyInput } from './application/PinningPolicy';
export { SubscriptionPolicyService } from './application/SubscriptionPolicyService';
export type {
  MeetingSubscriptionPolicyDecision,
  MeetingSubscriptionPolicyInput,
  MeetingSubscriptionPolicySnapshot,
  SubscriptionPolicyDecision,
  SubscriptionPolicyInput,
  SubscriptionPolicyServiceOptions,
  SubscriptionPolicySnapshot,
  SubscriptionVideoQuality,
  SubscriptionInterestTier,
} from './application/SubscriptionPolicyService';
export { ViewportFitPolicy } from './application/ViewportFitPolicy';
export type { ViewportFitInput, VisualLayoutMode } from './application/ViewportFitPolicy';
export { TrackPublicationCoordinator } from './application/TrackPublicationCoordinator';
export type { TrackPublicationAction, TrackPublicationCoordinatorInput, TrackPublicationPlan, TrackPublicationPlanItem, TrackPublicationSource } from './application/TrackPublicationCoordinator';
export {
  CAPAS_SIMULCAST_VIDEO_LIVEKIT,
  CODEC_VIDEO_BACKUP,
  CODEC_VIDEO_PREFERIDO,
  CODIFICACION_SCREEN_SHARE_LIVEKIT,
  CODIFICACION_VIDEO_CAMARA_LIVEKIT,
  crearOpcionesPublicacionTrackLiveKit,
  crearOpcionesSalaLiveKit,
  obtenerSiguienteDelayReconexionLiveKitMs,
  SCALABILITY_MODE_CAMERA,
  SCALABILITY_MODE_SCREEN_SHARE,
} from './application/PoliticaTransporteLiveKit';
export { RemoteTrackAttachmentPolicy } from './application/RemoteTrackAttachmentPolicy';
export type { RemoteTrackAttachmentAction, RemoteTrackAttachmentDecision, RemoteTrackAttachmentSlot, RemoteTrackAttachmentState } from './application/RemoteTrackAttachmentPolicy';
export { RemoteRenderLifecyclePolicy } from './application/RemoteRenderLifecyclePolicy';
export type { RemoteRenderAction, RemoteRenderDecision, RemoteRenderLifecycleState, RemoteRenderSlot } from './application/RemoteRenderLifecyclePolicy';
export { RemoteMediaLifecycleDiagnostics } from './application/RemoteMediaLifecycleDiagnostics';
export type { RemoteMediaLifecycleDiagnosticsOptions, RemoteMediaLifecycleDiagnosticsPayload, RemoteMediaLifecycleEvent } from './application/RemoteMediaLifecycleDiagnostics';
export { ConnectionQualityMonitor } from './application/ConnectionQualityMonitor';
export type { ConnectionQualityEntry, ConnectionQualityLevel, ConnectionQualityMonitorOptions, ConnectionQualitySnapshot } from './application/ConnectionQualityMonitor';
export { RealtimeSessionTelemetry } from './application/RealtimeSessionTelemetry';
export type { RealtimeTelemetryCategory, RealtimeTelemetryEvent, RealtimeTelemetrySeverity, RealtimeTelemetrySnapshot, RealtimeSessionTelemetryOptions } from './application/RealtimeSessionTelemetry';
export { PreflightSessionStore } from './application/PreflightSessionStore';
export type { PreflightSessionStoreOptions } from './application/PreflightSessionStore';
export { Gatekeeper } from './application/Gatekeeper';
export type { GatekeeperOptions } from './application/Gatekeeper';
export { getPreflightFeedback, getPreflightFeedbackMessage, getPrimaryPreflightError } from './presentation/preflightFeedback';
export type { PreflightFeedback } from './presentation/preflightFeedback';
export { useLiveKitVideoBackground } from './presentation/useLiveKitVideoBackground';
export type { UseLiveKitVideoBackgroundParams, UseLiveKitVideoBackgroundReturn } from './presentation/useLiveKitVideoBackground';
export { useLocalCameraTrack } from './presentation/useLocalCameraTrack';
export type { UseLocalCameraTrackParams } from './presentation/useLocalCameraTrack';

// Infrastructure
export { DeviceManager } from './infrastructure/browser/DeviceManager';
export type { DeviceManagerOptions } from './infrastructure/browser/DeviceManager';
export { loadAudioSettings, saveAudioSettings, loadCameraSettings, saveCameraSettings } from './infrastructure/browser/MediaSettingsStorage';
export { PermissionService } from './infrastructure/browser/PermissionService';
export type { PermissionServiceOptions } from './infrastructure/browser/PermissionService';
export { detectBrowserInfo, canShareScreenWithAudio } from './infrastructure/browser/BrowserCompatibility';
export type { BrowserInfo, BrowserCapabilities } from './infrastructure/browser/BrowserCompatibility';
