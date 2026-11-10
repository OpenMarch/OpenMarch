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
];
