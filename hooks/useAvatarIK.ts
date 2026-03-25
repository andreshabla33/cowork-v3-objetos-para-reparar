'use client';

import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver.js';

/**
 * Hook para Inverse Kinematics (IK) en avatares sentados
 * Permite que el avatar se siente correctamente en cualquier altura de silla
 * usando CCDIKSolver nativo de Three.js
 */

export interface IKSitConfig {
  seatPosition: THREE.Vector3;
  seatRotation?: number;
  floorY?: number;
  maxKneeAngle?: number;
}

export interface IKChainConfig {
  hipBoneIndex: number;
  thighBoneIndex: number;
  calfBoneIndex: number;
  footBoneIndex: number;
}

export function useAvatarIK(
  skinnedMesh: THREE.SkinnedMesh | null,
  isSitting: boolean,
  sitConfig?: IKSitConfig
) {
  const solverRef = useRef<CCDIKSolver | null>(null);
  const footTargetsRef = useRef<THREE.Object3D[]>([]);
  const kneeTargetsRef = useRef<THREE.Object3D[]>([]);
  const legChainsRef = useRef<IKChainConfig[]>([]);

  const findLegBoneIndices = useCallback((skeleton: THREE.Skeleton): IKChainConfig[] => {
    const bones = skeleton.bones;
    const chains: IKChainConfig[] = [];

    const boneAliases: Record<string, string[]> = {
      leftThigh: ['leftupleg', 'left_upper_leg', 'l_upperleg', 'mixamorig:leftupleg', 'leftupperleg', 'lthigh', 'leftthigh'],
      leftCalf: ['leftleg', 'left_lower_leg', 'l_lowerleg', 'mixamorig:leftleg', 'leftlowerleg', 'lcalf', 'leftcalf', 'leftknee', 'leftshin'],
      leftFoot: ['leftfoot', 'left_foot', 'l_foot', 'mixamorig:leftfoot', 'lfoot'],
      rightThigh: ['rightupleg', 'right_upper_leg', 'r_upperleg', 'mixamorig:rightupleg', 'rightupperleg', 'rthigh', 'rightthigh'],
      rightCalf: ['rightleg', 'right_lower_leg', 'r_lowerleg', 'mixamorig:rightleg', 'rightlowerleg', 'rcalf', 'rightcalf', 'rightknee', 'rightshin'],
      rightFoot: ['rightfoot', 'right_foot', 'r_foot', 'mixamorig:rightfoot', 'rfoot'],
    };

    const findBoneIndex = (aliases: string[]): number => {
      for (let i = 0; i < bones.length; i++) {
        const boneName = bones[i].name.toLowerCase().replace(/[\s:._-]/g, '');
        if (aliases.some(alias => boneName.includes(alias.toLowerCase().replace(/[\s:._-]/g, '')))) {
          return i;
        }
      }
      return -1;
    };

    // Cadena izquierda
    const leftThighIdx = findBoneIndex(boneAliases.leftThigh);
    const leftCalfIdx = findBoneIndex(boneAliases.leftCalf);
    const leftFootIdx = findBoneIndex(boneAliases.leftFoot);

    if (leftThighIdx !== -1 && leftCalfIdx !== -1 && leftFootIdx !== -1) {
      chains.push({
        hipBoneIndex: bones[leftThighIdx].parent ? bones.indexOf(bones[leftThighIdx].parent as THREE.Bone) : -1,
        thighBoneIndex: leftThighIdx,
        calfBoneIndex: leftCalfIdx,
        footBoneIndex: leftFootIdx,
      });
    }

    // Cadena derecha
    const rightThighIdx = findBoneIndex(boneAliases.rightThigh);
    const rightCalfIdx = findBoneIndex(boneAliases.rightCalf);
    const rightFootIdx = findBoneIndex(boneAliases.rightFoot);

    if (rightThighIdx !== -1 && rightCalfIdx !== -1 && rightFootIdx !== -1) {
      chains.push({
        hipBoneIndex: bones[rightThighIdx].parent ? bones.indexOf(bones[rightThighIdx].parent as THREE.Bone) : -1,
        thighBoneIndex: rightThighIdx,
        calfBoneIndex: rightCalfIdx,
        footBoneIndex: rightFootIdx,
      });
    }

    return chains;
  }, []);

  const createTargets = useCallback((scene: THREE.Object3D) => {
    const leftFootTarget = new THREE.Object3D();
    leftFootTarget.name = 'LeftFootIKTarget';
    scene.add(leftFootTarget);

    const rightFootTarget = new THREE.Object3D();
    rightFootTarget.name = 'RightFootIKTarget';
    scene.add(rightFootTarget);

    const leftKneeTarget = new THREE.Object3D();
    leftKneeTarget.name = 'LeftKneeIKTarget';
    scene.add(leftKneeTarget);

    const rightKneeTarget = new THREE.Object3D();
    rightKneeTarget.name = 'RightKneeIKTarget';
    scene.add(rightKneeTarget);

    footTargetsRef.current = [leftFootTarget, rightFootTarget];
    kneeTargetsRef.current = [leftKneeTarget, rightKneeTarget];

    return { footTargets: [leftFootTarget, rightFootTarget], kneeTargets: [leftKneeTarget, rightKneeTarget] };
  }, []);

  // Inicializar solver IK
  useEffect(() => {
    if (!skinnedMesh || !isSitting || solverRef.current) return;

    const skeleton = skinnedMesh.skeleton;
    if (!skeleton) {
      console.warn('[IK] No skeleton found in skinned mesh');
      return;
    }

    const chains = findLegBoneIndices(skeleton);
    if (chains.length === 0) {
      console.warn('[IK] No leg bone chains found');
      return;
    }

    legChainsRef.current = chains;

    const parent = skinnedMesh.parent || skinnedMesh;
    const { footTargets, kneeTargets } = createTargets(parent);

    const iks: {
      target: number;
      effector: number;
      links: { index: number; limitation?: THREE.Vector3; enabled?: boolean }[];
    }[] = [];

    chains.forEach((chain, index) => {
      const footTargetIndex = parent.children.indexOf(footTargets[index]);
      
      if (footTargetIndex !== -1) {
        iks.push({
          target: footTargetIndex,
          effector: chain.footBoneIndex,
          links: [
            { index: chain.calfBoneIndex },
            { index: chain.thighBoneIndex },
          ],
        });
      }
    });

    if (iks.length > 0) {
      try {
        solverRef.current = new CCDIKSolver(skinnedMesh, iks);
      } catch (err) {
        console.warn('[IK] Error inicializando solver:', err);
      }
    }

    return () => {
      footTargets.forEach(target => target.removeFromParent());
      kneeTargets.forEach(target => target.removeFromParent());
      solverRef.current = null;
    };
  }, [skinnedMesh, isSitting, findLegBoneIndices, createTargets]);

  // Desactivar solver cuando deja de estar sentado
  useEffect(() => {
    if (!isSitting && solverRef.current) {
      solverRef.current = null;
    }
  }, [isSitting]);

  const updateTargets = useCallback(() => {
    if (!sitConfig || footTargetsRef.current.length === 0) return;

    const { seatPosition, seatRotation = 0, floorY = 0 } = sitConfig;

    // Pies en el suelo, separados simétricamente y ligeramente adelantados
    // (posición natural de piernas al estar sentado).
    const hipWidth = 0.16; // separación lateral de pies (metros)
    const forwardOffset = 0.3; // pies adelantados respecto al asiento (metros)
    const lateralDir = new THREE.Vector3(Math.cos(seatRotation), 0, -Math.sin(seatRotation));
    const forwardDir = new THREE.Vector3(Math.sin(seatRotation), 0, Math.cos(seatRotation));
    
    footTargetsRef.current.forEach((target, index) => {
      const side = index === 0 ? -1 : 1;
      const lateralOffset = lateralDir.clone().multiplyScalar(hipWidth * side);
      const forward = forwardDir.clone().multiplyScalar(forwardOffset);
      target.position.set(
        seatPosition.x + lateralOffset.x + forward.x,
        floorY, // pies siempre al nivel del suelo
        seatPosition.z + lateralOffset.z + forward.z
      );
    });

    // Rodillas adelantadas para guiar la flexión natural de la pierna
    kneeTargetsRef.current.forEach((target, index) => {
      const side = index === 0 ? -1 : 1;
      const lateralOffset = lateralDir.clone().multiplyScalar(hipWidth * side);
      const forward = forwardDir.clone().multiplyScalar(forwardOffset * 0.7);
      target.position.set(
        seatPosition.x + lateralOffset.x + forward.x,
        seatPosition.y * 0.42 + floorY, // a media altura entre asiento y suelo
        seatPosition.z + lateralOffset.z + forward.z
      );
    });
  }, [sitConfig]);

  const updateIK = useCallback((delta: number) => {
    if (!isSitting || !solverRef.current) return;

    updateTargets();
    solverRef.current.update(1.0);
  }, [isSitting, updateTargets]);

  return {
    updateIK,
    isIKReady: !!solverRef.current,
    legChains: legChainsRef.current,
  };
}

// Helper para encontrar SkinnedMesh
export function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let skinnedMesh: THREE.SkinnedMesh | null = null;
  
  root.traverse((child) => {
    if ((child as any).isSkinnedMesh && !skinnedMesh) {
      skinnedMesh = child as THREE.SkinnedMesh;
    }
  });
  
  return skinnedMesh;
}

// Helper para calcular posición de sentado
export function calculateSitPosition(
  chairPosition: THREE.Vector3,
  chairRotation: number,
  sitOffset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): THREE.Vector3 {
  const sitPos = chairPosition.clone();
  
  const offset = new THREE.Vector3(sitOffset.x, sitOffset.y, sitOffset.z);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), chairRotation);
  
  sitPos.add(offset);
  return sitPos;
}
