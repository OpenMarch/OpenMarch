import { describe, it, expect } from "vitest";
import { createActionRegistry } from "../registry";
import { registerAllActions } from "../../boot/registerActions";
import { defaultKeymap } from "../keymap/defaultKeymap";

describe("Shortcut Conflicts", () => {
  it("should have no duplicate shortcuts in default keymap", () => {
    const registry = createActionRegistry();
    registerAllActions(registry);

    // Check for duplicate shortcuts in default keymap
    const map = new Map<string, string[]>();
    for (const [chord, id] of Object.entries(defaultKeymap)) {
      const existing = map.get(chord) ?? [];
      existing.push(id);
      map.set(chord, existing);
    }

    const conflicts = [...map.entries()].filter(([, ids]) => ids.length > 1);
    if (conflicts.length) {
      const msg = conflicts.map(([chord, ids]) => `${chord} -> ${ids.join(", ")}`).join("\n");
      throw new Error(`Shortcut conflicts detected:\n${msg}`);
    }

    expect(conflicts).toHaveLength(0);
  });

  it("should have no duplicate shortcuts in action metadata", () => {
    const registry = createActionRegistry();
    registerAllActions(registry);

    const allMetas = registry.list();
    const map = new Map<string, string[]>();

    for (const meta of allMetas) {
      if (!meta.shortcuts) continue;

      for (const shortcut of meta.shortcuts) {
        const chord = [
          shortcut.ctrl ? "C-" : "",
          shortcut.alt ? "A-" : "",
          shortcut.shift ? "S-" : "",
          shortcut.key.toLowerCase(),
        ].join("");

        const existing = map.get(chord) ?? [];
        existing.push(meta.id);
        map.set(chord, existing);
      }
    }

    const conflicts = [...map.entries()].filter(([, ids]) => ids.length > 1);
    if (conflicts.length) {
      const msg = conflicts.map(([chord, ids]) => `${chord} -> ${ids.join(", ")}`).join("\n");
      throw new Error(`Shortcut conflicts in action metadata:\n${msg}`);
    }

    expect(conflicts).toHaveLength(0);
  });
});
