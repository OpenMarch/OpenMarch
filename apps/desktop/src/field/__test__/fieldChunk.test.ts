// @vitest-environment node
/**
 * three.js stays out of the editor's first chunk: the field loads it lazily
 * (`App.tsx` imports `ThreeField` with `lazy`), so a machine without WebGL
 * never downloads it. Walks the static imports from the renderer's entry, as
 * the bundler does, and fails if any reaches three.js or React Three Fiber.
 * Dynamic `import()` and `import type` don't count.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const desktop = path.resolve(__dirname, "../../..");
const ENTRY = path.join(desktop, "src/main.tsx");
const THREE = /^(three|three\/.*|@react-three\/.*)$/;
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/** The modules a file imports statically (not `import type`, not `import()`). */
function staticImports(source: string): string[] {
    const found: string[] = [];
    const pattern =
        /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
    for (const match of source.matchAll(pattern)) found.push(match[1]);
    return found;
}

function resolveLocal(from: string, specifier: string): string | null {
    let base: string;
    if (specifier.startsWith("@/"))
        base = path.join(desktop, "src", specifier.slice(2));
    else if (specifier.startsWith("@om-electron/"))
        base = path.join(desktop, "electron", specifier.slice(13));
    else if (specifier.startsWith("."))
        base = path.resolve(path.dirname(from), specifier);
    else return null;
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    for (const extension of EXTENSIONS)
        if (fs.existsSync(base + extension)) return base + extension;
    return null;
}

/** Every chain of static imports from the entry to three.js. */
function chainsToThree(): string[] {
    const seen = new Set<string>();
    const chains: string[] = [];
    const visit = (file: string, chain: string[]) => {
        if (seen.has(file)) return;
        seen.add(file);
        const here = [...chain, path.relative(desktop, file)];
        for (const specifier of staticImports(fs.readFileSync(file, "utf8"))) {
            if (THREE.test(specifier))
                chains.push([...here, specifier].join(" → "));
            const local = resolveLocal(file, specifier);
            if (local) visit(local, here);
        }
    };
    visit(ENTRY, []);
    return chains;
}

describe("the editor's first chunk", () => {
    it("reaches the new field only through its lazy import", () => {
        expect(chainsToThree()).toEqual([]);
    });

    it("would notice a static import of three.js", () => {
        expect(staticImports('import { Mesh } from "three";')).toEqual([
            "three",
        ]);
        expect(staticImports('import type { Mesh } from "three";')).toEqual([]);
        expect(
            staticImports('const ThreeField = lazy(() => import("three"));'),
        ).toEqual([]);
    });
});
