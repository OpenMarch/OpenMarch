/**
 * TEMPORARY (see host.ts). The shows the preview offers, from
 * `public/demos/`. They are real shows: never merge them into
 * `OpenMarch/OpenMarch`.
 */
export interface Demo {
    id: string;
    name: string;
    file: string;
}

export const DEMOS: Demo[] = [
    { id: "part1", name: "Part 1 Demo", file: "demos/part1-demo.dots" },
];
