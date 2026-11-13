import { describe, expect, it } from "vitest";
import {
    buildPayload,
    draftProblems,
    EMPTY_DRAFT,
    type ReportContext,
    type ReportDraft,
} from "../reportDraft";

const context: ReportContext = {
    appVersion: "0.2.0",
    platform: "darwin-arm64",
    channel: "desktop",
};

const broken: ReportDraft = {
    ...EMPTY_DRAFT,
    type: "broken",
    title: "  Undo skips a step  ",
    answers: {
        whatWentWrong: "Undo jumped back two moves",
        expected: "One move",
        steps: "   ",
        feedback: "left over from another type",
    },
};

describe("draftProblems", () => {
    it("asks for a type first", () => {
        expect(draftProblems(EMPTY_DRAFT)).toEqual(["type"]);
    });

    it("lists the title and the type's required answers", () => {
        expect(draftProblems({ ...EMPTY_DRAFT, type: "broken" })).toEqual([
            "title",
            "whatWentWrong",
            "expected",
        ]);
        expect(draftProblems(broken)).toEqual([]);
    });
});

describe("buildPayload", () => {
    it("sends only the chosen type's answers, trimmed, without blanks", () => {
        const payload = buildPayload(broken, context, {
            hasVideo: false,
            hasShowFile: true,
        });
        expect(payload.kind).toBe("broken");
        expect(payload.channel).toBe("desktop");
        expect(payload.title).toBe("Undo skips a step");
        expect(payload.answers).toEqual({
            what_went_wrong: "Undo jumped back two moves",
            expected: "One move",
        });
        expect(payload.context).toEqual({
            app_version: "0.2.0",
            platform: "darwin-arm64",
        });
    });

    it("only grants public posting for files that are actually sent", () => {
        const draft: ReportDraft = {
            ...broken,
            consent: {
                videoPublic: true,
                showFilePublic: true,
                creditByName: true,
            },
        };
        const payload = buildPayload(draft, context, {
            hasVideo: false,
            hasShowFile: true,
        });
        expect(payload.consent).toEqual({
            video_public: false,
            show_file_public: true,
            credit_name: true,
        });
    });

    it("refuses a draft that isn't ready", () => {
        expect(() =>
            buildPayload(EMPTY_DRAFT, context, {
                hasVideo: false,
                hasShowFile: false,
            }),
        ).toThrow();
    });
});
