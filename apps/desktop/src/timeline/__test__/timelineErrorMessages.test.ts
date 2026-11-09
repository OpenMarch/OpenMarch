// @vitest-environment node
import { holdTerms } from "../holdTerms";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tolgee, FormatSimple } from "@tolgee/react";
import { FormatIcu } from "@tolgee/format-icu";
import { toast } from "sonner";
import { TimelineCommitViolationError } from "@/db-functions/timelineChanges";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import { text } from "@/timeline/timelineText";
import { conToastError } from "@/utilities/utils";
import { TimelineEditRefusedError } from "../timelineEditRefusals";
import {
    TIMELINE_DB_ERROR_MESSAGE,
    TIMELINE_ERROR_MESSAGES,
    HELD_CONFLICT_MESSAGE,
    TIMELINE_LEGACY_CONVERSION_MESSAGE,
    TIMELINE_NOT_READY_MESSAGE,
    isLegacyConversionViolation,
    NOT_JOINED_MESSAGE,
    NOT_JOINED_REASONS,
    notJoinedMessage,
    TIMELINE_UNKNOWN_ERROR_MESSAGE,
    timelineErrorCode,
    timelineErrorMessage,
    toastTimelineError,
} from "../timelineErrorMessages";

/**
 * P8.6: every error code a timeline write can fail with has a friendly, translatable message.
 */

vi.mock("@/utilities/utils", () => ({ conToastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));

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
/** The Held marks' commit-time codes (ADR 0012 amendment 2026-10-30) */
const HELD_CODES = ["E-H1", "E-H3"];

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
            [...SPEC_CODES, ...COMBINED_CODES, ...HELD_CODES].sort(),
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

    it.each(HELD_CODES)(
        "maps a Held mark's commit-time %s, which names no transition",
        (code) => {
            const error = new TimelineCommitViolationError([
                {
                    code,
                    transitionId: null,
                    detail: "marcher 3 is Held over [17, 25)",
                },
            ]);
            expect(error.message).toBe(
                `${code}: marcher 3 is Held over [17, 25)`,
            );
            // The hold words come from the terms block (`holdTerms`)
            const terms: Record<string, string> = holdTerms();
            expect(timelineErrorMessage(error)).toBe(
                TIMELINE_ERROR_MESSAGES[code]!.defaultMessage.replace(
                    /\{(\w+)\}/g,
                    (_, name: string) => terms[name]!,
                ),
            );
        },
    );

    it("an E-H1 that knows who names the marchers and the page, and points to Clear this page", () => {
        const violation = {
            code: "E-H1",
            transitionId: null,
            detail: "marcher 3 is Held over [17, 25)",
        };
        const one = new TimelineCommitViolationError([violation], {
            names: ["T1"],
            pages: ["3"],
        });
        expect(timelineErrorMessage(one)).toBe(
            "T1 is Held on Page 3. Clear this page to remove the hold, or drag inside it to move it.",
        );
        const many = new TimelineCommitViolationError([violation], {
            names: ["T1", "T2"],
            pages: ["3", "5"],
        });
        expect(timelineErrorMessage(many)).toBe(
            "T1 and T2 are Held on Pages 3 and 5. Clear this page to remove the holds, or drag inside them to move them.",
        );
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
        const message = timelineErrorMessage(legacy);
        expect(message).toMatch(/earlier development build/);
        expect(message).toMatch(/backup/);
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

    it("E-ARGS shows the refusal's own text, translated when shown, without the code", () => {
        const error = new TimelineWriteError(
            "E-ARGS",
            text.t("timeline.refusals.casting.alreadyInSlot", { slot: 3 }),
        );
        // The message is for logs: the key and its arguments, built without Tolgee
        expect(error.message).toBe(
            'E-ARGS: timeline.refusals.casting.alreadyInSlot {"slot":3}',
        );
        expect(timelineErrorMessage(error)).toBe(
            "the marcher is already in slot 3",
        );
        // Each key goes through the translator, nested pieces first
        const nested = new TimelineWriteError(
            "E-ARGS",
            text.t("timeline.refusals.keep.wholePage", {
                counts: text.t("timeline.where.theseCounts"),
            }),
        );
        const translate = vi.fn(
            (key: string, _default?: string, params?: object) =>
                `<${key}${params ? ` ${JSON.stringify(params)}` : ""}>`,
        );
        expect(timelineErrorMessage(nested, { translate })).toBe(
            '<timeline.refusals.keep.wholePage {"counts":"<timeline.where.theseCounts {}>"}>',
        );
    });

    it("E-ARGS with only a developer's message gets the fallback, or the generic message", () => {
        const error = new TimelineWriteError(
            "E-ARGS",
            "timeline 7 does not exist",
        );
        expect(timelineErrorMessage(error)).toBe(
            TIMELINE_UNKNOWN_ERROR_MESSAGE.defaultMessage,
        );
        expect(
            timelineErrorMessage(error, {
                fallback: "Couldn't split the move",
            }),
        ).toBe("Couldn't split the move");
        // A refusal with text for the user shows that, not the fallback
        expect(
            timelineErrorMessage(
                new TimelineWriteError(
                    "E-ARGS",
                    text.t("timeline.refusals.casting.alreadyInSlot", {
                        slot: 3,
                    }),
                ),
                { fallback: "Couldn't split the move" },
            ),
        ).toBe("the marcher is already in slot 3");
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

    it("shows marchers a holds command left in their move as a warning, since the rest was done", () => {
        const error = new TimelineEditRefusedError("inShapeOrFollowTheLeader", {
            marcherIds: [3],
            message: "B3 is in a shape, so it keeps its move here.",
            params: {
                count: 1,
                shapeCount: 1,
                shapeNames: { list: ["B3"] },
                leaderCount: 0,
                leaderNames: { list: [] },
                orderCount: 0,
                orderNames: { list: [] },
            },
        });
        toastTimelineError(error);
        expect(toast.warning).toHaveBeenCalledWith(
            "B3 is in a shape, so it keeps its move here.",
            { id: "timeline-refused-inShapeOrFollowTheLeader" },
        );
        expect(toast.error).not.toHaveBeenCalled();
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

describe("notJoinedMessage", () => {
    const labels = new Map([
        [3, "T3"],
        [4, "T4"],
        [7, "B1"],
    ]);
    const nameOf = (id: number) => labels.get(id);

    it("names the marchers and words the reason for a join (#470)", () => {
        expect(
            notJoinedMessage(
                [{ marcherIds: [3, 4], reason: "secondMove" }],
                nameOf,
            ),
        ).toBe(
            "T3 and T4 couldn't join their moves: they'd have two moves over the same counts.",
        );
    });

    it("puts each refused join in the one toast", () => {
        expect(
            notJoinedMessage(
                [
                    { marcherIds: [3], reason: "partway" },
                    { marcherIds: [7], reason: "overlap" },
                ],
                nameOf,
            ),
        ).toBe(
            "T3 couldn't join their moves: a marcher joins or leaves the next move partway. B1 couldn't join their moves: the joined move would run into another of their moves on the same layer.",
        );
    });

    it("counts marchers whose names aren't known", () => {
        expect(
            notJoinedMessage(
                [{ marcherIds: [3, 99], reason: "overlap" }],
                nameOf,
            ),
        ).toMatch(/^2 marchers couldn't join their moves: /);
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
            NOT_JOINED_MESSAGE,
            ...Object.values(NOT_JOINED_REASONS),
            HELD_CONFLICT_MESSAGE,
        ])
            expect(lookup(m.key), m.key).toBe(m.defaultMessage);
    });

    it("carries the Define as shown entry and the Delete-move toast (pre-merge review U8)", () => {
        for (const [key, text] of Object.entries({
            "timeline.rangeMenu.setAsShown": "{defineAsShown}",
            "timeline.rangeMenu.deleteWithMoves": "Delete page and its moves",
            "timeline.moveDeleted.message": "Deleted {label}",
            "timeline.moveDeleted.withPages":
                "{count, plural, =1 {Deleted {label} · Page {pages} changed} other {Deleted {label} · Pages {pages} changed}}",
            "timeline.keyframes.title": "Keyframe · Page {page}, count {count}",
            "timeline.keyframes.detail": "{set} of {total} selected",
            "timeline.keyframes.detailNames":
                "{set} of {total} selected: {names}",
        }))
            expect(lookup(key), key).toBe(text);
    });

    it("words the holds skip notice as the write does, with the marcher names as parameters", async () => {
        const key = "timeline.edit.inShapeOrFollowTheLeader";
        const tolgee = Tolgee()
            .use(FormatSimple())
            .use(FormatIcu())
            .init({
                language: "en",
                staticData: { en: { [key]: lookup(key) as string } },
            });
        await tolgee.run();
        const say = (
            shapeNames: string[],
            leaderNames: string[],
            orderNames: string[] = [],
        ): string =>
            tolgee.t(key, {
                count:
                    shapeNames.length + leaderNames.length + orderNames.length,
                shapeCount: shapeNames.length,
                shapeNames: shapeNames.join(" and "),
                leaderCount: leaderNames.length,
                leaderNames: leaderNames.join(" and "),
                orderCount: orderNames.length,
                orderNames: orderNames.join(" and "),
            });
        expect(say(["B1"], [])).toBe(
            "B1 is in a shape, so it keeps its move here.",
        );
        expect(say([], ["T1", "T2"])).toBe(
            "T1 and T2 follow the leader, so they keep their move here.",
        );
        expect(say(["B1", "B2"], ["T1"])).toBe(
            "B1 and B2 are in a shape, and T1 follows the leader, so they keep their move here.",
        );
        expect(say([], [], ["T3"])).toBe(
            "T3 shares a curved move with a follow-the-leader order, so it keeps its move here.",
        );
        expect(say([], ["T1"], ["T3", "T4"])).toBe(
            "T1 follows the leader, and T3 and T4 share a curved move with a follow-the-leader order, so they keep their move here.",
        );
        expect(say(["B1"], [], ["T3"])).toBe(
            "B1 is in a shape, and T3 shares a curved move with a follow-the-leader order, so they keep their move here.",
        );
    });
});
