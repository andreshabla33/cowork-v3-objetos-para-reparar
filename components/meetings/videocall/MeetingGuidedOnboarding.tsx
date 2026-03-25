import React from 'react';
import { driver, type Config, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../../../styles/driver-tour.css';
import { GuidedOnboardingService } from '@/modules/realtime-room';

interface MeetingGuidedOnboardingProps {
  userId: string;
  showRecordingStep: boolean;
}

export const MeetingGuidedOnboarding: React.FC<MeetingGuidedOnboardingProps> = ({
  userId,
  showRecordingStep,
}) => {
  const guidedOnboardingService = React.useMemo(() => new GuidedOnboardingService(), []);
  const steps = React.useMemo(
    () => guidedOnboardingService.buildMeetingSteps({ showRecordingStep }),
    [guidedOnboardingService, showRecordingStep],
  );
  const [shouldStart, setShouldStart] = React.useState(false);
  const tourStartedRef = React.useRef(false);
  const driverRef = React.useRef<ReturnType<typeof driver> | null>(null);
  const resolutionRef = React.useRef<'dismissed' | 'completed' | 'cleanup' | null>(null);

  React.useEffect(() => {
    if (!userId || steps.length === 0) {
      setShouldStart(false);
      return;
    }
    setShouldStart(guidedOnboardingService.shouldShowMeetingOnboarding(userId));
  }, [guidedOnboardingService, steps.length, userId]);

  React.useEffect(() => {
    if (!shouldStart || !userId || steps.length === 0 || tourStartedRef.current) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 20;

    const tryStartTour = () => {
      attempts += 1;

      const availableSteps: DriveStep[] = steps
        .filter((step) => step.selector && document.querySelector(step.selector))
        .map((step) => ({
          element: step.selector,
          popover: {
            title: step.title,
            description: step.focusLabel
              ? `${step.description}\n\nEnfoque: ${step.focusLabel}`
              : step.description,
            side: step.side ?? 'bottom',
            align: step.align ?? 'center',
          },
        }));

      if (availableSteps.length === 0) {
        if (attempts < maxAttempts) {
          window.setTimeout(tryStartTour, 400);
        }
        return;
      }

      tourStartedRef.current = true;
      resolutionRef.current = null;

      const markDismissed = () => {
        if (resolutionRef.current) {
          return;
        }
        resolutionRef.current = 'dismissed';
        guidedOnboardingService.dismissMeetingOnboarding(userId);
        setShouldStart(false);
      };

      const markCompleted = () => {
        if (resolutionRef.current) {
          return;
        }
        resolutionRef.current = 'completed';
        guidedOnboardingService.completeMeetingOnboarding(userId);
        setShouldStart(false);
      };

      const tourConfig: Config = {
        showProgress: true,
        showButtons: ['next', 'previous', 'close'],
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Listo! ✓',
        progressText: '{{current}} de {{total}}',
        allowClose: true,
        stagePadding: 8,
        stageRadius: 14,
        animate: true,
        smoothScroll: true,
        allowKeyboardControl: true,
        steps: availableSteps,
        onCloseClick: () => {
          markDismissed();
          driverRef.current?.destroy();
        },
        onDestroyStarted: () => {
          if (!resolutionRef.current) {
            markDismissed();
          }
          driverRef.current?.destroy();
        },
        onNextClick: () => {
          const currentDriver = driverRef.current;
          if (!currentDriver) {
            return;
          }
          if (!currentDriver.hasNextStep()) {
            markCompleted();
            currentDriver.destroy();
            return;
          }
          currentDriver.moveNext();
        },
        onPrevClick: () => {
          driverRef.current?.movePrevious();
        },
      };

      driverRef.current = driver(tourConfig);
      driverRef.current.drive();
    };

    const initialTimer = window.setTimeout(tryStartTour, 1200);

    return () => {
      window.clearTimeout(initialTimer);
      if (driverRef.current) {
        resolutionRef.current = resolutionRef.current ?? 'cleanup';
        driverRef.current.destroy();
        driverRef.current = null;
      }
      if (resolutionRef.current === 'cleanup') {
        tourStartedRef.current = false;
      }
    };
  }, [guidedOnboardingService, shouldStart, steps, userId]);

  return null;
};

export default MeetingGuidedOnboarding;
