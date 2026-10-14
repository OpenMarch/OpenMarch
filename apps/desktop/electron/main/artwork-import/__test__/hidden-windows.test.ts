// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HiddenWindowRegistry } from "../hidden-windows";

class FakeWindow {
    destroyed = false;
    isDestroyed() {
        return this.destroyed;
    }
    destroy() {
        this.destroyed = true;
    }
}

describe("HiddenWindowRegistry", () => {
    it("destroys every live hidden window at once", () => {
        const registry = new HiddenWindowRegistry<FakeWindow>();
        const a = new FakeWindow();
        const b = new FakeWindow();
        const gone = new FakeWindow();
        registry.add(a);
        registry.add(b);
        registry.add(gone);
        gone.destroy();
        expect(registry.size).toBe(2);
        expect(registry.destroyAll()).toBe(2);
        expect(a.destroyed && b.destroyed).toBe(true);
        expect(registry.size).toBe(0);
        expect(registry.destroyAll()).toBe(0);
    });

    it("forgets a window on remove", () => {
        const registry = new HiddenWindowRegistry<FakeWindow>();
        const a = new FakeWindow();
        registry.add(a);
        registry.remove(a);
        expect(registry.has(a)).toBe(false);
        expect(registry.destroyAll()).toBe(0);
        expect(a.destroyed).toBe(false);
    });

    it("closes hidden windows only when no other window is left", () => {
        const registry = new HiddenWindowRegistry<FakeWindow>();
        const editor = new FakeWindow();
        const hidden = new FakeWindow();
        registry.add(hidden);

        expect(registry.closeIfOrphaned([editor, hidden])).toBe(0);
        expect(hidden.destroyed).toBe(false);

        editor.destroy();
        expect(registry.onlyHiddenRemain([editor, hidden])).toBe(true);
        expect(registry.closeIfOrphaned([editor, hidden])).toBe(1);
        expect(hidden.destroyed).toBe(true);
    });

    it("does nothing when there are no hidden windows", () => {
        const registry = new HiddenWindowRegistry<FakeWindow>();
        expect(registry.onlyHiddenRemain([])).toBe(false);
        expect(registry.closeIfOrphaned([])).toBe(0);
    });
});
