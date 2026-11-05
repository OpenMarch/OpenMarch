import { describe, expect, it } from "vitest";
import { parseSeconds } from "../musicTime";

describe("parseSeconds", () => {
    it.each([
        ["3.25", 3.25],
        ["  3,25 ", 3.25],
        [".5", 0.5],
        ["-1.5", -1.5],
        ["00:03.250", 3.25],
        ["1:02", 62],
        ["-00:01.5", -1.5],
        ["0", 0],
    ])("reads %j as %d", (text, seconds) => {
        expect(parseSeconds(text)).toBeCloseTo(seconds, 9);
    });

    it.each(["", "abc", "1:75", "1:2:3", "--1", "3 s"])(
        "refuses %j",
        (text) => {
            expect(parseSeconds(text)).toBeNull();
        },
    );
});
