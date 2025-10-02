import { describe, it, expect, vi } from "vitest";
import { createActionRegistry } from "../../registry";
import { registerPerformUndo } from "../../contrib/edit/undo";
import { ActionId, ActionContext } from "../../types";

describe("PerformUndoCommand", () => {
  const createMockContext = (canUndo: boolean = true): ActionContext => ({
    db: {},
    queryClient: {},
    fabric: {},
    selection: {
      constraints: {},
      setConstraints: vi.fn(),
      selectedMarchers: [],
      setSelectedMarchers: vi.fn(),
      getSelectedMarcherPages: vi.fn(() => []),
    },
    page: {
      selected: null,
      setSelected: vi.fn(),
      all: [],
      getNext: vi.fn(),
      getPrevious: vi.fn(),
    },
    playback: {
      isPlaying: false,
      setIsPlaying: vi.fn(),
      toggleMetronome: vi.fn(),
    },
    ui: {
      settings: {},
      setSettings: vi.fn(),
    },
    queries: {
      marcherPages: {},
      previousMarcherPages: {},
      nextMarcherPages: {},
      fieldProperties: {},
      canUndo,
      canRedo: false,
    },
    mutations: {
      updateMarcherPages: vi.fn(),
      swapMarchers: vi.fn(),
      createMarcherShape: vi.fn(),
      performHistoryAction: vi.fn(),
    },
    alignment: {
      reset: vi.fn(),
      setEvent: vi.fn(),
      setMarchers: vi.fn(),
      newMarcherPages: [],
      marchers: [],
    },
    t: (key: string) => key,
    toast: {
      warning: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    },
  });

  it("should be registered correctly", () => {
    const registry = createActionRegistry();
    registerPerformUndo(registry);

    const meta = registry.getMeta(ActionId.performUndo);
    expect(meta).toBeDefined();
    expect(meta?.id).toBe(ActionId.performUndo);
    expect(meta?.descKey).toBe("actions.edit.undo");
    expect(meta?.category).toBe("edit");
    expect(meta?.shortcuts).toEqual([{ key: "z", ctrl: true }]);
  });

  it("should execute undo when canExecute returns true", () => {
    const registry = createActionRegistry();
    registerPerformUndo(registry);

    const ctx = createMockContext(true);
    const factory = registry.getFactory(ActionId.performUndo);
    const command = factory!(undefined);

    const canExecute = command.canExecute!(ctx, undefined);
    expect(canExecute).toBe(true);

    const result = command.execute(ctx, undefined);
    expect(result.ok).toBe(true);
    expect(ctx.mutations.performHistoryAction).toHaveBeenCalledWith("undo");
  });

  it("should not execute when canExecute returns false", () => {
    const registry = createActionRegistry();
    registerPerformUndo(registry);

    const ctx = createMockContext(false);
    const factory = registry.getFactory(ActionId.performUndo);
    const command = factory!(undefined);

    const canExecute = command.canExecute!(ctx, undefined);
    expect(canExecute).toBe(false);
    expect(ctx.toast.warning).toHaveBeenCalled();
  });

  it("should return error result when undo fails", () => {
    const registry = createActionRegistry();
    registerPerformUndo(registry);

    const ctx = createMockContext(true);
    const error = new Error("Undo failed");
    ctx.mutations.performHistoryAction = vi.fn().mockImplementation(() => {
      throw error;
    });

    const factory = registry.getFactory(ActionId.performUndo);
    const command = factory!(undefined);

    const result = command.execute(ctx, undefined);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);
  });
});
