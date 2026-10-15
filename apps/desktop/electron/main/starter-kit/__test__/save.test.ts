import path from "node:path";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
    app: { getAppPath: () => "/wrong/dist-electron/main", getPath: vi.fn() },
    BrowserWindow: { getFocusedWindow: vi.fn() },
    dialog: {},
    shell: {},
}));

const { starterKitDir } = await import("../save");

const original = process.env.DIST_ELECTRON;
afterEach(() => {
    process.env.DIST_ELECTRON = original;
});

describe("starterKitDir", () => {
    it("finds the kit beside dist-electron, not from the app path", () => {
        // as main sets it when launched as `electron dist-electron/main/index.js`
        process.env.DIST_ELECTRON = path.resolve(
            __dirname,
            "../../../../dist-electron/",
        );
        const dir = starterKitDir();
        expect(dir).toBe(path.resolve(__dirname, "../../../../starter-kit"));
        expect(existsSync(path.join(dir, "README.md"))).toBe(true);
    });
});
