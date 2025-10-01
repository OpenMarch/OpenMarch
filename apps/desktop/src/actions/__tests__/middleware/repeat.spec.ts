import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRepeatController } from "../../middleware/repeat";
import { ActionId } from "../../types";

describe("createRepeatController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("should not start repeat for non-holdable actions", () => {
    const bus = { dispatch: vi.fn() };
    const holdable = new Set<ActionId>([]);
    const controller = createRepeatController(bus, holdable);

    controller.start(ActionId.performUndo);

    vi.advanceTimersByTime(1000);
    expect(bus.dispatch).not.toHaveBeenCalled();
  });

  it("should start repeating for holdable actions after initial delay", () => {
    const bus = { dispatch: vi.fn() };
    const holdable = new Set<ActionId>([ActionId.lockX]);
    const controller = createRepeatController(bus, holdable);

    controller.start(ActionId.lockX);

    // Initial delay (250ms)
    vi.advanceTimersByTime(250);
    expect(bus.dispatch).toHaveBeenCalledWith(ActionId.lockX, undefined);

    // Continue repeating at 33ms intervals
    vi.advanceTimersByTime(33);
    expect(bus.dispatch).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(33);
    expect(bus.dispatch).toHaveBeenCalledTimes(3);

    // Clean up
    controller.stop(ActionId.lockX);
  });

  it.skip("should stop repeating when stop is called", () => {
    const bus = { dispatch: vi.fn() };
    const holdable = new Set<ActionId>([ActionId.lockX]);
    const controller = createRepeatController(bus, holdable);

    controller.start(ActionId.lockX);
    vi.advanceTimersByTime(250);
    
    expect(bus.dispatch).toHaveBeenCalledTimes(1);

    controller.stop(ActionId.lockX);

    // Advance more time, should not trigger more dispatches
    vi.advanceTimersByTime(1000);
    expect(bus.dispatch).toHaveBeenCalledTimes(1);
  });

  it("should not start multiple timers for the same action", () => {
    const bus = { dispatch: vi.fn() };
    const holdable = new Set<ActionId>([ActionId.lockX]);
    const controller = createRepeatController(bus, holdable);

    controller.start(ActionId.lockX);
    controller.start(ActionId.lockX); // Try to start again

    vi.advanceTimersByTime(250);
    
    // Should only dispatch once, not twice
    expect(bus.dispatch).toHaveBeenCalledTimes(1);

    // Clean up
    controller.stop(ActionId.lockX);
  });

  it.skip("should handle stopping before initial delay completes", () => {
    const bus = { dispatch: vi.fn() };
    const holdable = new Set<ActionId>([ActionId.lockX]);
    const controller = createRepeatController(bus, holdable);

    controller.start(ActionId.lockX);
    
    // Stop before initial delay
    vi.advanceTimersByTime(100);
    controller.stop(ActionId.lockX);

    // Advance past initial delay
    vi.advanceTimersByTime(200);
    
    expect(bus.dispatch).not.toHaveBeenCalled();
  });
});
