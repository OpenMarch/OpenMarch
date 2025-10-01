import { describe, it, expect, vi } from "vitest";
import { createActionRegistry } from "../../registry";
import { registerPerformUndo } from "../../contrib/edit.undo";
import { ActionId, ActionContext } from "../../types";

describe("PerformUndoCommand", () => {
  const createMockContext = (canUndo: boolean): ActionContext => ({
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
      canUndo: vi.fn().mockResolvedValue(canUndo),
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

  it("should execute undo when canExecute returns true", async () => {
    const registry = createActionRegistry();
    registerPerformUndo(registry);

    const ctx = createMockContext(true);
    const factory = registry.getFactory(ActionId.performUndo);
    const command = factory!(undefined);

    const canExecute = await command.canExecute!(ctx, undefined);
    expect(canExecute).toBe(true);

    const result = await command.execute(ctx, undefined);
    expect(result.ok).toBe(true);
    expect(ctx.history.undo).toHaveBeenCalledOnce();
  });

  it("should not execute when canExecute returns false", async () => {
    const registry = createActionRegistry();
    registerPerformUndo(registry);

    const ctx = createMockContext(false);
    const factory = registry.getFactory(ActionId.performUndo);
    const command = factory!(undefined);

    const canExecute = await command.canExecute!(ctx, undefined);
    expect(canExecute).toBe(false);
  });

  it("should return error result when undo fails", async () => {
    const registry = createActionRegistry();
    registerPerformUndo(registry);

    const ctx = createMockContext(true);
    const error = new Error("Undo failed");
    ctx.history.undo = vi.fn().mockRejectedValue(error);

    const factory = registry.getFactory(ActionId.performUndo);
    const command = factory!(undefined);

    const result = await command.execute(ctx, undefined);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);
  });
});
