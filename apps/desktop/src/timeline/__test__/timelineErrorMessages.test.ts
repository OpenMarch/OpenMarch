import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineCommitViolationError } from "@/db-functions/timelineChanges";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import { TIMELINE_INSPECTOR_STRINGS } from "@/components/inspector/timelineInspectorStrings";
import { conToastError } from "@/utilities/utils";
import {
    TIMELINE_DB_ERROR_MESSAGE,
    TIMELINE_ERROR_MESSAGES,
    TIMELINE_LEGACY_CONVERSION_MESSAGE,
    TIMELINE_NOT_READY_MESSAGE,
    isLegacyConversionViolation,
    TIMELINE_UNKNOWN_ERROR_MESSAGE,
    timelineErrorCode,
    timelineErrorMessage,
    toastTimelineError,
} from "../timelineErrorMessages";

/**
 * P8.6: every error code a timeline write can fail with has a friendly, translatable message.
 */

vi.mock("@/utilities/utils", () => ({ conToastError: vi.fn() }));

afterEach(() => vi.mocked(conToastError).mockReset());

/** Every code in spec section 6, plus the app's own. */
const SPEC_CODES = [
    "E-S1",
    "E-P1",
    "E-D2",
    "E-N2",
    "E-T1",
    "E-T3",
    "E-T4",
    "E-T5",
    "E-T6",
    "E-A1",
    "E-A2",
    "E-A3",
];
const COMBINED_CODES = ["E-A1/E-A2", "E-T3/E-T4"];

describe("timelineErrorMessage", () => {
    it.each([...SPEC_CODES, ...COMBINED_CODES])(
        "%s maps to a message without the code",
        (code) => {
            const message = timelineErrorMessage(
                new TimelineWriteError(code, "raw trigger text"),
            );
            expect(message.length).toBeGreaterThan(20);
            expect(message).not.toContain(code);
            expect(message).not.toContain("raw trigger text");
            expect(message).toBe(TIMELINE_ERROR_MESSAGES[code]!.defaultMessage);
        },
    );

    it("has a distinct message for each code", () => {
        const messages = Object.values(TIMELINE_ERROR_MESSAGES).map(
            (m) => m.defaultMessage,
        );
        expect(new Set(messages).size).toBe(messages.length);
        expect(Object.keys(TIMELINE_ERROR_MESSAGES).sort()).toEqual(
            [...SPEC_CODES, ...COMBINED_CODES].sort(),
        );
    });

    it("the combined codes name both halves", () => {
        expect(TIMELINE_ERROR_MESSAGES["E-A1/E-A2"]!.defaultMessage).toMatch(
            /range.*slot/s,
        );
        expect(TIMELINE_ERROR_MESSAGES["E-T3/E-T4"]!.defaultMessage).toMatch(
            /follow-the-leader.*block/s,
        );
    });

    it("maps a commit-time violation by its code", () => {
        const error = new TimelineCommitViolationError([
            { code: "E-T6", transitionId: 4, detail: "missing destination" },
        ]);
        expect(timelineErrorCode(error)).toBe("E-T6");
        const message = timelineErrorMessage(error);
        expect(message).toBe(TIMELINE_ERROR_MESSAGES["E-T6"]!.defaultMessage);
        expect(message).not.toContain("transition 4");
    });

    it("E-T1 says a transition spans its timeline (C-11), from a row trigger or the commit check", () => {
        const message = TIMELINE_ERROR_MESSAGES["E-T1"]!.defaultMessage;
        expect(message).toMatch(/span its whole timeline/);
        expect(timelineErrorMessage(new TimelineWriteError("E-T1", "x"))).toBe(
            message,
        );
        // One transition off its timeline's range (not a legacy file)
        const single = new TimelineCommitViolationError([
            {
                code: "E-T1",
                transitionId: 2,
                detail: "transition spans [8, 16) but its timeline spans [0, 16)",
            },
        ]);
        expect(isLegacyConversionViolation(single)).toBe(false);
        expect(timelineErrorMessage(single)).toBe(message);
    });

    it("E-T1 from a file an earlier development build converted says to convert it again", () => {
        // One show-wide timeline owning a transition per page, as the old converter wrote
        const legacy = new TimelineCommitViolationError([
            {
                code: "E-T1",
                transitionId: 1,
                detail: "transition spans [1, 9) but its timeline spans [0, 49)",
            },
            {
                code: "E-T1",
                transitionId: 2,
                detail: "transition spans [9, 17) but its timeline spans [0, 49)",
            },
        ]);
        expect(isLegacyConversionViolation(legacy)).toBe(true);
        expect(
            timelineErrorMessage(legacy, { translate: (_key, text) => text }),
        ).toBe(TIMELINE_LEGACY_CONVERSION_MESSAGE.defaultMessage);
        // Through Tolgee the ICU-quoted braces render as written
        const message = timelineErrorMessage(legacy);
        expect(message).toMatch(/earlier development build/);
        expect(message).toMatch(/backup/);
        expect(message).toContain("convertPages({ replace: true })");
        expect(
            isLegacyConversionViolation(new TimelineWriteError("E-T1", "x")),
        ).toBe(false);
    });

    it("maps the row-trigger E-T6 the same way", () => {
        expect(timelineErrorMessage(new TimelineWriteError("E-T6", "x"))).toBe(
            timelineErrorMessage(
                new TimelineCommitViolationError([
                    { code: "E-T6", transitionId: 1, detail: "x" },
                ]),
            ),
        );
    });

    it("E-ARGS shows the error's own message, without the code", () => {
        expect(
            timelineErrorMessage(
                new TimelineWriteError("E-ARGS", "slot 3 is already taken"),
            ),
        ).toBe("slot 3 is already taken");
    });

    it("E-DB is generic and never shows the database's text", () => {
        const error = new TimelineWriteError(
            "E-DB",
            "CHECK constraint failed: end_beat > start_beat",
            [],
            { cause: new Error("SQLITE_CONSTRAINT") },
        );
        const message = timelineErrorMessage(error);
        expect(message).toBe(TIMELINE_DB_ERROR_MESSAGE.defaultMessage);
        expect(message).not.toMatch(/CHECK|SQLITE/);
    });

    it("an unknown code gets the generic message", () => {
        expect(
            timelineErrorMessage(new TimelineWriteError("E-ZZ9", "mystery")),
        ).toBe(TIMELINE_UNKNOWN_ERROR_MESSAGE.defaultMessage);
    });

    it("a different error uses the fallback, or the generic message without one", () => {
        expect(
            timelineErrorMessage(new Error("boom"), { fallback: "Oops" }),
        ).toBe("Oops");
        expect(timelineErrorMessage("boom")).toBe(
            TIMELINE_UNKNOWN_ERROR_MESSAGE.defaultMessage,
        );
    });

    it("the timeline-not-ready error has its own message", () => {
        const error = new Error("The timeline is still loading.");
        error.name = "TimelineNotReadyError";
        expect(timelineErrorMessage(error)).toBe(
            TIMELINE_NOT_READY_MESSAGE.defaultMessage,
        );
    });

    it("uses the translator for every message", () => {
        const translate = vi.fn((key: string) => `<${key}>`);
        expect(
            timelineErrorMessage(new TimelineWriteError("E-A3", "x"), {
                translate,
            }),
        ).toBe("<timeline.errors.assignmentOverlap>");
        expect(
            timelineErrorMessage(new TimelineWriteError("E-DB", "x"), {
                translate,
            }),
        ).toBe("<timeline.errors.database>");
    });
});

describe("toastTimelineError", () => {
    it("toasts the friendly message and logs the original error", () => {
        const error = new TimelineWriteError("E-A3", "overlap");
        toastTimelineError(error, "fallback", { extra: 1 });
        expect(conToastError).toHaveBeenCalledWith(
            TIMELINE_ERROR_MESSAGES["E-A3"]!.defaultMessage,
            error,
            { extra: 1 },
        );
    });

    it("logs the cause of an E-DB error", () => {
        const cause = new Error("SQLITE_CONSTRAINT");
        const error = new TimelineWriteError("E-DB", "db", [], { cause });
        toastTimelineError(error);
        expect(conToastError).toHaveBeenCalledWith(
            TIMELINE_DB_ERROR_MESSAGE.defaultMessage,
            error,
            cause,
        );
    });

    it("uses the fallback for an error that isn't a timeline refusal", () => {
        const error = new Error("boom");
        toastTimelineError(error, "Error moving marchers");
        expect(conToastError).toHaveBeenCalledWith(
            "Error moving marchers",
            error,
        );
    });
});

describe("en.json", () => {
    const en = JSON.parse(
        readFileSync(resolve(__dirname, "../../../i18n/en.json"), "utf8"),
    ) as Record<string, unknown>;
    const lookup = (key: string): unknown =>
        key
            .split(".")
            .reduce<unknown>(
                (node, part) => (node as Record<string, unknown>)?.[part],
                en,
            );

    it("carries every error message under the keys the mapper uses", () => {
        for (const m of [
            ...Object.values(TIMELINE_ERROR_MESSAGES),
            TIMELINE_DB_ERROR_MESSAGE,
            TIMELINE_UNKNOWN_ERROR_MESSAGE,
            TIMELINE_NOT_READY_MESSAGE,
            TIMELINE_LEGACY_CONVERSION_MESSAGE,
        ])
            expect(lookup(m.key), m.key).toBe(m.defaultMessage);
    });

    it("carries every inspector string", () => {
        for (const [key, text] of Object.entries(TIMELINE_INSPECTOR_STRINGS))
            expect(lookup(key), key).toBe(text);
    });
});
