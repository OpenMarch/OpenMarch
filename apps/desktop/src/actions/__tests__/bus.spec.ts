import { describe, it, expect, vi } from "vitest";
import { createActionBus } from "../bus";
import { createActionRegistry } from "../registry";
import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../types";

describe("ActionBus", () => {
  const createMockContext = (): ActionContext => ({
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
      canUndo: false,
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
    toast: {},
  });

  it("should dispatch actions and call execute", async () => {
    const registry = createActionRegistry();
    const ctx = createMockContext();
    const executeSpy = vi.fn().mockReturnValue({ ok: true });

    const meta: ActionMeta = {
      id: ActionId.performUndo,
      descKey: "test.undo",
      category: "edit",
    };

    registry.register(meta, () => ({
      execute: executeSpy,
    }));

    const bus = createActionBus(registry, ctx);
    const result = await bus.dispatch(ActionId.performUndo, undefined);

    expect(result.ok).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith(ctx, undefined);
  });

  it("should check canExecute before executing", async () => {
    const registry = createActionRegistry();
    const ctx = createMockContext();
    const canExecuteSpy = vi.fn().mockResolvedValue(false);
    const executeSpy = vi.fn().mockReturnValue({ ok: true });

    const meta: ActionMeta = {
      id: ActionId.performUndo,
      descKey: "test.undo",
      category: "edit",
    };

    registry.register(meta, () => ({
      canExecute: canExecuteSpy,
      execute: executeSpy,
    }));

    const bus = createActionBus(registry, ctx);
    const result = await bus.dispatch(ActionId.performUndo, undefined);

    expect(result.ok).toBe(false);
    expect(canExecuteSpy).toHaveBeenCalledWith(ctx, undefined);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("should execute commands successfully", async () => {
    const registry = createActionRegistry();
    const ctx = createMockContext();
    const executeSpy = vi.fn().mockReturnValue({ ok: true });

    const meta: ActionMeta = {
      id: ActionId.lockX,
      descKey: "test.lockX",
      category: "align",
    };

    registry.register(meta, () => ({
      execute: executeSpy,
    }));

    const bus = createActionBus(registry, ctx);
    const result = await bus.dispatch(ActionId.lockX, undefined);

    expect(result.ok).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith(ctx, undefined);
  });

  it("should return error when action not registered", async () => {
    const registry = createActionRegistry();
    const ctx = createMockContext();
    const bus = createActionBus(registry, ctx);

    const result = await bus.dispatch(ActionId.performUndo, undefined);

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("should catch errors and return error result", async () => {
    const registry = createActionRegistry();
    const ctx = createMockContext();
    const error = new Error("Test error");

    const meta: ActionMeta = {
      id: ActionId.performUndo,
      descKey: "test.undo",
      category: "edit",
    };

    registry.register(meta, () => ({
      execute: vi.fn().mockRejectedValue(error),
    }));

    const bus = createActionBus(registry, ctx);
    const result = await bus.dispatch(ActionId.performUndo, undefined);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);
  });

  it("should apply middleware in correct order", async () => {
    const registry = createActionRegistry();
    const ctx = createMockContext();
    const calls: string[] = [];

    const meta: ActionMeta = {
      id: ActionId.performUndo,
      descKey: "test.undo",
      category: "edit",
    };

    registry.register(meta, () => ({
      execute: () => {
        calls.push("execute");
        return { ok: true };
      },
    }));

    const bus = createActionBus(registry, ctx);

    bus.addMiddleware((next) => async (id, payload, opts) => {
      calls.push("mw1-before");
      const result = await next(id, payload, opts);
      calls.push("mw1-after");
      return result;
    });

    bus.addMiddleware((next) => async (id, payload, opts) => {
      calls.push("mw2-before");
      const result = await next(id, payload, opts);
      calls.push("mw2-after");
      return result;
    });

    await bus.dispatch(ActionId.performUndo, undefined);

    expect(calls).toEqual([
      "mw1-before",
      "mw2-before",
      "execute",
      "mw2-after",
      "mw1-after",
    ]);
  });
});
