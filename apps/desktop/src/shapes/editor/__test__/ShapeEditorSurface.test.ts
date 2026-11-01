// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The floating editor's fade (#426) in its stylesheet. The browser scenarios can't ask for reduced
 * transparency (Playwright can't emulate it), so the cascade that keeps it solid is checked here.
 */
// Read from disk: the test run stubs CSS imports to nothing
const css = fs.readFileSync(
    path.resolve(__dirname, "../ShapeEditorSurface.css"),
    "utf8",
);

describe("the floating editor's fade", () => {
    it("has no specificity, so reduced transparency always keeps the editor solid", () => {
        const fade = css.slice(0, css.indexOf("opacity: 0.4"));
        const rule = fade.slice(fade.lastIndexOf("@media (hover: hover)"));
        expect(rule).toMatch(/:where\(\s*\.shape-editor-surface/);
        const reduced = css.slice(
            css.indexOf("@media (prefers-reduced-transparency: reduce)"),
        );
        expect(reduced).toMatch(/\.shape-editor-surface[^{]*\{\s*opacity: 1;/);
    });

    it("waits 500 ms before fading and turns solid at once, also with less motion", () => {
        const fade = css.slice(css.indexOf("@media (hover: hover)"));
        expect(fade.slice(fade.indexOf("opacity: 0.4"))).toMatch(
            /^opacity: 0\.4;\s*transition-delay: 500ms;/,
        );
        // No shorthand on the solid state, which would outrank the faded state's delay
        const solid = css.slice(
            css.indexOf(".shape-editor-surface {"),
            css.indexOf("@media (hover: hover)"),
        );
        expect(solid).not.toMatch(/transition:|transition-delay/);
        const lessMotion = css.slice(
            css.indexOf("@media (prefers-reduced-motion: reduce)"),
        );
        expect(lessMotion).toMatch(/transition-duration: 0s;/);
        expect(lessMotion).not.toMatch(/transition:\s*none/);
    });

    it("counts keyboard focus only, not focus handed back after a click", () => {
        expect(css).toContain(":has(:focus-visible:not([data-click-focus]))");
        expect(css).not.toContain(":focus-within");
    });
});
