import { useState, useCallback } from "react";

/**
 * useStepWizard — shared 3-phase step controller for service pages.
 *
 * Steps:
 *   1 = Source Setup
 *   2 = ROI Drawing
 *   3 = Live Inference
 */
export function useStepWizard(initialStep = 1) {
  const [step, setStep] = useState(initialStep);

  const goTo = useCallback((n) => setStep(n), []);
  const next = useCallback(() => setStep((s) => Math.min(s + 1, 3)), []);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 1)), []);
  const reset = useCallback(() => setStep(1), []);

  return { step, goTo, next, prev, reset };
}
