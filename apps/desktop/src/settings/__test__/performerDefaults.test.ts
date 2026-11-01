// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    parseWorkspaceSettings,
    performerDefaultsOf,
    serializeWorkspaceSettings,
} from "../workspaceSettings";

describe("performerDefaults (ADR 0004 D-4)", () => {
    it("defaults to left foot and foot on the dot", () => {
        expect(performerDefaultsOf(parseWorkspaceSettings("{}"))).toEqual({
            stepOffFoot: "left",
            dotMode: "foot",
        });
        expect(
            performerDefaultsOf(
                parseWorkspaceSettings(
                    '{"performerDefaults":{"dotMode":"body"}}',
                ),
            ),
        ).toEqual({ stepOffFoot: "left", dotMode: "body" });
    });

    it("keeps stored defaults through a save", () => {
        const settings = parseWorkspaceSettings(
            '{"performerDefaults":{"stepOffFoot":"right","dotMode":"body"}}',
        );
        expect(
            parseWorkspaceSettings(serializeWorkspaceSettings(settings))
                .performerDefaults,
        ).toEqual({ stepOffFoot: "right", dotMode: "body" });
    });

    it("rejects an unknown foot", () => {
        // An invalid file falls back to the default settings as a whole
        expect(
            parseWorkspaceSettings(
                '{"performerDefaults":{"stepOffFoot":"both"}}',
            ).performerDefaults,
        ).toBeUndefined();
    });
});
