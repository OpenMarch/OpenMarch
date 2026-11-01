// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    parseWorkspaceSettings,
    serializeWorkspaceSettings,
    warnPropMovesWithoutCrewOf,
} from "../workspaceSettings";

describe("warnPropMovesWithoutCrew (ADR 0002 D-10)", () => {
    it("is off by default", () => {
        expect(warnPropMovesWithoutCrewOf(parseWorkspaceSettings("{}"))).toBe(
            false,
        );
        expect(warnPropMovesWithoutCrewOf(undefined)).toBe(false);
    });

    it("is stored in the show file and kept through a save", () => {
        const settings = parseWorkspaceSettings(
            '{"warnPropMovesWithoutCrew":true}',
        );
        expect(warnPropMovesWithoutCrewOf(settings)).toBe(true);
        expect(
            warnPropMovesWithoutCrewOf(
                parseWorkspaceSettings(serializeWorkspaceSettings(settings)),
            ),
        ).toBe(true);
    });
});
