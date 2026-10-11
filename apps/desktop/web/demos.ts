/**
 * TEMPORARY (see README.md). The shows the start screen offers, from
 * `public/demos/`. They are real shows: never merge them into OpenMarch's
 * `main`. Cloudflare rejects files over 25 MiB, embedded music included.
 */
export interface Demo {
    id: string;
    name: string;
    file: string;
}

export const DEMOS: Demo[] = [
    { id: "part1", name: "Part 1 Demo", file: "demos/part1-demo.dots" },
    {
        id: "lhb-daft-punk",
        name: "LHB '26 – Daft Punk pt. 2",
        file: "demos/lhb-daft-punk-pt2.dots",
    },
];
