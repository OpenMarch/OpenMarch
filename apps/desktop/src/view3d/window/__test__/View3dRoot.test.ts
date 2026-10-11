import { describe, expect, it } from "vitest";
import { readView3dWindowParams } from "../View3dRoot";

describe("readView3dWindowParams", () => {
    it("reads the show name, theme and language main passes", () => {
        expect(
            readView3dWindowParams(
                "?view=3d&show=Fall%20Show%202026&theme=light&lang=fr",
            ),
        ).toEqual({
            showName: "Fall Show 2026",
            theme: "light",
            language: "fr",
        });
    });

    it("falls back to dark, English and an empty name", () => {
        expect(readView3dWindowParams("?view=3d")).toEqual({
            showName: "",
            theme: "dark",
            language: "en",
        });
        expect(readView3dWindowParams("?view=3d&theme=neon&lang=")).toEqual({
            showName: "",
            theme: "dark",
            language: "en",
        });
    });
});
