// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PREVIEW_COLORS } from "../steps/ThemeStep";

const css = readFileSync(
    resolve(__dirname, "../../../../../../packages/ui/src/tailwind.css"),
    "utf8",
);

/** A color token's value in the light (`@theme`) or `.dark` block. */
function token(theme: "light" | "dark", name: string): string | undefined {
    const darkStart = css.indexOf("\n.dark {");
    const block =
        theme === "light" ? css.slice(0, darkStart) : css.slice(darkStart);
    return block.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1].trim();
}

describe("theme step previews", () => {
    it.each(["light", "dark"] as const)(
        "use the %s theme's background, stroke and accent tokens",
        (theme) => {
            const colors = PREVIEW_COLORS[theme];
            expect(colors.bg).toBe(token(theme, "bg-1"));
            expect(colors.stroke).toBe(token(theme, "stroke"));
            expect(colors.accent).toBe(token(theme, "accent"));
        },
    );
});
