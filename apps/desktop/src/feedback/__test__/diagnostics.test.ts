import { describe, expect, it, vi } from "vitest";
import {
    createDiagnosticsLog,
    describeValue,
    installDiagnostics,
    MAX_ENTRY_LENGTH,
    redact,
} from "../diagnostics";

describe("createDiagnosticsLog", () => {
    it("keeps the newest entries, oldest first", () => {
        let t = 0;
        const log = createDiagnosticsLog(3, () => ++t);
        for (const id of ["a", "b", "c", "d", "e"]) log.push("action", id);
        expect(log.entries().map((e) => [e.at, e.text])).toEqual([
            [3, "c"],
            [4, "d"],
            [5, "e"],
        ]);
    });

    it("cuts long text", () => {
        const log = createDiagnosticsLog();
        log.push("console.warn", "x".repeat(MAX_ENTRY_LENGTH + 50));
        expect(log.entries()[0].text).toHaveLength(MAX_ENTRY_LENGTH + 1);
    });
});

describe("installDiagnostics", () => {
    function setup() {
        const calls: unknown[][] = [];
        const fakeConsole = {
            error: (...a: unknown[]) => calls.push(["error", ...a]),
            warn: (...a: unknown[]) => calls.push(["warn", ...a]),
        };
        const events = new EventTarget();
        let actionListener: ((id: string) => void) | null = null;
        const stopActions = vi.fn();
        const log = createDiagnosticsLog();
        const uninstall = installDiagnostics(log, {
            console: fakeConsole,
            events,
            subscribeToActions: (listener) => {
                actionListener = listener;
                return stopActions;
            },
        });
        return {
            calls,
            fakeConsole,
            events,
            log,
            uninstall,
            stopActions,
            runAction: (id: string) => actionListener?.(id),
        };
    }

    it("records console lines and still prints them", () => {
        const s = setup();
        s.fakeConsole.warn("slow save", { ms: 812 });
        expect(s.calls).toEqual([["warn", "slow save", { ms: 812 }]]);
        expect(s.log.entries()[0]).toMatchObject({
            kind: "console.warn",
            text: 'slow save {"ms":812}',
        });
    });

    it("records actions, errors and rejections", () => {
        const s = setup();
        s.runAction("undo");
        const error = new Error("boom");
        s.events.dispatchEvent(
            Object.assign(new Event("error"), { error, message: "boom" }),
        );
        s.events.dispatchEvent(
            Object.assign(new Event("unhandledrejection"), {
                reason: "lost connection",
            }),
        );
        expect(s.log.entries().map((e) => e.kind)).toEqual([
            "action",
            "error",
            "rejection",
        ]);
        expect(s.log.entries()[1].text).toContain("boom");
        expect(s.log.entries()[2].text).toBe("lost connection");
    });

    it("stops recording and restores the console when uninstalled", () => {
        const s = setup();
        const wrapped = s.fakeConsole.warn;
        s.uninstall();
        expect(s.fakeConsole.warn).not.toBe(wrapped);
        s.fakeConsole.warn("after");
        s.events.dispatchEvent(new Event("error"));
        expect(s.log.entries()).toEqual([]);
        expect(s.stopActions).toHaveBeenCalled();
    });
});

describe("redaction", () => {
    it("drops database query parameters", () => {
        const drizzle = new Error(
            'Failed query: update "marchers" set "name" = ? where "id" = ?\nparams: Jordan Quill,4',
        );
        const text = describeValue(drizzle);
        expect(text).not.toContain("Jordan");
        expect(text).toContain("params: [removed]");
    });

    it("replaces home-folder paths in every form", () => {
        for (const path of [
            "file:///C:/Users/jordan/AppData/Local/Programs/OpenMarch/resources/app.asar/dist/index.js:3:9",
            "C:\\Users\\jordan\\Documents\\show.dots",
            "/Users/jordan/Music/opener.mp3",
            "/home/jordan/shows/show.dots",
        ]) {
            const out = redact(`at x (${path})`);
            expect(out).not.toContain("jordan");
            expect(out).toContain("~");
        }
    });

    it("masks name-like fields in logged objects", () => {
        const text = describeValue({
            id: 4,
            name: "Jordan Quill",
            notes: "braces",
            section: "Trumpet",
        });
        expect(text).toBe(
            '{"id":4,"name":"[removed]","notes":"[removed]","section":"Trumpet"}',
        );
    });
});
