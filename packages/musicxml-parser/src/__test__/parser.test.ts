import { describe, expect, it } from "vitest";
import { parseMusicXml, type Measure } from "../parser";

// "it" is the same as "test"
it("dummy test", () => {
    // Dummy test to make sure the test suite is working
    expect(parseMusicXml("<score>")).toEqual([]);
});

describe("real tests", () => {
    // It would be smart to write smaller tests for each tempo change section
    it("Full Score", async () => {
        const musicXmlText = await import("fs/promises").then((fs) =>
            fs.readFile("src/__test__/assets/Test Score.musicxml", "utf-8"),
        );
        const bpm144 = 60 / 144;
        const hn80 = 60 / (80 * 2);
        const bpm120 = 60 / 120;
        const bpm180 = 60 / 180;
        const bpm90 = 60 / 90;
        const expectedMeasures: Measure[] = [
            {
                number: 1,
                beats: [
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                ],
            },
            {
                number: 2,
                beats: [
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                ],
            },
            {
                number: 3,
                beats: [
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                ],
            },
            {
                number: 4,
                beats: [
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                    {
                        duration: bpm144,
                    },
                ],
            },
            {
                number: 5,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },
            {
                number: 6,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },
            {
                number: 7,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },
            {
                number: 8,
                rehearsalMark: "A",
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },

            {
                number: 9,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },

            {
                number: 10,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },

            {
                number: 11,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },

            {
                number: 12,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },

            {
                number: 13,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },

            {
                number: 14,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },

            {
                number: 15,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },

            {
                number: 16,
                beats: [
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                    {
                        duration: hn80,
                    },
                ],
            },
            {
                number: 17,
                beats: [
                    {
                        duration: bpm120,
                    },
                    {
                        duration: bpm120,
                    },
                ],
            },
            {
                number: 18,
                rehearsalMark: "152",
                beats: [
                    {
                        duration: bpm120,
                    },
                    {
                        duration: bpm120,
                    },
                ],
            },
            {
                number: 19,
                beats: [
                    {
                        duration: bpm120,
                    },
                    {
                        duration: bpm120,
                    },
                ],
            },
            {
                number: 20,
                beats: [
                    {
                        duration: bpm120,
                    },
                    {
                        duration: bpm120,
                    },
                ],
            },
            {
                number: 21,
                beats: [
                    {
                        duration: bpm120,
                    },
                    {
                        duration: bpm120,
                    },
                ],
            },
            {
                number: 22,
                beats: [
                    {
                        duration: bpm120,
                    },
                    {
                        duration: bpm120,
                    },
                ],
            },
            {
                number: 23,
                beats: [
                    {
                        duration: bpm120,
                    },
                    {
                        duration: bpm120,
                    },
                ],
            },
            {
                number: 24,
                rehearsalMark: "jeff",
                beats: [
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                ],
            },
            {
                number: 25,
                beats: [
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                ],
            },
            {
                number: 26,
                beats: [
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                ],
            },
            {
                number: 27,
                beats: [
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                ],
            },
            {
                number: 28,
                beats: [
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                ],
            },
            {
                number: 29,
                beats: [
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                ],
            },
            {
                number: 30,
                beats: [
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                ],
            },
            {
                number: 31,
                beats: [
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                ],
            },
            {
                number: 32,
                beats: [
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                ],
            },
            {
                number: 33,
                beats: [
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                ],
            },
            {
                number: 34,
                beats: [
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                ],
            },
            {
                number: 35,
                beats: [
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                ],
            },
            {
                number: 36,
                beats: [
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                ],
            },
            {
                number: 37,
                beats: [
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                ],
            },
            {
                number: 38,
                beats: [
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                    {
                        duration: bpm180,
                    },
                ],
            },
            {
                number: 39,
                beats: [
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                ],
            },
            {
                number: 40,
                beats: [
                    {
                        duration: bpm90,
                    },
                    {
                        duration: bpm90,
                    },
                ],
            },
        ];
        expect(parseMusicXml(musicXmlText)).toEqual(expectedMeasures);
    });
});
