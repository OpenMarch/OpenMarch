import { describe, expect, it } from "vitest";
import { describeLocation } from "../fileLocation";

describe("describeLocation", () => {
    const appData = "C:\\Users\\Jane\\AppData\\Roaming\\OpenMarch";

    it("names OpenMarch's own folder, also when it's on a network share", () => {
        expect(
            describeLocation(
                `${appData}\\working-copies\\a\\show.dots`,
                appData,
                "win32",
            ),
        ).toBe("OpenMarch's own folder");
        const roaming =
            "\\\\school\\profiles\\Jane\\AppData\\Roaming\\OpenMarch";
        expect(
            describeLocation(
                `${roaming}\\working-copies\\a\\show.dots`,
                roaming,
                "win32",
            ),
        ).toBe("OpenMarch's own folder, on a network share");
    });

    it("names network shares and macOS volumes, and never includes the path", () => {
        expect(
            describeLocation(
                "\\\\school\\band\\Senior Night.dots",
                appData,
                "win32",
            ),
        ).toBe("a network share");
        expect(
            describeLocation(
                "/Volumes/USB/Senior Night.dots",
                "/Users/jane/Library/OpenMarch",
                "darwin",
            ),
        ).toBe("an external or network drive");
    });

    it("falls back to a local folder", () => {
        expect(
            describeLocation(
                "/home/jane/shows/Senior Night.dots",
                "/home/jane/.config/OpenMarch",
                "linux",
            ),
        ).toBe("a local folder");
    });
});
