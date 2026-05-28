import type { Entry, Exercise } from '$lib/domain/types';

export type DraftEntry = {
  exerciseId: string;
  prescribed: Entry['prescribed'];
  sets: Entry['actualSets'];
};

export type WorkoutDraft = {
  schedaId: string;
  dayId: string;
  date: string;
  exercises: DraftEntry[];
  currentExIdx: number;
};

function createWorkoutDraftStore() {
  const state = $state<{
    draft: WorkoutDraft | null;
    summaryChoices: Record<string, 'repeat' | null>;
  }>({
    draft: null,
    summaryChoices: {}
  });

  function start(
    schedaId: string,
    dayId: string,
    exercises: Exercise[],
    prescriptionForEx: (ex: Exercise) => Entry['prescribed']
  ) {
    state.draft = {
      schedaId,
      dayId,
      date: new Date().toISOString(),
      exercises: exercises.map((ex) => {
        const presc = prescriptionForEx(ex);
        return {
          exerciseId: ex.id,
          prescribed: presc,
          sets: Array.from({ length: presc.sets }, () => ({
            status: null as null,
            reps: presc.reps,
            load: presc.load
          }))
        };
      }),
      currentExIdx: 0
    };
    state.summaryChoices = {};
  }

  function setSet(exIdx: number, setIdx: number, patch: Partial<Entry['actualSets'][number]>) {
    if (!state.draft) return;
    const entry = state.draft.exercises[exIdx];
    entry.sets[setIdx] = { ...entry.sets[setIdx], ...patch };
  }

  function nextExercise() {
    if (!state.draft) return;
    if (state.draft.currentExIdx < state.draft.exercises.length - 1) {
      state.draft.currentExIdx++;
    }
  }

  function prevExercise() {
    if (!state.draft) return;
    if (state.draft.currentExIdx > 0) {
      state.draft.currentExIdx--;
    }
  }

  function setSummaryChoice(exerciseId: string, action: 'repeat' | null) {
    state.summaryChoices[exerciseId] = action;
  }

  function cancel() {
    state.draft = null;
    state.summaryChoices = {};
  }

  return {
    get draft() {
      return state.draft;
    },
    get summaryChoices() {
      return state.summaryChoices;
    },
    start,
    setSet,
    nextExercise,
    prevExercise,
    setSummaryChoice,
    cancel
  };
}

export const workoutDraftStore = createWorkoutDraftStore();
