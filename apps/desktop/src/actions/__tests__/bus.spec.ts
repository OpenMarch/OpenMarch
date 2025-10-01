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
    },
    history: {
      push: vi.fn(),
      undo: vi.fn(),
      canUndo: vi.fn().mockResolvedValue(true),
    },
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

  it("should push inverse to history when getInverse is defined", async () => {
    const registry = createActionRegistry();
    const ctx = createMockContext();
    const inverseCommand: ActionCommand = {
      execute: vi.fn().mockReturnValue({ ok: true }),
    };

    const meta: ActionMeta = {
      id: ActionId.lockX,
      descKey: "test.lockX",
      category: "align",
    };

    registry.register(meta, () => ({
      execute: vi.fn().mockReturnValue({ ok: true }),
      getInverse: vi.fn().mockResolvedValue(inverseCommand),
    }));

    const bus = createActionBus(registry, ctx);
    await bus.dispatch(ActionId.lockX, undefined);

    expect(ctx.history.push).toHaveBeenCalledWith(inverseCommand);
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
