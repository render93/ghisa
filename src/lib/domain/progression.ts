import {
  WAVE_PATTERN,
  type Exercise,
  type Prescription,
  type Settings
} from './types';

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function nextPrescription(ex: Exercise, settings: Settings): Prescription {
  if (ex.scheme === 'wave') {
    const week = ex.waveCurrentWeek ?? 1;
    const cycle = ex.waveCurrentCycle ?? 1;
    const pattern = WAVE_PATTERN[week - 1];
    const cycleMult = Math.pow(1 + settings.waveCycleIncrementPct / 100, cycle - 1);
    const baseLoad = (ex.waveBaseLoad ?? 0) * cycleMult;
    if (ex.pendingDeload) {
      return {
        sets: Math.max(1, Math.round(pattern.sets * settings.deloadSetsMult)),
        reps: Math.max(1, Math.round(pattern.reps * settings.deloadRepsMult)),
        load: roundTo(baseLoad * pattern.mult * (settings.deloadLoadPct / 100), settings.plateRounding),
        week,
        cycle,
        isDeload: true
      };
    }
    return {
      sets: pattern.sets,
      reps: pattern.reps,
      load: roundTo(baseLoad * pattern.mult, settings.plateRounding),
      week,
      cycle,
      isDeload: false
    };
  }
  // linear
  return {
    sets: ex.linearTargetSets ?? 0,
    reps: ex.linearTargetReps ?? 0,
    load: ex.linearCurrentLoad ?? 0,
    consecutiveFails: ex.linearConsecutiveFailures ?? 0
  };
}
