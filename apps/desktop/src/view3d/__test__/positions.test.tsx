import { describe, expect, it as plainIt } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { eq } from "drizzle-orm";
import {
    Line,
    Path,
    pixelsToWorld,
    worldToPixels,
    type WorldPoint,
} from "@openmarch/core";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useManyCoordinateData } from "@/hooks/queries/useCoordinateData";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { getCoordinatesAtTime } from "@/utilities/Keyframes";
import type Page from "@/global/classes/Page";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    positionAt,
    positionAtInto,
    usePerformerTimelines,
} from "../positions";
import type { MarcherTimeline } from "@/utilities/Keyframes";

/** The editor animates with the selected page ±2 pages (useAnimation). */
const EDITOR_PAGE_DELTA = 2;
/** Marcher whose fixture move onto {@link PATHWAY_PAGE_ID} follows a pathway. */
const PATHWAY_MARCHER_ID = 1;
const PATHWAY_PAGE_ID = 3;

const pageEndMs = (page: Page) => (page.timestamp + page.duration) * 1000;

/** `positionAtInto` must give exactly what `positionAt` gives. */
const expectIntoMatches = (
    timeline: MarcherTimeline,
    ms: number,
    fp: Parameters<typeof positionAt>[2],
) => {
    const expected = positionAt(timeline, ms, fp);
    const out = { x: Number.NaN, z: Number.NaN };
    const ok = positionAtInto(timeline, ms, fp, out);
    if (expected === null) {
        expect(ok).toBe(false);
    } else {
        expect(ok).toBe(true);
        expect(out).toEqual(expected);
    }
};

const expectClose = (actual: WorldPoint | null, expected: WorldPoint) => {
    expect(actual).not.toBeNull();
    expect(actual!.x).toBeCloseTo(expected.x, 6);
    expect(actual!.z).toBeCloseTo(expected.z, 6);
};

type MarcherPageRow = { x: number; y: number };
type Fixture = {
    /** `positions[marcherId][pageId]`, from the database. */
    positions: Map<number, Map<number, MarcherPageRow>>;
    pathway: Path;
};

/**
 * The `marchersAndPages` fixture (7 pages, 76 marchers), plus one pathway:
 * marcher 1 moves onto page 3 through a detour, so its midpoint is off the
 * straight line between the two sets.
 */
async function setUpShow(
    db: DbConnection,
    marcherCount: number,
): Promise<Fixture> {
    const rows = await db.select().from(schema.marcher_pages).all();
    const positions = new Map<number, Map<number, MarcherPageRow>>();
    for (const row of rows) {
        const byPage = positions.get(row.marcher_id) ?? new Map();
        byPage.set(row.page_id, { x: row.x, y: row.y });
        positions.set(row.marcher_id, byPage);
    }
    expect(positions.size).toBe(marcherCount);

    const from = positions.get(PATHWAY_MARCHER_ID)!.get(PATHWAY_PAGE_ID - 1)!;
    const to = positions.get(PATHWAY_MARCHER_ID)!.get(PATHWAY_PAGE_ID)!;
    const detour = { x: from.x + 120, y: from.y - 200 };
    const pathway = new Path([new Line(from, detour), new Line(detour, to)]);
    const [inserted] = await db
        .insert(schema.pathways)
        .values({ path_data: pathway.toJson() })
        .returning();
    await db
        .update(schema.marcher_pages)
        .set({
            path_data_id: inserted.id,
            path_start_position: 0,
            path_end_position: 1,
        })
        .where(
            eq(
                schema.marcher_pages.id,
                rows.find(
                    (r) =>
                        r.marcher_id === PATHWAY_MARCHER_ID &&
                        r.page_id === PATHWAY_PAGE_ID,
                )!.id,
            ),
        );
    return { positions, pathway };
}

/** Renders the 3D View's hook next to the editor's own ±2-page timelines. */
function renderShow(
    wrapper: ({ children }: { children: React.ReactNode }) => JSX.Element,
    selectedPageOrder: number,
) {
    return renderHook(
        () => {
            const performers = usePerformerTimelines();
            const { pages } = useTimingObjects();
            const { data: fieldProperties } = useQuery(
                fieldPropertiesQueryOptions(),
            );
            const editor = useManyCoordinateData(
                pages.filter(
                    (p) =>
                        Math.abs(p.order - selectedPageOrder) <=
                        EDITOR_PAGE_DELTA,
                ),
            );
            return { performers, pages, fieldProperties, editor };
        },
        { wrapper },
    );
}

describeDbTests("usePerformerTimelines and positionAt", (it) => {
    it("loads one whole-show timeline per marcher", async ({
        db,
        wrapper,
        marchersAndPages,
    }) => {
        await setUpShow(db, marchersAndPages.expectedMarchers.length);
        const { result } = renderShow(wrapper, 0);
        await waitFor(() => {
            expect(result.current.performers.isLoading).toBe(false);
            expect(result.current.performers.timelines.size).toBe(
                marchersAndPages.expectedMarchers.length,
            );
        });
        expect(result.current.performers.hasError).toBe(false);
        const pageEnds = result.current.pages.map(pageEndMs);
        for (const timeline of result.current.performers.timelines.values()) {
            expect(timeline.sortedTimestamps).toEqual(pageEnds);
        }
    });

    it("matches the 2D positions at every page end", async ({
        db,
        wrapper,
        marchersAndPages,
    }) => {
        const { positions } = await setUpShow(
            db,
            marchersAndPages.expectedMarchers.length,
        );
        const { result } = renderShow(wrapper, 0);
        await waitFor(() => {
            expect(result.current.performers.timelines.size).toBeGreaterThan(0);
            expect(result.current.fieldProperties).toBeDefined();
        });
        const { performers, pages, fieldProperties } = result.current;
        const fp = fieldProperties!;

        for (const [marcherId, timeline] of performers.timelines) {
            for (const page of pages) {
                const expected = positions.get(marcherId)!.get(page.id)!;
                const actual = positionAt(timeline, pageEndMs(page), fp);
                expectClose(actual, pixelsToWorld(fp, expected));
                const backToPixels = worldToPixels(fp, actual!);
                expect(backToPixels.x).toBeCloseTo(expected.x, 6);
                expect(backToPixels.y).toBeCloseTo(expected.y, 6);
            }
        }
    });

    it("matches the editor's 2D animation mid-transition, including a pathway", async ({
        db,
        wrapper,
        marchersAndPages,
    }) => {
        const { positions, pathway } = await setUpShow(
            db,
            marchersAndPages.expectedMarchers.length,
        );
        // The editor, with page 3 selected, has pages 1–5 loaded.
        const { result } = renderShow(wrapper, PATHWAY_PAGE_ID);
        await waitFor(() => {
            expect(result.current.performers.timelines.size).toBeGreaterThan(0);
            expect(result.current.editor.isPending).toBe(false);
            expect(result.current.editor.data.size).toBeGreaterThan(0);
            expect(result.current.fieldProperties).toBeDefined();
        });
        const { performers, pages, fieldProperties, editor } = result.current;
        const fp = fieldProperties!;
        const page = pages.find((p) => p.id === PATHWAY_PAGE_ID)!;
        const previous = pages.find((p) => p.order === page.order - 1)!;

        for (const fraction of [0.25, 0.5, 0.75]) {
            const ms =
                pageEndMs(previous) +
                (pageEndMs(page) - pageEndMs(previous)) * fraction;
            for (const [marcherId, timeline] of performers.timelines) {
                const editorPixels = getCoordinatesAtTime(
                    ms,
                    editor.data.get(marcherId)!,
                )!;
                const actual = positionAt(timeline, ms, fp);
                expectClose(actual, pixelsToWorld(fp, editorPixels));

                if (marcherId === PATHWAY_MARCHER_ID) {
                    const onPath = pathway.getPointAtLength(
                        pathway.getTotalLength() * fraction,
                    );
                    expectClose(actual, pixelsToWorld(fp, onPath));
                } else {
                    const from = positions.get(marcherId)!.get(previous.id)!;
                    const to = positions.get(marcherId)!.get(page.id)!;
                    expectClose(
                        actual,
                        pixelsToWorld(fp, {
                            x: from.x + (to.x - from.x) * fraction,
                            y: from.y + (to.y - from.y) * fraction,
                        }),
                    );
                }
            }
        }

        // The pathway really bends: its midpoint is off the straight line.
        const straight = pixelsToWorld(fp, {
            x:
                (positions.get(PATHWAY_MARCHER_ID)!.get(previous.id)!.x +
                    positions.get(PATHWAY_MARCHER_ID)!.get(page.id)!.x) /
                2,
            y:
                (positions.get(PATHWAY_MARCHER_ID)!.get(previous.id)!.y +
                    positions.get(PATHWAY_MARCHER_ID)!.get(page.id)!.y) /
                2,
        });
        const mid = positionAt(
            performers.timelines.get(PATHWAY_MARCHER_ID)!,
            (pageEndMs(previous) + pageEndMs(page)) / 2,
            fp,
        )!;
        expect(
            Math.hypot(mid.x - straight.x, mid.z - straight.z),
        ).toBeGreaterThan(1);
    });

    it("covers the whole show: first page, last page and beyond the end", async ({
        db,
        wrapper,
        marchersAndPages,
    }) => {
        const { positions } = await setUpShow(
            db,
            marchersAndPages.expectedMarchers.length,
        );
        // The editor would only have pages 0–2 loaded here.
        const { result } = renderShow(wrapper, 0);
        await waitFor(() => {
            expect(result.current.performers.timelines.size).toBeGreaterThan(0);
            expect(result.current.fieldProperties).toBeDefined();
        });
        const { performers, pages, fieldProperties } = result.current;
        const fp = fieldProperties!;
        const firstPage = pages[0];
        const lastPage = pages[pages.length - 1];
        const secondToLast = pages[pages.length - 2];

        for (const [marcherId, timeline] of performers.timelines) {
            const first = pixelsToWorld(
                fp,
                positions.get(marcherId)!.get(firstPage.id)!,
            );
            const last = pixelsToWorld(
                fp,
                positions.get(marcherId)!.get(lastPage.id)!,
            );
            expectClose(positionAt(timeline, 0, fp), first);
            expectClose(positionAt(timeline, -500, fp), first);
            expectClose(positionAt(timeline, Number.NaN, fp), first);
            expectClose(positionAt(timeline, pageEndMs(lastPage), fp), last);
            expectClose(
                positionAt(timeline, pageEndMs(lastPage) + 60_000, fp),
                last,
            );
            expectClose(
                positionAt(timeline, Number.POSITIVE_INFINITY, fp),
                last,
            );

            // The last transition is far outside the editor's window around
            // page 0, and still interpolates.
            const from = positions.get(marcherId)!.get(secondToLast.id)!;
            const to = positions.get(marcherId)!.get(lastPage.id)!;
            expectClose(
                positionAt(
                    timeline,
                    (pageEndMs(secondToLast) + pageEndMs(lastPage)) / 2,
                    fp,
                ),
                pixelsToWorld(fp, {
                    x: (from.x + to.x) / 2,
                    y: (from.y + to.y) / 2,
                }),
            );
        }
    });
    it("positionAtInto matches positionAt across the whole show, including a pathway", async ({
        db,
        wrapper,
        marchersAndPages,
    }) => {
        await setUpShow(db, marchersAndPages.expectedMarchers.length);
        const { result } = renderShow(wrapper, 0);
        await waitFor(() => {
            expect(result.current.performers.timelines.size).toBe(
                marchersAndPages.expectedMarchers.length,
            );
            expect(result.current.fieldProperties).toBeDefined();
        });
        const { performers, pages, fieldProperties } = result.current;
        const fp = fieldProperties!;
        const ends = pages.map(pageEndMs);
        const times = [
            Number.NaN,
            Number.NEGATIVE_INFINITY,
            -500,
            0,
            ...ends,
            ...ends
                .slice(1)
                .flatMap((end, i) =>
                    [0.001, 0.25, 0.5, 0.75, 0.999].map(
                        (f) => ends[i] + (end - ends[i]) * f,
                    ),
                ),
            ends[ends.length - 1] + 60_000,
            Number.POSITIVE_INFINITY,
        ];
        expect(
            performers.timelines
                .get(PATHWAY_MARCHER_ID)!
                .pathMap.get(
                    ends[pages.findIndex((p) => p.id === PATHWAY_PAGE_ID)],
                )?.path,
        ).toBeDefined();
        for (const timeline of performers.timelines.values()) {
            for (const ms of times) expectIntoMatches(timeline, ms, fp);
        }
    });
});

describe("positionAt", () => {
    const fp = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_WITH_END_ZONES;

    plainIt("returns null for a timeline with no keyframes", () => {
        expect(
            positionAt({ pathMap: new Map(), sortedTimestamps: [] }, 0, fp),
        ).toBeNull();
    });

    plainIt("puts the center front point at the world origin", () => {
        const center = {
            x: fp.centerFrontPoint.xPixels,
            y: fp.centerFrontPoint.yPixels,
        };
        const timeline = {
            pathMap: new Map([[1000, center]]),
            sortedTimestamps: [1000],
        };
        expectClose(positionAt(timeline, 5000, fp), { x: 0, z: 0 });
    });

    plainIt(
        "positionAtInto returns false for a timeline with no keyframes",
        () => {
            const out = { x: 7, z: 8 };
            expect(
                positionAtInto(
                    { pathMap: new Map(), sortedTimestamps: [] },
                    0,
                    fp,
                    out,
                ),
            ).toBe(false);
            expect(out).toEqual({ x: 7, z: 8 });
        },
    );

    plainIt(
        "positionAtInto matches positionAt on random straight moves",
        () => {
            // A small deterministic generator, so a failure is reproducible.
            let seed = 12345;
            const rand = () => {
                seed = (seed * 1103515245 + 12345) % 2147483648;
                return seed / 2147483648;
            };
            for (let t = 0; t < 50; t++) {
                const sortedTimestamps: number[] = [];
                let ms = Math.floor(rand() * 2000);
                const keyframes = 1 + Math.floor(rand() * 8);
                for (let k = 0; k < keyframes; k++) {
                    sortedTimestamps.push(ms);
                    ms += 1 + Math.floor(rand() * 4000);
                }
                const timeline: MarcherTimeline = {
                    sortedTimestamps,
                    pathMap: new Map(
                        sortedTimestamps.map((s) => [
                            s,
                            { x: rand() * 1600, y: rand() * 850 },
                        ]),
                    ),
                };
                const end = sortedTimestamps[sortedTimestamps.length - 1];
                for (let i = 0; i < 40; i++) {
                    expectIntoMatches(
                        timeline,
                        rand() * (end + 3000) - 1000,
                        fp,
                    );
                }
                for (const s of sortedTimestamps)
                    expectIntoMatches(timeline, s, fp);
            }
        },
    );
});
