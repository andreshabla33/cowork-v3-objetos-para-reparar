/**
 * @module hooks/chat/useChatPanel
 * Re-export proxy → implementación canónica en useChatPanel.tsx
 *
 * Este archivo existe para mantener compatibilidad con importadores que referencian
 * la extensión .ts explícitamente. La lógica real (incluido JSX para mention-highlighting)
 * vive en useChatPanel.tsx, que es el módulo TypeScript correcto para JSX.
 *
 * REMEDIATION-TS2 (2026-03-30): Separado en .tsx para eliminar error TS1005
 * causado por JSX en un archivo .ts sin soporte de JSX.
 */
export * from './useChatPanel.tsx';
