import { describe, expect, it } from "vitest";
import { withoutPaths } from "../logSafe";

const errno = (code: string, message: string) =>
    Object.assign(new Error(message), { code });

describe("withoutPaths", () => {
    it("removes the paths Node quotes in its errors", () => {
        const error = errno(
            "EBUSY",
            "EBUSY: resource busy or locked, rename 'C:\\Users\\Jane Smith\\OneDrive\\.~Show.dots.1.tmp' -> 'C:\\Users\\Jane Smith\\OneDrive\\Senior Night.dots'",
        );
        expect(withoutPaths(error)).toBe(
            "EBUSY: resource busy or locked, rename '<path>'",
        );
    });

    it("removes unquoted Windows, UNC and POSIX paths, spaces and all", () => {
        expect(
            withoutPaths(
                new Error(
                    "The show kept changing while OpenMarch copied it: C:\\Band\\My Show.dots",
                ),
            ),
        ).toBe("The show kept changing while OpenMarch copied it: <path>");
        expect(withoutPaths("open \\\\school\\share\\Jane\\Show.dots")).toBe(
            "open <path>",
        );
        expect(
            withoutPaths(
                "Couldn't read /Users/jane/Library/CloudStorage/x.dots",
            ),
        ).toBe("Couldn't read <path>");
    });

    it("removes the whole path when its name has a quote in it", () => {
        expect(withoutPaths("open '/Users/alex/Shows/Tom's Show.dots'")).toBe(
            "open '<path>'",
        );
        expect(withoutPaths("open 'C:\\Users\\O'Brien\\show.dots'")).toBe(
            "open '<path>'",
        );
        expect(withoutPaths("in [/home/jane/x.dots]")).toBe("in [<path>");
    });

    it("keeps the code and text that aren't paths", () => {
        expect(withoutPaths(errno("ENOSPC", "no space left on device"))).toBe(
            "ENOSPC: no space left on device",
        );
        expect(withoutPaths(new Error("Saved 16.5 MB/s in 2 ms"))).toBe(
            "Saved 16.5 MB/s in 2 ms",
        );
        expect(withoutPaths("1 / 2 done")).toBe("1 / 2 done");
    });
});
