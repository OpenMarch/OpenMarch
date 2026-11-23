import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import {
    RenameRetriesExhaustedError,
    fsyncDirectory,
    isSameFile,
    pendingDeleteCount,
    removeNowOrLater,
    settlePendingDeletes,
    renameWithRetry,
    publishFile,
    removeWithRetry,
    tempFilePattern,
} from "../atomicFile";

const errno = (code: string) =>
    Object.assign(new Error(`${code}: operation failed`), { code });

/** A clock and sleep that advance together, so retries take no real time. */
function fakeClock() {
    let time = 0;
    const sleeps: number[] = [];
    return {
        now: () => time,
        sleep: async (ms: number) => {
            sleeps.push(ms);
            time += ms;
        },
        sleeps,
    };
}

describe("renameWithRetry", () => {
    it("retries Windows sharing errors and then succeeds", async () => {
        const clock = fakeClock();
        const failures = ["EBUSY", "EPERM", "EACCES"];
        const calls: string[] = [];
        const result = await renameWithRetry("a.tmp", "show.dots", {
            platform: "win32",
            now: clock.now,
            sleep: clock.sleep,
            rename: async (from, to) => {
                calls.push(`${from}->${to}`);
                const code = failures.shift();
                if (code) throw errno(code);
            },
        });

        expect(result.attempts).toBe(4);
        expect(calls).toHaveLength(4);
        expect(clock.sleeps).toEqual([10, 20, 30]);
    });

    it("keeps retrying when the computer's clock jumps", async () => {
        // Each read of the wall clock is an hour later, as if the clock were being set
        let wall = Date.now();
        const spy = vi.spyOn(Date, "now").mockImplementation(() => {
            wall += 3_600_000;
            return wall;
        });
        try {
            const failures = ["EBUSY", "EBUSY"];
            const result = await renameWithRetry("a.tmp", "show.dots", {
                platform: "win32",
                sleep: async () => {},
                rename: async () => {
                    const code = failures.shift();
                    if (code) throw errno(code);
                },
            });
            expect(result.attempts).toBe(3);
        } finally {
            spy.mockRestore();
        }
    });

    it("gives up after the budget and reports the last error", async () => {
        const clock = fakeClock();
        let attempts = 0;
        const promise = renameWithRetry("a.tmp", "show.dots", {
            platform: "win32",
            budgetMs: 5000,
            now: clock.now,
            sleep: clock.sleep,
            rename: async () => {
                attempts++;
                throw errno("EBUSY");
            },
        });

        await expect(promise).rejects.toBeInstanceOf(
            RenameRetriesExhaustedError,
        );
        const total = clock.sleeps.reduce((a, b) => a + b, 0);
        expect(total).toBeLessThanOrEqual(5000);
        expect(total).toBeGreaterThan(4800);
        expect(Math.max(...clock.sleeps)).toBe(100);
        expect(attempts).toBe(clock.sleeps.length + 1);
    });

    it("doesn't retry other errors", async () => {
        const clock = fakeClock();
        await expect(
            renameWithRetry("a.tmp", "show.dots", {
                platform: "win32",
                now: clock.now,
                sleep: clock.sleep,
                rename: async () => {
                    throw errno("ENOSPC");
                },
            }),
        ).rejects.toMatchObject({ code: "ENOSPC" });
        expect(clock.sleeps).toEqual([]);
    });

    it("doesn't retry on macOS or Linux, where these errors are permanent", async () => {
        for (const platform of ["darwin", "linux"] as const) {
            const clock = fakeClock();
            await expect(
                renameWithRetry("a.tmp", "show.dots", {
                    platform,
                    now: clock.now,
                    sleep: clock.sleep,
                    rename: async () => {
                        throw errno("EACCES");
                    },
                }),
            ).rejects.toMatchObject({ code: "EACCES" });
            expect(clock.sleeps).toEqual([]);
        }
    });

    it("stops early when the caller says to", async () => {
        const clock = fakeClock();
        let checks = 0;
        await expect(
            renameWithRetry("a.tmp", "show.dots", {
                platform: "win32",
                now: clock.now,
                sleep: clock.sleep,
                rename: async () => {
                    throw errno("EPERM");
                },
                shouldRetry: async () => ++checks < 2,
            }),
        ).rejects.toBeInstanceOf(RenameRetriesExhaustedError);
        expect(checks).toBe(2);
    });
});

describe("publishFile", () => {
    let dir: string;
    let scratch: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "openmarch-atomic-file-"));
        scratch = mkdtempSync(join(tmpdir(), "openmarch-atomic-scratch-"));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        rmSync(scratch, { recursive: true, force: true });
    });

    it("replaces the target with a copy of the source and leaves nothing else beside it", async () => {
        const target = join(dir, "show.dots");
        const source = join(scratch, "snapshot.dots");
        writeFileSync(target, "old");
        writeFileSync(source, "new");

        const { tempPath } = await publishFile(source, target);

        expect(readFileSync(target, "utf8")).toBe("new");
        expect(tempFilePattern("show.dots").test(basename(tempPath))).toBe(
            true,
        );
        expect(readdirSync(dir)).toEqual(["show.dots"]);
        // The private snapshot stays where it was.
        expect(readFileSync(source, "utf8")).toBe("new");
    });

    it("creates the target when there is none", async () => {
        const target = join(dir, "new.dots");
        const source = join(scratch, "snapshot.dots");
        writeFileSync(source, "new");

        await publishFile(source, target);

        expect(readdirSync(dir)).toEqual(["new.dots"]);
    });

    it("leaves the target alone and removes its temp file when the rename keeps failing", async () => {
        const target = join(dir, "show.dots");
        const source = join(scratch, "snapshot.dots");
        writeFileSync(target, "old");
        writeFileSync(source, "new");
        const clock = fakeClock();

        await expect(
            publishFile(source, target, {
                platform: "win32",
                now: clock.now,
                sleep: clock.sleep,
                rename: async () => {
                    throw errno("EBUSY");
                },
            }),
        ).rejects.toBeInstanceOf(RenameRetriesExhaustedError);

        expect(readFileSync(target, "utf8")).toBe("old");
        expect(readdirSync(dir)).toEqual(["show.dots"]);
    });

    it("stops before the rename when the last check fails", async () => {
        const target = join(dir, "show.dots");
        const source = join(scratch, "snapshot.dots");
        writeFileSync(target, "old");
        writeFileSync(source, "new");

        await expect(
            publishFile(source, target, {
                beforeRename: async () => {
                    throw new Error("changed on disk");
                },
            }),
        ).rejects.toThrow("changed on disk");

        expect(readFileSync(target, "utf8")).toBe("old");
        expect(readdirSync(dir)).toEqual(["show.dots"]);
    });
});

describe("removeWithRetry", () => {
    it("is true for a missing file", async () => {
        expect(await removeWithRetry(join(tmpdir(), "openmarch-none"))).toBe(
            true,
        );
    });
});

describe("removeNowOrLater", () => {
    it("keeps deleting a temp file a sync app holds for longer than the first try", async () => {
        const clock = fakeClock();
        // Held for 25 s, as a sync app uploading a new file can.
        const remove = async () => {
            if (clock.now() < 25_000) throw errno("EBUSY");
        };

        const { removed, lingering } = await removeNowOrLater("x.tmp", {
            now: clock.now,
            sleep: clock.sleep,
            remove,
        });

        expect(removed).toBe(false);
        expect(await lingering).toBe(true);
        expect(Math.max(...clock.sleeps)).toBeLessThanOrEqual(2000);
    });

    it("gives up in the background after the linger time", async () => {
        const clock = fakeClock();
        const { lingering } = await removeNowOrLater("x.tmp", {
            now: clock.now,
            sleep: clock.sleep,
            lingerMs: 10_000,
            remove: async () => {
                throw errno("EBUSY");
            },
        });

        expect(await lingering).toBe(false);
        expect(clock.now()).toBeLessThan(15_000);
    });
});

describe("settlePendingDeletes", () => {
    it("waits for background deletes before the app quits", async () => {
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let free = false;
        const { lingering } = await removeNowOrLater("x.tmp", {
            budgetMs: 0,
            sleep: () => held,
            remove: async () => {
                if (!free) throw errno("EBUSY");
            },
        });
        expect(pendingDeleteCount()).toBe(1);

        const settling = settlePendingDeletes(5_000);
        free = true;
        release();

        expect(await settling).toEqual({ settled: true });
        expect(await lingering).toBe(true);
        expect(pendingDeleteCount()).toBe(0);
    });

    it("gives up at the cap, so quitting never hangs", async () => {
        let release!: () => void;
        let released = false;
        const held = new Promise<void>((resolve) => (release = resolve));
        const { lingering } = await removeNowOrLater("x.tmp", {
            budgetMs: 0,
            lingerMs: 1_000,
            // The sync app holds it until the test ends; then its time is up.
            now: () => (released ? 1_000_000 : 0),
            sleep: () => held,
            remove: async () => {
                throw errno("EBUSY");
            },
        });

        const started = Date.now();
        expect(await settlePendingDeletes(50)).toEqual({ settled: false });
        expect(Date.now() - started).toBeLessThan(1_000);

        released = true;
        release();
        expect(await lingering).toBe(false);
    });

    it("returns at once when nothing is pending", async () => {
        expect(await settlePendingDeletes(10_000)).toEqual({ settled: true });
    });
});

describe("publishFile's clean-up", () => {
    it("deletes its temp file in the background when a sync app holds it past the first try", async () => {
        const dir = mkdtempSync(join(tmpdir(), "openmarch-atomic-held-"));
        try {
            const target = join(dir, "show.dots");
            const source = join(dir, "snapshot.dots");
            writeFileSync(target, "old");
            writeFileSync(source, "new");
            const clock = fakeClock();
            let tempPath = "";

            await expect(
                publishFile(source, target, {
                    platform: "win32",
                    now: clock.now,
                    sleep: clock.sleep,
                    budgetMs: 0,
                    rename: async () => {
                        throw errno("EBUSY");
                    },
                    removeOptions: {
                        // Held for 20 s, longer than the first two seconds of tries.
                        remove: async (filePath) => {
                            tempPath = filePath;
                            if (clock.now() < 20_000) throw errno("EBUSY");
                            unlinkSync(filePath);
                        },
                    },
                }),
            ).rejects.toBeInstanceOf(RenameRetriesExhaustedError);

            expect(tempPath).not.toBe("");
            await expect
                .poll(() => readdirSync(dir).includes(basename(tempPath)))
                .toBe(false);
            expect(readFileSync(target, "utf8")).toBe("old");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("isSameFile", () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "openmarch-same-file-"));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("knows a file through a symbolic link or a different spelling", () => {
        const show = join(dir, "Band", "Show.dots");
        mkdirSync(join(dir, "Band"));
        writeFileSync(show, "x");
        symlinkSync(join(dir, "Band"), join(dir, "Linked"));

        expect(isSameFile(show, join(dir, "Linked", "Show.dots"))).toBe(true);
        expect(isSameFile(show, join(dir, "Band", ".", "Show.dots"))).toBe(
            true,
        );
        expect(isSameFile(show, join(dir, "Band", "Other.dots"))).toBe(false);
    });

    it("ignores case on Windows and macOS when the file isn't there to compare", () => {
        const a = join(dir, "Show.dots");
        const b = join(dir, "SHOW.DOTS");

        expect(isSameFile(a, b, "win32")).toBe(true);
        expect(isSameFile(a, b, "darwin")).toBe(true);
        expect(isSameFile(a, b, "linux")).toBe(false);
    });

    it("tells two files with the same contents apart", () => {
        writeFileSync(join(dir, "a.dots"), "x");
        writeFileSync(join(dir, "b.dots"), "x");

        expect(isSameFile(join(dir, "a.dots"), join(dir, "b.dots"))).toBe(
            false,
        );
        expect(isSameFile(join(dir, "a.dots"), "")).toBe(false);
    });
});

describe("tempFilePattern", () => {
    it("matches only this show's temp files", () => {
        const pattern = tempFilePattern("My Show (1).dots");
        expect(pattern.test(".~My Show (1).dots.0a1b2c3d.tmp")).toBe(true);
        expect(pattern.test(".~My Show (1).dots.0a1b2c3d.tmp-journal")).toBe(
            true,
        );
        expect(pattern.test(".~Other.dots.0a1b2c3d.tmp")).toBe(false);
        expect(pattern.test("My Show (1).dots")).toBe(false);
    });
});

describe("fsyncDirectory", () => {
    it("flushes a folder on POSIX and skips Windows", async () => {
        const dir = mkdtempSync(join(tmpdir(), "openmarch-fsync-dir-"));
        try {
            await expect(fsyncDirectory(dir)).resolves.toBeUndefined();
            // On Windows this must not even try to open the folder.
            await expect(
                fsyncDirectory(join(dir, "missing"), "win32"),
            ).resolves.toBeUndefined();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
