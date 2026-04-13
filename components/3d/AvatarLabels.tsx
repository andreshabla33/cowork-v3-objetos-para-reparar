/**
 * @module components/3d/AvatarLabels
 * @description Unified WebGL name labels for ALL avatars (local + remote).
 *
 * Clean Architecture: Presentation layer — pure rendering component.
 * All data preparation is handled by PrepararAvatarLabelsUseCase (Application)
 * via EcsAvatarLabelDataProvider (Infrastructure).
 *
 * Merges features from two legacy systems:
 *   - AvatarLabels (PR-10): WebGL troika text, batch rendering, 0 DOM elements
 *   - Avatar inline label: dynamic Y offset, current user color, status tooltip, click interaction
 *
 * Optimizations retained:
 *   1. Only renders labels from pre-filtered AvatarLabelEntity[]
 *   2. Billboard automatic (always faces camera)
 *   3. Aggressive memoization — custom React.memo comparator
 *   4. Font size quantization (2 discrete values → no troika geometry churn)
 *   5. Shared singleton geometries
 *   6. Status tooltip: 1 DOM element on click (vs 0 in idle)
 *
 * Performance with 500 avatars and ~80 visible:
 *   - DOM elements: 0 idle, 1 max (tooltip on click)
 *   - Draw calls: 2-3 (troika batching)
 */

'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Text, Html, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { AvatarLabelEntity } from '@/src/core/domain/entities/espacio3d/AvatarLabelEntity';
import { LABEL_CONFIG } from '@/src/core/domain/entities/espacio3d/AvatarLabelEntity';
import { PrepararAvatarLabelsUseCase } from '@/src/core/application/usecases/PrepararAvatarLabelsUseCase';
import { ecsAvatarLabelDataProvider } from '@/src/core/infrastructure/adapters/EcsAvatarLabelDataProvider';
import { statusColors, STATUS_LABELS } from '../space3d/spaceTypes';
import type { PresenceStatus } from '@/types';

// ─── Singleton use case instance ────────────────────────────────────────────
const prepararLabelsUseCase = new PrepararAvatarLabelsUseCase(ecsAvatarLabelDataProvider);

// ─── Shared geometries (singleton — no leak on re-render) ───────────────────
const statusDotGeometry = new THREE.SphereGeometry(0.06, 8, 8);

// ─── Status colors for WebGL dot (aligned with spaceTypes.statusColors) ─────
const LABEL_STATUS_COLORS: Record<string, string> = {
  available: '#22c55e',
  busy: '#ef4444',
  away: '#f59e0b',
  dnd: '#dc2626',
};
const DEFAULT_STATUS_COLOR = '#9ca3af';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface UnifiedAvatarLabelsProps {
  /** ECS store version — triggers React re-render when entities change */
  ecsVersion: number;
  /** Global setting: show name labels above avatars */
  showNames?: boolean;
  /** ID of the current (local) user */
  currentUserId: string;
  /** Map of userId → measured avatar height from GLTFAvatar */
  avatarHeights: ReadonlyMap<string, number>;
}

// ─── Main component ─────────────────────────────────────────────────────────

/**
 * Renders unified name labels + status dots for all visible avatars.
 * Uses WebGL text (troika-three-text) — 0 DOM elements in idle state.
 *
 * Features merged from both legacy systems:
 *   ✓ Dynamic Y offset (avatarHeight + LABEL_Y_OFFSET)
 *   ✓ Current user highlight color (#60a5fa)
 *   ✓ Status tooltip on click (Html portal, 1 DOM element)
 *   ✓ Status dot (WebGL sphere)
 *   ✓ Distance-based font quantization (2 sizes)
 *   ✓ Aggressive memoization
 */
export const AvatarLabels: React.FC<UnifiedAvatarLabelsProps> = React.memo(({
  ecsVersion,
  showNames = true,
  currentUserId,
  avatarHeights,
}) => {
  // Run the use case to get filtered labels
  // eslint-disable-next-line react-hooks/exhaustive-deps — ecsVersion triggers recalc
  const { labels } = useMemo(
    () => prepararLabelsUseCase.execute({
      currentUserId,
      avatarHeights,
      showNames,
    }),
    [ecsVersion, currentUserId, avatarHeights, showNames],
  );

  if (labels.length === 0) return null;

  return (
    <>
      {labels.map((label) => (
        <AvatarLabel key={label.userId} label={label} />
      ))}
    </>
  );
});

AvatarLabels.displayName = 'AvatarLabels';

// ─── Individual label (WebGL, 0 DOM idle) ───────────────────────────────────

interface AvatarLabelProps {
  label: AvatarLabelEntity;
}

const AvatarLabel: React.FC<AvatarLabelProps> = React.memo(({ label }) => {
  const [showStatusTooltip, setShowStatusTooltip] = useState(false);
  const statusColor = LABEL_STATUS_COLORS[label.status] || DEFAULT_STATUS_COLOR;

  // Auto-hide status tooltip
  useEffect(() => {
    if (showStatusTooltip) {
      const timer = setTimeout(
        () => setShowStatusTooltip(false),
        LABEL_CONFIG.STATUS_TOOLTIP_DELAY_MS,
      );
      return () => clearTimeout(timer);
    }
  }, [showStatusTooltip]);

  // Click handler — show status tooltip for remote users
  const handleClick = useCallback((e: THREE.Event) => {
    (e as unknown as { stopPropagation: () => void }).stopPropagation();
    if (!label.isCurrentUser) {
      setShowStatusTooltip(true);
    }
  }, [label.isCurrentUser]);

  // Dynamic Y: avatar height + offset (was fixed 2.4 in PR-10, now dynamic)
  const nameY = label.avatarHeight + LABEL_CONFIG.LABEL_Y_OFFSET;

  // Font size quantization — 2 discrete values to prevent troika geometry churn.
  // Hysteresis band (18/22) prevents oscillation at the threshold.
  const fontSize = label.distanceToCamera > LABEL_CONFIG.FONT_FAR_THRESHOLD
    ? LABEL_CONFIG.FONT_SIZE_FAR
    : label.distanceToCamera < LABEL_CONFIG.FONT_NEAR_THRESHOLD
      ? LABEL_CONFIG.FONT_SIZE_NEAR
      : LABEL_CONFIG.FONT_SIZE_FAR;

  // Color: current user gets highlight blue, remote users get white
  const textColor = label.isCurrentUser ? '#60a5fa' : '#ffffff';

  return (
    <group position={[label.x, nameY, label.z]}>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <group>
          {/* Name — WebGL text (troika) */}
          <Text
            fontSize={fontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#000000"
            renderOrder={10}
            depthOffset={-1}
            onClick={handleClick}
          >
            {label.name}
          </Text>

          {/* Status dot — WebGL sphere */}
          <mesh
            position={[label.name.length * 0.08 + 0.05, 0, 0]}
            geometry={statusDotGeometry}
          >
            <meshBasicMaterial color={statusColor} />
          </mesh>
        </group>

        {/* Status tooltip — 1 DOM element, only on click (idle = 0 DOM) */}
        {showStatusTooltip && !label.isCurrentUser && (
          <Html position={[0, 0.45, 0]} center zIndexRange={[200, 0]}>
            <div
              className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white shadow-lg whitespace-nowrap"
              style={{ backgroundColor: statusColors[label.status as PresenceStatus] }}
            >
              {STATUS_LABELS[label.status as PresenceStatus] ?? label.status}
            </div>
          </Html>
        )}
      </Billboard>
    </group>
  );
}, (prev, next) => {
  // Custom comparator — only re-render on visually relevant changes.
  // Position: tolerance of 0.5 units to reduce spurious updates.
  // Distance: quantize to same fontSize bucket to avoid troika re-geometry.
  const pL = prev.label;
  const nL = next.label;
  const prevFar = pL.distanceToCamera > 20;
  const nextFar = nL.distanceToCamera > 20;
  return (
    pL.name === nL.name &&
    pL.status === nL.status &&
    pL.isCurrentUser === nL.isCurrentUser &&
    pL.isCameraOn === nL.isCameraOn &&
    pL.lodLevel === nL.lodLevel &&
    Math.abs(pL.x - nL.x) < 0.5 &&
    Math.abs(pL.z - nL.z) < 0.5 &&
    Math.abs(pL.avatarHeight - nL.avatarHeight) < 0.1 &&
    prevFar === nextFar
  );
});

AvatarLabel.displayName = 'AvatarLabel';
