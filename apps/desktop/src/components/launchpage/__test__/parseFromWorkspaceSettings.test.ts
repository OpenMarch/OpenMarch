import { describe, expect, it } from "vitest";
import { parseFromWorkspaceSettings } from "../parseFromWorkspaceSettings";

describe("parseFromWorkspaceSettings", () => {
    it("returns designer, client, and activity when present", () => {
        expect(
            parseFromWorkspaceSettings(
                JSON.stringify({
                    designer: "Jane Designer",
                    client: "Acme Band",
                    activity: "Drum Corps",
                    defaultTempo: 120,
                }),
            ),
        ).toEqual({
            designer: "Jane Designer",
            client: "Acme Band",
            activity: "Drum Corps",
        });
    });

    it("trims whitespace and omits empty strings", () => {
        expect(
            parseFromWorkspaceSettings(
                JSON.stringify({
                    designer: "  Jane  ",
                    client: "   ",
                    activity: "  Winter Guard  ",
                }),
            ),
        ).toEqual({
            designer: "Jane",
            client: undefined,
            activity: "Winter Guard",
        });
    });

    it("returns empty object when settings are missing or invalid", () => {
        expect(parseFromWorkspaceSettings(undefined)).toEqual({});
        expect(parseFromWorkspaceSettings(null)).toEqual({});
        expect(parseFromWorkspaceSettings("")).toEqual({});
        expect(parseFromWorkspaceSettings("not-json")).toEqual({});
        expect(parseFromWorkspaceSettings("[]")).toEqual({});
        expect(
            parseFromWorkspaceSettings(JSON.stringify({ defaultTempo: 120 })),
        ).toEqual({
            designer: undefined,
            client: undefined,
            activity: undefined,
        });
    });

    it("ignores non-string designer, client, and activity values", () => {
        expect(
            parseFromWorkspaceSettings(
                JSON.stringify({
                    designer: 42,
                    client: { name: "Acme" },
                    activity: ["Marching Band"],
                }),
            ),
        ).toEqual({
            designer: undefined,
            client: undefined,
            activity: undefined,
        });
    });
});
