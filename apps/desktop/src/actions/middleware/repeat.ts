import { ActionId } from "../types";

type RepeatState = { 
  initialTimers: Map<string, number>;
  intervalTimers: Map<string, number>;
};
const REPEAT_INITIAL_DELAY = 250; // ms
const REPEAT_RATE = 33; // ~30Hz

export const createRepeatController = (bus: any, holdable: Set<ActionId>) => {
  const state: RepeatState = { 
    initialTimers: new Map(),
    intervalTimers: new Map(),
  };

  const start = (id: ActionId) => {
    if (!holdable.has(id) || state.initialTimers.has(id) || state.intervalTimers.has(id)) return;
    const timer = window.setTimeout(() => {
      state.initialTimers.delete(id);
      void bus.dispatch(id, undefined);
      const interval = window.setInterval(() => void bus.dispatch(id, undefined), REPEAT_RATE);
      state.intervalTimers.set(id, interval);
    }, REPEAT_INITIAL_DELAY);
    state.initialTimers.set(id, timer);
  };

  const stop = (id: ActionId) => {
    const initialTimer = state.initialTimers.get(id);
    if (typeof initialTimer === "number") {
      window.clearTimeout(initialTimer);
      state.initialTimers.delete(id);
    }
    const intervalTimer = state.intervalTimers.get(id);
    if (typeof intervalTimer === "number") {
      window.clearInterval(intervalTimer);
      state.intervalTimers.delete(id);
    }
  };

  return { start, stop };
};
