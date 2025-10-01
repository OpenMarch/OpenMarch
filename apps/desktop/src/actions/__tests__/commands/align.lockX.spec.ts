import { describe, it, expect, vi } from "vitest";
import { createActionRegistry } from "../../registry";
import { registerToggleLockX } from "../../contrib/align.lockX";
import { ActionId, ActionContext } from "../../types";

describe("ToggleLockXCommand", () => {
  const createMockContext = (lockX: boolean): ActionContext => ({
    db: {},
    queryClient: {},
    fabric: {},
    selection: {
      constraints: { lockX },
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

  it("should be registered correctly", () => {
    const registry = createActionRegistry();
    registerToggleLockX(registry);

    const meta = registry.getMeta(ActionId.lockX);
    expect(meta).toBeDefined();
    expect(meta?.id).toBe(ActionId.lockX);
    expect(meta?.descKey).toBe("actions.alignment.lockX");
    expect(meta?.toggleOnKey).toBe("actions.alignment.lockXOn");
    expect(meta?.toggleOffKey).toBe("actions.alignment.lockXOff");
    expect(meta?.category).toBe("align");
    expect(meta?.shortcuts).toEqual([{ key: "y" }]);
  });

  it("should toggle lockX from false to true", () => {
    const registry = createActionRegistry();
    registerToggleLockX(registry);

    const ctx = createMockContext(false);
    const factory = registry.getFactory(ActionId.lockX);
    const command = factory!(undefined);

    expect(command.isToggled!(ctx)).toBe(false);

    const result = command.execute(ctx, undefined);
    expect(result.ok).toBe(true);
    expect(ctx.selection.setConstraints).toHaveBeenCalledWith({ lockX: true });
  });

  it("should toggle lockX from true to false", () => {
    const registry = createActionRegistry();
    registerToggleLockX(registry);

    const ctx = createMockContext(true);
    const factory = registry.getFactory(ActionId.lockX);
    const command = factory!(undefined);

    expect(command.isToggled!(ctx)).toBe(true);

    const result = command.execute(ctx, undefined);
    expect(result.ok).toBe(true);
    expect(ctx.selection.setConstraints).toHaveBeenCalledWith({ lockX: false });
  });

  it("should provide an inverse command", () => {
    const registry = createActionRegistry();
    registerToggleLockX(registry);

    const ctx = createMockContext(false);
    const factory = registry.getFactory(ActionId.lockX);
    const command = factory!(undefined);

    const inverse = command.getInverse!(ctx, undefined);
    expect(inverse).toBeDefined();

    // Execute original command
    command.execute(ctx, undefined);
    expect(ctx.selection.setConstraints).toHaveBeenCalledWith({ lockX: true });

    // Execute inverse
    const inverseResult = inverse.execute(ctx, undefined);
    expect(inverseResult.ok).toBe(true);
    expect(ctx.selection.setConstraints).toHaveBeenCalledWith({ lockX: false });
  });

  it("should be idempotent when toggled multiple times", () => {
    const registry = createActionRegistry();
    registerToggleLockX(registry);

    const ctx = createMockContext(false);
    const factory = registry.getFactory(ActionId.lockX);
    
    // Toggle once
    const command1 = factory!(undefined);
    command1.execute(ctx, undefined);
    expect(ctx.selection.setConstraints).toHaveBeenCalledWith({ lockX: true });

    // Update context to reflect the change
    ctx.selection.constraints.lockX = true;

    // Toggle again
    const command2 = factory!(undefined);
    command2.execute(ctx, undefined);
    expect(ctx.selection.setConstraints).toHaveBeenCalledWith({ lockX: false });
  });
});
