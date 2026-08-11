import { describe, expect, it } from "vitest";
import { parseFromWorkspaceSettings } from "../parseFromWorkspaceSettings";

describe("parseFromWorkspaceSettings", () => {
    it("returns designer, client, activity, and pageNumberOffset when present", () => {
        expect(
            parseFromWorkspaceSettings(
                JSON.stringify({
                    designer: "Jane Designer",
                    client: "Acme Band",
                    activity: "Drum Corps",
                    pageNumberOffset: 12,
                    defaultTempo: 120,
                }),
            ),
        ).toEqual({
            designer: "Jane Designer",
            client: "Acme Band",
            activity: "Drum Corps",
            pageNumberOffset: 12,
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
            pageNumberOffset: undefined,
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
            pageNumberOffset: undefined,
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
            pageNumberOffset: undefined,
        });
    });

    it("ignores non-integer pageNumberOffset values", () => {
        expect(
            parseFromWorkspaceSettings(
                JSON.stringify({ pageNumberOffset: 1.5 }),
            ),
        ).toEqual({
            designer: undefined,
            client: undefined,
            activity: undefined,
            pageNumberOffset: undefined,
        });
        expect(
            parseFromWorkspaceSettings(
                JSON.stringify({ pageNumberOffset: "12" }),
            ),
        ).toEqual({
            designer: undefined,
            client: undefined,
            activity: undefined,
            pageNumberOffset: undefined,
        });
        expect(
            parseFromWorkspaceSettings(
                JSON.stringify({ pageNumberOffset: Number.NaN }),
            ),
        ).toEqual({
            designer: undefined,
            client: undefined,
            activity: undefined,
            pageNumberOffset: undefined,
        });
    });

    it("accepts zero and negative integer pageNumberOffset", () => {
        expect(
            parseFromWorkspaceSettings(JSON.stringify({ pageNumberOffset: 0 })),
        ).toEqual({
            designer: undefined,
            client: undefined,
            activity: undefined,
            pageNumberOffset: 0,
        });
        expect(
            parseFromWorkspaceSettings(
                JSON.stringify({ pageNumberOffset: -3 }),
            ),
        ).toEqual({
            designer: undefined,
            client: undefined,
            activity: undefined,
            pageNumberOffset: -3,
        });
    });
});
