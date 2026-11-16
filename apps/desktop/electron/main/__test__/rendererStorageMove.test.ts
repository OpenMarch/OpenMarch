import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, BrowserWindow: class {} }));
vi.mock("../appProtocol", () => ({
    APP_ORIGIN: "app://openmarch",
    APP_BLANK_URL: "app://openmarch/.openmarch-blank",
}));
const { moveRendererStorage } = await import("../rendererStorageMove");

/** Two origins' storage and the store's flag, in memory */
function fakeDeps(
    old: Record<string, string>,
    current: Record<string, string>,
) {
    let movedTo: unknown;
    const log = vi.fn();
    return {
        current,
        log,
        movedTo: () => movedTo,
        setMovedTo: (origin: string) => {
            movedTo = origin;
        },
        readOld: vi.fn(async () => ({ ...old })),
        writeMissing: vi.fn(async (entries: Record<string, string>) => {
            let written = 0;
            for (const [key, value] of Object.entries(entries))
                if (!(key in current)) {
                    current[key] = value;
                    written++;
                }
            return written;
        }),
    };
}

describe("moveRendererStorage", () => {
    it("copies the old keys the new origin doesn't have, once", async () => {
        const deps = fakeDeps(
            { theme: "dark", "openmarch:shortcuts": "{}" },
            { theme: "light" },
        );
        await moveRendererStorage(deps);
        expect(deps.current).toEqual({
            theme: "light",
            "openmarch:shortcuts": "{}",
        });
        expect(deps.movedTo()).toBe("app://openmarch");

        await moveRendererStorage(deps);
        expect(deps.readOld).toHaveBeenCalledTimes(1);
    });

    it("marks an empty old storage done without writing", async () => {
        const deps = fakeDeps({}, {});
        await moveRendererStorage(deps);
        expect(deps.writeMissing).not.toHaveBeenCalled();
        expect(deps.movedTo()).toBe("app://openmarch");
    });

    it("logs a failure, doesn't throw, and tries again next start", async () => {
        const deps = fakeDeps({ theme: "dark" }, {});
        deps.writeMissing.mockRejectedValueOnce(new Error("window crashed"));
        await expect(moveRendererStorage(deps)).resolves.toBeUndefined();
        expect(deps.movedTo()).toBeUndefined();
        expect(deps.log).toHaveBeenCalledWith(
            "renderer storage: couldn't move it",
            expect.any(Error),
        );

        await moveRendererStorage(deps);
        expect(deps.current).toEqual({ theme: "dark" });
    });
});
