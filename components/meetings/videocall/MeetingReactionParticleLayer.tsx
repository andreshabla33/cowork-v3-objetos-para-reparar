import React from 'react';

interface MeetingReactionItem {
  id: string;
  emoji: string;
  by: string;
}

interface ParticleConfig {
  id: string;
  xVw: number;
  yVh: number;
  rotate: number;
  scale: number;
  delay: number;
  duration: number;
  size: number;
}

type ReactionEmitterOrigin = 'bottom' | 'left' | 'right' | 'corner-bottom-left' | 'corner-bottom-right';
type ReactionTrajectory = 'burst' | 'confetti-diagonal-up-right' | 'confetti-diagonal-up-left';

interface ReactionAnchor {
  origin: ReactionEmitterOrigin;
  trajectory: ReactionTrajectory;
  left: number;
  top: number;
}

type ReactionMotionPreset = 'angry' | 'soft' | 'playful' | 'love' | 'sparkle' | 'base';

interface ReactionBurstProfile {
  count: number;
  spread: number;
  lift: number;
  shellClassName: string;
  labelClassName: string;
  particleAnimation: string;
  burstAnimation: string;
  motionPreset: ReactionMotionPreset;
}

interface MeetingReactionParticleLayerProps {
  reactions: MeetingReactionItem[];
}

const hashSeed = (value: string) => value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

const getReactionBurstProfile = (emoji: string): ReactionBurstProfile => {
  switch (emoji) {
    case '😡':
      return {
        count: 16,
        spread: 1.65,
        lift: 182,
        shellClassName: 'rounded-full border border-red-400/30 bg-red-500/14 px-4 py-2 text-5xl shadow-2xl backdrop-blur-md',
        labelClassName: 'max-w-[220px] rounded-full border border-red-400/20 bg-black/72 px-3 py-1.5 text-center text-xs font-semibold text-red-100 shadow-lg backdrop-blur-md',
        particleAnimation: 'meetingReactionParticleSharp 1.4s ease-out forwards',
        burstAnimation: 'meetingReactionBurstAggressive 2.2s ease-out forwards',
        motionPreset: 'angry',
      };
    case '😢':
      return {
        count: 14,
        spread: 1.25,
        lift: 150,
        shellClassName: 'rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-5xl shadow-2xl backdrop-blur-md',
        labelClassName: 'max-w-[220px] rounded-full border border-sky-400/20 bg-black/72 px-3 py-1.5 text-center text-xs font-semibold text-sky-100 shadow-lg backdrop-blur-md',
        particleAnimation: 'meetingReactionParticleSoft 2s ease-out forwards',
        burstAnimation: 'meetingReactionBurstSoft 3s ease-out forwards',
        motionPreset: 'soft',
      };
    case '😂':
    case '😮':
      return {
        count: 18,
        spread: 1.85,
        lift: 190,
        shellClassName: 'rounded-full border border-amber-300/20 bg-white/10 px-4 py-2 text-5xl shadow-2xl backdrop-blur-md',
        labelClassName: 'max-w-[220px] rounded-full border border-[rgba(46,150,245,0.14)] bg-[#0B2240]/70 px-3 py-1.5 text-center text-xs font-semibold text-white/95 shadow-lg backdrop-blur-md',
        particleAnimation: 'meetingReactionParticlePlayful 1.8s ease-out forwards',
        burstAnimation: 'meetingReactionBurstPlayful 2.6s ease-out forwards',
        motionPreset: 'playful',
      };
    case '❤️':
      return {
        count: 16,
        spread: 1.5,
        lift: 176,
        shellClassName: 'rounded-full border border-pink-300/20 bg-pink-500/10 px-4 py-2 text-5xl shadow-2xl backdrop-blur-md',
        labelClassName: 'max-w-[220px] rounded-full border border-pink-300/20 bg-black/72 px-3 py-1.5 text-center text-xs font-semibold text-pink-100 shadow-lg backdrop-blur-md',
        particleAnimation: 'meetingReactionParticleSoft 1.9s ease-out forwards',
        burstAnimation: 'meetingReactionBurstSoft 2.9s ease-out forwards',
        motionPreset: 'love',
      };
    case '✨':
      return {
        count: 15,
        spread: 1.25,
        lift: 188,
        shellClassName: 'rounded-full border border-[rgba(46,150,245,0.14)] bg-[rgba(46,150,245,0.08)] px-4 py-2 text-5xl shadow-2xl backdrop-blur-md',
        labelClassName: 'max-w-[220px] rounded-full border border-[rgba(46,150,245,0.14)] bg-[#0B2240]/70 px-3 py-1.5 text-center text-xs font-semibold text-white shadow-lg backdrop-blur-md',
        particleAnimation: 'meetingReactionParticleSoft 1.9s ease-out forwards',
        burstAnimation: 'meetingReactionBurstSoft 2.9s ease-out forwards',
        motionPreset: 'sparkle',
      };
    default:
      return {
        count: 14,
        spread: 1.45,
        lift: 168,
        shellClassName: 'rounded-full border border-[rgba(46,150,245,0.14)] bg-white/50 px-4 py-2 text-5xl shadow-2xl backdrop-blur-md',
        labelClassName: 'max-w-[220px] rounded-full border border-[rgba(46,150,245,0.14)] bg-[#0B2240]/70 px-3 py-1.5 text-center text-xs font-semibold text-white/95 shadow-lg backdrop-blur-md',
        particleAnimation: 'meetingReactionParticle 1.8s ease-out forwards',
        burstAnimation: 'meetingReactionBurst 2.8s ease-out forwards',
        motionPreset: 'base',
      };
  }
};

const getReactionMotionSignature = (preset: ReactionMotionPreset) => {
  switch (preset) {
    case 'angry':
      return {
        rotationRange: 130,
        delayStep: 0.022,
        durationBase: 1.35,
        durationVariance: 0.7,
        scaleBase: 0.78,
        scaleVariance: 0.42,
        swayMultiplier: 0.9,
        diagonalMultiplier: 1.35,
        verticalMultiplier: 1.22,
        cornerMultiplier: 1.4,
      };
    case 'soft':
      return {
        rotationRange: 20,
        delayStep: 0.045,
        durationBase: 2.2,
        durationVariance: 0.8,
        scaleBase: 0.76,
        scaleVariance: 0.34,
        swayMultiplier: 0.48,
        diagonalMultiplier: 0.7,
        verticalMultiplier: 1.08,
        cornerMultiplier: 0.85,
      };
    case 'playful':
      return {
        rotationRange: 110,
        delayStep: 0.028,
        durationBase: 1.8,
        durationVariance: 1,
        scaleBase: 0.74,
        scaleVariance: 0.58,
        swayMultiplier: 1.35,
        diagonalMultiplier: 1.28,
        verticalMultiplier: 1.04,
        cornerMultiplier: 1.12,
      };
    case 'love':
      return {
        rotationRange: 16,
        delayStep: 0.05,
        durationBase: 2.45,
        durationVariance: 0.85,
        scaleBase: 0.82,
        scaleVariance: 0.4,
        swayMultiplier: 0.42,
        diagonalMultiplier: 0.62,
        verticalMultiplier: 1.16,
        cornerMultiplier: 0.78,
      };
    case 'sparkle':
      return {
        rotationRange: 24,
        delayStep: 0.048,
        durationBase: 2.55,
        durationVariance: 0.7,
        scaleBase: 0.72,
        scaleVariance: 0.28,
        swayMultiplier: 0.34,
        diagonalMultiplier: 0.52,
        verticalMultiplier: 1.32,
        cornerMultiplier: 0.74,
      };
    default:
      return {
        rotationRange: 60,
        delayStep: 0.035,
        durationBase: 2,
        durationVariance: 0.8,
        scaleBase: 0.7,
        scaleVariance: 0.55,
        swayMultiplier: 1,
        diagonalMultiplier: 1,
        verticalMultiplier: 1,
        cornerMultiplier: 1,
      };
  }
};

const getBurstAnimation = (profile: ReactionBurstProfile, anchor: ReactionAnchor) => (
  anchor.trajectory === 'burst'
    ? profile.motionPreset === 'love'
      ? 'meetingReactionBurstFloat 3.2s ease-out forwards'
      : profile.motionPreset === 'sparkle'
        ? 'meetingReactionBurstSparkle 3s ease-out forwards'
        : profile.burstAnimation
    : 'meetingReactionBurstConfetti 2.6s ease-out forwards'
);

const getParticleAnimation = (profile: ReactionBurstProfile, anchor: ReactionAnchor) => (
  anchor.trajectory === 'burst'
    ? profile.motionPreset === 'love'
      ? 'meetingReactionParticleFloat 2.8s ease-out forwards'
      : profile.motionPreset === 'sparkle'
        ? 'meetingReactionParticleSparkle 2.6s ease-out forwards'
        : profile.particleAnimation
    : 'meetingReactionParticleConfetti 2.4s ease-out forwards'
);

const buildParticles = (reactionId: string, emoji: string, anchor: ReactionAnchor): ParticleConfig[] => {
  const seed = hashSeed(reactionId);
  const profile = getReactionBurstProfile(emoji);
  const motion = getReactionMotionSignature(profile.motionPreset);
  return Array.from({ length: profile.count }, (_, index) => {
    const rawAngle = ((seed + index * 47) % 360) * (Math.PI / 180);
    const horizontalDrift = 8 + (((seed + index * 29) % 36) / 10);
    const verticalLift = (18 + (((seed + index * 31) % 28) / 10)) * profile.spread;
    const sideLift = (4 + (((seed + index * 37) % 18) / 10)) * profile.spread;
    const sway = Math.sin(rawAngle) * (6 + (((seed + index * 17) % 20) / 10));
    const lateralWave = sway * motion.swayMultiplier;

    let xVw = 0;
    let yVh = 0;

    if (anchor.trajectory === 'confetti-diagonal-up-right') {
      xVw = (10 + horizontalDrift + Math.abs(Math.cos(rawAngle)) * 18) * motion.diagonalMultiplier + lateralWave * 0.6;
      yVh = -1 * (10 + verticalLift * 0.9 * motion.verticalMultiplier + Math.abs(Math.sin(rawAngle)) * 5);
    } else if (anchor.trajectory === 'confetti-diagonal-up-left') {
      xVw = -1 * ((10 + horizontalDrift + Math.abs(Math.cos(rawAngle)) * 18) * motion.diagonalMultiplier - lateralWave * 0.6);
      yVh = -1 * (10 + verticalLift * 0.9 * motion.verticalMultiplier + Math.abs(Math.sin(rawAngle)) * 5);
    } else if (anchor.origin === 'corner-bottom-left') {
      xVw = (8 + horizontalDrift + Math.abs(Math.cos(rawAngle)) * 15) * motion.cornerMultiplier;
      yVh = -1 * (8 + verticalLift * 0.85 * motion.verticalMultiplier) + lateralWave * 0.35;
    } else if (anchor.origin === 'corner-bottom-right') {
      xVw = -1 * ((8 + horizontalDrift + Math.abs(Math.cos(rawAngle)) * 15) * motion.cornerMultiplier);
      yVh = -1 * (8 + verticalLift * 0.85 * motion.verticalMultiplier) + lateralWave * 0.35;
    } else if (anchor.origin === 'left') {
      xVw = (16 + horizontalDrift + Math.abs(Math.cos(rawAngle)) * 16) * motion.diagonalMultiplier;
      yVh = lateralWave - sideLift * motion.verticalMultiplier;
    } else if (anchor.origin === 'right') {
      xVw = -1 * ((16 + horizontalDrift + Math.abs(Math.cos(rawAngle)) * 16) * motion.diagonalMultiplier);
      yVh = lateralWave - sideLift * motion.verticalMultiplier;
    } else {
      xVw = Math.cos(rawAngle) * (10 + (((seed + index * 13) % 26) / 10)) * profile.spread * Math.max(0.55, motion.diagonalMultiplier) + lateralWave * 0.18;
      yVh = -1 * verticalLift * motion.verticalMultiplier;
    }

    return {
      id: `${reactionId}-${index}`,
      xVw,
      yVh,
      rotate: anchor.trajectory === 'burst'
        ? ((seed + index * 19) % motion.rotationRange) - motion.rotationRange / 2
        : ((seed + index * 23) % (motion.rotationRange + 24)) - (motion.rotationRange + 24) / 2,
      scale: motion.scaleBase + (((seed + index * 13) % Math.max(1, Math.round(motion.scaleVariance * 100))) / 100),
      delay: index * motion.delayStep,
      duration: motion.durationBase + (((seed + index * 17) % Math.max(1, Math.round(motion.durationVariance * 10))) / 10),
      size: 1.1 + (((seed + index * 11) % 16) / 10),
    };
  });
};

const getReactionAnchor = (reactionId: string, index: number, emoji: string): ReactionAnchor => {
  const seed = hashSeed(`${reactionId}-${index}`);
  const profile = getReactionBurstProfile(emoji);
  const originSelector = (seed + index * 7) % 7;

  if (profile.motionPreset === 'sparkle') {
    return {
      origin: 'bottom',
      trajectory: 'burst',
      left: 18 + ((seed + index * 19) % 64),
      top: 82 + ((seed + index * 13) % 8),
    };
  }

  if (profile.motionPreset === 'love') {
    if (originSelector % 3 === 0) {
      return {
        origin: 'corner-bottom-left',
        trajectory: 'burst',
        left: 5 + ((seed + index * 11) % 7),
        top: 85 + ((seed + index * 9) % 7),
      };
    }

    if (originSelector % 3 === 1) {
      return {
        origin: 'corner-bottom-right',
        trajectory: 'burst',
        left: 88 + ((seed + index * 15) % 7),
        top: 85 + ((seed + index * 7) % 7),
      };
    }

    return {
      origin: 'bottom',
      trajectory: 'burst',
      left: 24 + ((seed + index * 17) % 52),
      top: 82 + ((seed + index * 5) % 8),
    };
  }

  if (profile.motionPreset === 'angry') {
    if (originSelector % 2 === 0) {
      return {
        origin: 'corner-bottom-left',
        trajectory: 'burst',
        left: 4 + ((seed + index * 13) % 8),
        top: 84 + ((seed + index * 9) % 7),
      };
    }

    return {
      origin: 'corner-bottom-right',
      trajectory: 'burst',
      left: 88 + ((seed + index * 17) % 8),
      top: 84 + ((seed + index * 11) % 7),
    };
  }

  if (profile.motionPreset === 'playful') {
    if (originSelector === 0) {
      return {
        origin: 'corner-bottom-left',
        trajectory: 'confetti-diagonal-up-right',
        left: 3 + ((seed + index * 11) % 6),
        top: 86 + ((seed + index * 7) % 8),
      };
    }

    if (originSelector === 1) {
      return {
        origin: 'corner-bottom-right',
        trajectory: 'confetti-diagonal-up-left',
        left: 91 + ((seed + index * 13) % 6),
        top: 86 + ((seed + index * 5) % 8),
      };
    }

    if (originSelector === 2) {
      return {
        origin: 'left',
        trajectory: 'burst',
        left: 4 + ((seed + index * 17) % 6),
        top: 18 + ((seed + index * 13) % 56),
      };
    }

    return {
      origin: 'right',
      trajectory: 'burst',
      left: 90 + ((seed + index * 19) % 6),
      top: 18 + ((seed + index * 11) % 56),
    };
  }

  if (originSelector === 0) {
    return {
      origin: 'left',
      trajectory: 'burst',
      left: 4 + ((seed + index * 17) % 6),
      top: 18 + ((seed + index * 13) % 56),
    };
  }

  if (originSelector === 1) {
    return {
      origin: 'right',
      trajectory: 'burst',
      left: 90 + ((seed + index * 19) % 6),
      top: 18 + ((seed + index * 11) % 56),
    };
  }

  if (originSelector === 2) {
    return {
      origin: 'corner-bottom-left',
      trajectory: 'burst',
      left: 4 + ((seed + index * 23) % 7),
      top: 84 + ((seed + index * 9) % 8),
    };
  }

  if (originSelector === 3) {
    return {
      origin: 'corner-bottom-right',
      trajectory: 'burst',
      left: 89 + ((seed + index * 21) % 7),
      top: 84 + ((seed + index * 15) % 8),
    };
  }

  if (originSelector === 4) {
    return {
      origin: 'corner-bottom-left',
      trajectory: 'confetti-diagonal-up-right',
      left: 3 + ((seed + index * 11) % 6),
      top: 86 + ((seed + index * 7) % 8),
    };
  }

  if (originSelector === 5) {
    return {
      origin: 'corner-bottom-right',
      trajectory: 'confetti-diagonal-up-left',
      left: 91 + ((seed + index * 13) % 6),
      top: 86 + ((seed + index * 5) % 8),
    };
  }

  return {
    origin: 'bottom',
    trajectory: 'burst',
    left: 6 + ((seed + index * 31) % 88),
    top: 80 + ((seed + index * 17) % 12),
  };
};

export const MeetingReactionParticleLayer: React.FC<MeetingReactionParticleLayerProps> = ({ reactions }) => {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[300] overflow-hidden">
        {reactions.map((reaction, index) => {
          const profile = getReactionBurstProfile(reaction.emoji);
          const anchor = getReactionAnchor(reaction.id, index, reaction.emoji);
          const particles = buildParticles(reaction.id, reaction.emoji, anchor);
          return (
            <div
              key={reaction.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${anchor.left}%`, top: `${anchor.top}%` }}
            >
              <div className="relative flex flex-col items-center gap-2" style={{ animation: getBurstAnimation(profile, anchor) }}>
                {particles.map((particle) => (
                  <span
                    key={particle.id}
                    className="absolute"
                    style={{ transform: `translate(${particle.xVw}vw, ${particle.yVh}vh)` }}
                  >
                    <span
                      className="block opacity-85"
                      style={{
                        animation: `${getParticleAnimation(profile, anchor).replace(/\d+(\.\d+)?s ease-out forwards/, `${particle.duration}s ease-out ${particle.delay}s forwards`)}`,
                        transform: `rotate(${particle.rotate}deg) scale(${particle.scale})`,
                        fontSize: `${particle.size}rem`,
                      }}
                    >
                      {reaction.emoji}
                    </span>
                  </span>
                ))}
                <div className={profile.shellClassName}>
                  {reaction.emoji}
                </div>
                <div className={profile.labelClassName}>
                  {reaction.by}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes meetingReactionBurst {
          0% { opacity: 0; transform: translateY(32px) scale(0.88); }
          18% { opacity: 1; transform: translateY(0) scale(1.04); }
          100% { opacity: 0; transform: translateY(-22vh) scale(0.84); }
        }
        @keyframes meetingReactionBurstSoft {
          0% { opacity: 0; transform: translateY(42px) scale(0.84); }
          20% { opacity: 1; transform: translateY(6px) scale(1); }
          100% { opacity: 0; transform: translateY(-18vh) scale(0.82); }
        }
        @keyframes meetingReactionBurstPlayful {
          0% { opacity: 0; transform: translateY(36px) scale(0.78) rotate(-6deg); }
          25% { opacity: 1; transform: translateY(-4px) scale(1.08) rotate(6deg); }
          100% { opacity: 0; transform: translateY(-24vh) scale(0.86) rotate(-4deg); }
        }
        @keyframes meetingReactionBurstAggressive {
          0% { opacity: 0; transform: translateY(30px) scale(0.88); }
          18% { opacity: 1; transform: translateY(-16px) scale(1.12); }
          100% { opacity: 0; transform: translateY(-26vh) scale(0.76); }
        }
        @keyframes meetingReactionBurstFloat {
          0% { opacity: 0; transform: translateY(30px) scale(0.84); }
          20% { opacity: 1; transform: translateY(2px) scale(1); }
          100% { opacity: 0; transform: translateY(-16vh) scale(0.88); }
        }
        @keyframes meetingReactionBurstSparkle {
          0% { opacity: 0; transform: translateY(22px) scale(0.82); }
          18% { opacity: 1; transform: translateY(-2px) scale(1.06); }
          100% { opacity: 0; transform: translateY(-20vh) scale(0.74); }
        }
        @keyframes meetingReactionBurstConfetti {
          0% { opacity: 0; transform: translateY(24px) scale(0.84) rotate(-4deg); }
          18% { opacity: 1; transform: translateY(0) scale(1.02) rotate(3deg); }
          100% { opacity: 0; transform: translateY(-18vh) scale(0.8) rotate(-6deg); }
        }
        @keyframes meetingReactionParticle {
          0% { opacity: 0; }
          15% { opacity: 0.95; }
          100% { opacity: 0; transform: translate(0, -22vh) scale(0.46); }
        }
        @keyframes meetingReactionParticleSoft {
          0% { opacity: 0; transform: translate(0, 8px) scale(0.9); }
          20% { opacity: 0.95; }
          100% { opacity: 0; transform: translate(0, -20vh) scale(0.5); }
        }
        @keyframes meetingReactionParticlePlayful {
          0% { opacity: 0; transform: translate(0, 16px) scale(0.8) rotate(-8deg); }
          20% { opacity: 1; }
          50% { opacity: 0.95; transform: translate(1vw, -10vh) scale(0.9) rotate(10deg); }
          100% { opacity: 0; transform: translate(-1vw, -24vh) scale(0.48) rotate(-10deg); }
        }
        @keyframes meetingReactionParticleSharp {
          0% { opacity: 0; transform: translate(0, 12px) scale(1); }
          12% { opacity: 1; }
          100% { opacity: 0; transform: translate(0, -26vh) scale(0.38); }
        }
        @keyframes meetingReactionParticleFloat {
          0% { opacity: 0; transform: translate(0, 10px) scale(0.92); }
          18% { opacity: 1; }
          55% { opacity: 0.95; transform: translate(0.6vw, -8vh) scale(0.96); }
          100% { opacity: 0; transform: translate(-0.4vw, -18vh) scale(0.62); }
        }
        @keyframes meetingReactionParticleSparkle {
          0% { opacity: 0; transform: translate(0, 8px) scale(0.84) rotate(-6deg); }
          18% { opacity: 1; }
          52% { opacity: 0.98; transform: translate(0.2vw, -10vh) scale(0.88) rotate(8deg); }
          100% { opacity: 0; transform: translate(-0.2vw, -24vh) scale(0.36) rotate(-10deg); }
        }
        @keyframes meetingReactionParticleConfetti {
          0% { opacity: 0; transform: translate(0, 12px) scale(0.9) rotate(-12deg); }
          16% { opacity: 1; }
          48% { opacity: 0.95; transform: translate(1.4vw, -8vh) scale(0.92) rotate(14deg); }
          100% { opacity: 0; transform: translate(-0.8vw, -22vh) scale(0.42) rotate(-20deg); }
        }
      `}</style>
    </>
  );
};

export default MeetingReactionParticleLayer;
