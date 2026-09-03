import type { AppearanceSample, ColorIntent } from './schema';

export interface ColorObservation {
  readonly intent: ColorIntent;
  readonly appearance: AppearanceSample;
}

export function createColorObservation(
  intent: ColorIntent,
  appearance: AppearanceSample,
): ColorObservation {
  return Object.freeze({ intent, appearance });
}
