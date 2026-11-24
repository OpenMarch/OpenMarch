// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scrubUserPaths, scrubUserPathsInString } from "../scrubUserPaths";

describe("scrubUserPathsInString", () => {
    it.each([
        [
            "file:///C:/Users/JaneDoe/AppData/Local/Programs/OpenMarch/resources/app.asar/dist/index.html",
            "file:///C:/Users/~/AppData/Local/Programs/OpenMarch/resources/app.asar/dist/index.html",
        ],
        [
            "file:///C:/Users/Jane%20Doe/AppData/x/index.html#settings",
            "file:///C:/Users/~/AppData/x/index.html#settings",
        ],
        [
            "ENOENT: no such file, open 'C:\\Users\\Jane Doe\\Documents\\Fall show.dots'",
            "ENOENT: no such file, open 'C:\\Users\\~\\Documents\\Fall show.dots'",
        ],
        [
            '{"path":"C:\\\\Users\\\\jdoe\\\\Desktop\\\\a.dots"}',
            '{"path":"C:\\\\Users\\\\~\\\\Desktop\\\\a.dots"}',
        ],
        [
            "/Users/jane/Library/Application Support/OpenMarch/x.json",
            "/Users/~/Library/Application Support/OpenMarch/x.json",
        ],
        [
            "/home/jane/shows/a.dots and /home/bob/b.dots",
            "/home/~/shows/a.dots and /home/~/b.dots",
        ],
        ["file:///Users/jane", "file:///Users/~"],
    ])("scrubs %s", (input, expected) => {
        expect(scrubUserPathsInString(input)).toBe(expected);
    });

    it.each([
        "file:///Applications/OpenMarch.app/Contents/Resources/app.asar/dist/index.html",
        "Users can add marchers",
        "https://openmarch.com/guides/home",
        "data:image/png;base64,/Users/abc",
    ])("leaves %s alone", (input) => {
        expect(scrubUserPathsInString(input)).toBe(input);
    });
});

describe("scrubUserPaths", () => {
    it("scrubs nested strings without touching the input", () => {
        const event = {
            $current_url: "file:///C:/Users/jdoe/a/index.html",
            $exception_list: [
                {
                    value: "open /home/jdoe/x.dots failed",
                    stacktrace: { frames: [{ lineno: 3 }] },
                },
            ],
            count: 2,
            flag: true,
            nothing: null,
        };
        const copy = structuredClone(event);
        const scrubbed = scrubUserPaths(event);
        expect(event).toEqual(copy);
        expect(scrubbed).toEqual({
            ...event,
            $current_url: "file:///C:/Users/~/a/index.html",
            $exception_list: [
                {
                    value: "open /home/~/x.dots failed",
                    stacktrace: { frames: [{ lineno: 3 }] },
                },
            ],
        });
    });

    it("returns the same objects when nothing changes", () => {
        const event = { a: ["x", { b: "y" }], c: 1 };
        expect(scrubUserPaths(event)).toBe(event);
    });
});
