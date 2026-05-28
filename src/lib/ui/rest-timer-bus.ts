type Starter = (seconds: number, exerciseName: string) => void;
let starter: Starter | null = null;

export function registerRestTimer(fn: Starter) {
  starter = fn;
}

export function startRest(seconds: number, exerciseName: string) {
  if (starter) starter(seconds, exerciseName);
}
