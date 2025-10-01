import { describe, it, expect } from "vitest";
import { createKeymapService, toHumanShortcut } from "../keymap/keymap.service";
import { ActionId } from "../types";

describe("KeymapService", () => {
  it("should resolve keyboard events to action IDs", () => {
    const keymap = createKeymapService({
      "C-z": ActionId.performUndo,
      "y": ActionId.lockX,
    });

    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
    });

    const id = keymap.resolve(event);
    expect(id).toBe(ActionId.performUndo);
  });

  it("should resolve simple keys without modifiers", () => {
    const keymap = createKeymapService({
      "y": ActionId.lockX,
    });

    const event = new KeyboardEvent("keydown", {
      key: "y",
    });

    const id = keymap.resolve(event);
    expect(id).toBe(ActionId.lockX);
  });

  it("should handle Cmd (metaKey) as Ctrl on macOS", () => {
    const keymap = createKeymapService({
      "C-z": ActionId.performUndo,
    });

    const event = new KeyboardEvent("keydown", {
      key: "z",
      metaKey: true,
    });

    const id = keymap.resolve(event);
    expect(id).toBe(ActionId.performUndo);
  });

  it("should handle Shift modifier", () => {
    const keymap = createKeymapService({
      "C-S-z": ActionId.performUndo,
    });

    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      shiftKey: true,
    });

    const id = keymap.resolve(event);
    expect(id).toBe(ActionId.performUndo);
  });

  it("should handle Alt modifier", () => {
    const keymap = createKeymapService({
      "A-y": ActionId.lockX,
    });

    const event = new KeyboardEvent("keydown", {
      key: "y",
      altKey: true,
    });

    const id = keymap.resolve(event);
    expect(id).toBe(ActionId.lockX);
  });

  it("should be case-insensitive for letter keys", () => {
    const keymap = createKeymapService({
      "C-z": ActionId.performUndo,
    });

    const eventLower = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
    });

    const eventUpper = new KeyboardEvent("keydown", {
      key: "Z",
      ctrlKey: true,
    });

    expect(keymap.resolve(eventLower)).toBe(ActionId.performUndo);
    expect(keymap.resolve(eventUpper)).toBe(ActionId.performUndo);
  });

  it("should return null for unmapped shortcuts", () => {
    const keymap = createKeymapService({
      "C-z": ActionId.performUndo,
    });

    const event = new KeyboardEvent("keydown", {
      key: "x",
      ctrlKey: true,
    });

    const id = keymap.resolve(event);
    expect(id).toBeNull();
  });

  it("should allow registering overrides", () => {
    const keymap = createKeymapService({
      "C-z": ActionId.performUndo,
    });

    keymap.registerOverride({ key: "z", ctrl: true }, ActionId.lockX);

    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
    });

    const id = keymap.resolve(event);
    expect(id).toBe(ActionId.lockX);
  });

  it("should list all bindings", () => {
    const keymap = createKeymapService({
      "C-z": ActionId.performUndo,
      "y": ActionId.lockX,
    });

    const bindings = keymap.listBindings();
    expect(bindings).toHaveLength(2);
    expect(bindings.map(b => b.id)).toContain(ActionId.performUndo);
    expect(bindings.map(b => b.id)).toContain(ActionId.lockX);
  });

  describe("toHumanShortcut", () => {
    it("should format simple key", () => {
      const result = toHumanShortcut({ key: "y" });
      expect(result).toBe("y");
    });

    it("should format Ctrl+key", () => {
      const result = toHumanShortcut({ key: "z", ctrl: true });
      expect(result).toBe("Ctrl/Cmd+z");
    });

    it("should format Ctrl+Shift+key", () => {
      const result = toHumanShortcut({ key: "z", ctrl: true, shift: true });
      expect(result).toBe("Ctrl/Cmd+Shift+z");
    });

    it("should format Alt+key", () => {
      const result = toHumanShortcut({ key: "y", alt: true });
      expect(result).toBe("Alt+y");
    });

    it("should format all modifiers", () => {
      const result = toHumanShortcut({ key: "k", ctrl: true, alt: true, shift: true });
      expect(result).toBe("Ctrl/Cmd+Alt+Shift+k");
    });
  });
});
