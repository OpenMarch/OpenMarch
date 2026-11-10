import { describe, expect, it, vi } from "vitest";
import {
    createDiagnosticsLog,
    installDiagnostics,
    MAX_ENTRY_LENGTH,
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
        log.push("console.log", "x".repeat(MAX_ENTRY_LENGTH + 50));
        expect(log.entries()[0].text).toHaveLength(MAX_ENTRY_LENGTH + 1);
    });
});

describe("installDiagnostics", () => {
    function setup() {
        const calls: unknown[][] = [];
        const fakeConsole = {
            error: (...a: unknown[]) => calls.push(["error", ...a]),
            warn: (...a: unknown[]) => calls.push(["warn", ...a]),
            log: (...a: unknown[]) => calls.push(["log", ...a]),
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
        const wrapped = s.fakeConsole.log;
        s.uninstall();
        expect(s.fakeConsole.log).not.toBe(wrapped);
        s.fakeConsole.log("after");
        s.events.dispatchEvent(new Event("error"));
        expect(s.log.entries()).toEqual([]);
        expect(s.stopActions).toHaveBeenCalled();
    });
});
