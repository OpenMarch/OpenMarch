import { describe, it, expect } from "vitest";
import { createActionRegistry } from "../registry";
import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../types";

describe("ActionRegistry", () => {
  it("should register and retrieve actions", () => {
    const registry = createActionRegistry();
    const meta: ActionMeta = {
      id: ActionId.performUndo,
      descKey: "test.undo",
      category: "edit",
    };
    const factory = () => ({
      execute: () => ({ ok: true as const }),
    });

    registry.register(meta, factory);

    expect(registry.getMeta(ActionId.performUndo)).toEqual(meta);
    expect(registry.getFactory(ActionId.performUndo)).toBe(factory);
  });

  it("should throw on duplicate registration", () => {
    const registry = createActionRegistry();
    const meta: ActionMeta = {
      id: ActionId.performUndo,
      descKey: "test.undo",
      category: "edit",
    };
    const factory = () => ({
      execute: () => ({ ok: true as const }),
    });

    registry.register(meta, factory);

    expect(() => {
      registry.register(meta, factory);
    }).toThrow("Duplicate action: performUndo");
  });

  it("should list all registered actions", () => {
    const registry = createActionRegistry();
    const meta1: ActionMeta = {
      id: ActionId.performUndo,
      descKey: "test.undo",
      category: "edit",
    };
    const meta2: ActionMeta = {
      id: ActionId.lockX,
      descKey: "test.lockX",
      category: "align",
    };

    registry.register(meta1, () => ({
      execute: () => ({ ok: true as const }),
    }));
    registry.register(meta2, () => ({
      execute: () => ({ ok: true as const }),
    }));

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContainEqual(meta1);
    expect(list).toContainEqual(meta2);
  });

  it("should return undefined for unregistered actions", () => {
    const registry = createActionRegistry();

    expect(registry.getMeta(ActionId.performUndo)).toBeUndefined();
    expect(registry.getFactory(ActionId.performUndo)).toBeUndefined();
  });
});
