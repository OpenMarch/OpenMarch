// @vitest-environment node
/**
 * The page-era file the main process is asking the person about
 * (`conversionQuestion.ts`): another open, a new show or a close forgets it,
 * and the renderer hears of every change except the person's own Confirm.
 */
import { describe, expect, it } from "vitest";
import type { PendingConversion } from "@om-electron/database/convertOnOpenGate";
import {
    createConversionQuestion,
    pendingConversionFor,
} from "../conversionQuestion";

const question = () => {
    const notices: (PendingConversion | null)[] = [];
    return {
        notices,
        q: createConversionQuestion((pending) => notices.push(pending)),
    };
};

const OLD = pendingConversionFor(
    "/shows/Fall Show.dots",
    "/shows/Fall Show.pre-conversion.dots",
);

describe("the conversion question", () => {
    it("names the file, its backup and its folder", () => {
        expect(OLD).toEqual({
            filePath: "/shows/Fall Show.dots",
            fileName: "Fall Show.dots",
            backupPath: "/shows/Fall Show.pre-conversion.dots",
            backupFileName: "Fall Show.pre-conversion.dots",
            folder: "/shows",
        });
    });

    it("asking tells the renderer, and a later question replaces it", () => {
        const { q, notices } = question();
        const other = pendingConversionFor("/b.dots", "/b.pre-conversion.dots");

        q.ask(OLD);
        q.ask(other);

        expect(q.current()).toEqual(other);
        expect(notices).toEqual([OLD, other]);
    });

    it("another open, new show or close forgets a stale question and tells the renderer", () => {
        const { q, notices } = question();
        q.ask(OLD);

        q.forget();

        expect(q.current()).toBeNull();
        expect(notices).toEqual([OLD, null]);
    });

    it("forgetting when nothing is asked says nothing", () => {
        const { q, notices } = question();
        q.forget();
        expect(notices).toEqual([]);
    });

    it("Confirm takes the file once, without a notice (the dialog shows the progress)", () => {
        const { q, notices } = question();
        q.ask(OLD);

        expect(q.take()).toEqual(OLD);
        expect(q.take()).toBeNull();
        q.forget();

        expect(q.current()).toBeNull();
        expect(notices).toEqual([OLD]);
    });
});
