import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** The desktop app's source folders. */
const ROOTS = ["src", "electron"].map((dir) =>
    resolve(__dirname, "../../..", dir),
);

function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === "node_modules") return [];
        const path = join(dir, entry.name);
        return entry.isDirectory() ? files(path) : [path];
    });
}

describe("source file names", () => {
    // macOS and Windows file systems ignore case by default, so
    // `Readout.tsx` next to `readout.ts` makes "./Readout" resolve to the
    // wrong file there (it broke 3D View on macOS).
    it("never differ only by letter case within a folder", () => {
        // Compare names without extensions, since imports leave them off.
        const seen = new Map<string, string>();
        const clashes: string[] = [];
        for (const root of ROOTS)
            for (const path of files(root)) {
                const stem = path.replace(/\.[^./]+$/, "");
                const other = seen.get(stem.toLowerCase());
                if (other === undefined) seen.set(stem.toLowerCase(), path);
                else if (other.replace(/\.[^./]+$/, "") !== stem)
                    clashes.push(
                        `${relative(root, other)} and ${relative(root, path)}`,
                    );
            }
        expect(clashes).toEqual([]);
    });
});
