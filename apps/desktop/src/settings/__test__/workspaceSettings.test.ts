import { describe, expect, it } from "vitest";
import {
    defaultWorkspaceSettings,
    parseWorkspaceSettings,
    workspaceSettingsSchema,
} from "../workspaceSettings";

describe("defaultWorkspaceSettings", () => {
    it("matches what a new show gets from the schema defaults", () => {
        // A new show stores settings without these keys, so the schema fills them in. Reset to
        // Defaults writes defaultWorkspaceSettings, and must land on the same values (#736).
        expect(defaultWorkspaceSettings).toEqual(
            workspaceSettingsSchema.parse({}),
        );
    });

    it("numbers measures from 1, like a new show", () => {
        expect(defaultWorkspaceSettings.measurementOffset).toBe(1);
        expect(parseWorkspaceSettings("{}").measurementOffset).toBe(1);
    });

    it("falls back to measure 1 when the stored settings can't be read", () => {
        expect(parseWorkspaceSettings("not json").measurementOffset).toBe(1);
    });
});
