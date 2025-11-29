import {
    _calculateMapAllTagAppearanceIdsByPageId,
    TagAppearanceIdsByPageId,
} from "../tag";
import { describe, expect, it } from "vitest";
import { DatabaseTagAppearance } from "@/db-functions";
import * as fc from "fast-check";

describe("_calculateMapAllTagAppearanceIdsByPageId", () => {
    describe("single page tags", () => {
        it("should correctly map tags to all pages if one is on the first page", () => {
            const numberOfPages = 111;
            const numberOfTags = 97;
            const pages = Array.from({ length: numberOfPages }).map((_, i) => ({
                id: i,
            }));
            const tagAppearances = Array.from({ length: numberOfTags }).map(
                (_, i) => ({
                    tag_id: i + 1,
                    id: i + 1,
                    start_page_id: pages[0].id, // only one tag on the first page
                }),
            );

            const expected = new Map();
            const expectedTagAppearanceIds = new Set(
                tagAppearances.map((ta) => ta.id),
            );
            for (const page of pages) {
                // each page should have the same tag appearance
                expected.set(page.id, expectedTagAppearanceIds);
            }

            const actual = _calculateMapAllTagAppearanceIdsByPageId({
                tagAppearances,
                pagesInOrder: pages,
            });

            expect(
                actual.size,
                "result map should have the same number of pages as the input pages",
            ).toEqual(pages.length);

            expect(actual).toEqual(expected);
        });

        it("should correctly map tags to remaining pages if not on the first page", () => {
            const numberOfPages = 107;
            const startPageIndex = 49;
            const numberOfTags = 88;
            const pages = Array.from({ length: numberOfPages }).map((_, i) => ({
                id: i,
            }));
            const tagAppearances = Array.from({ length: numberOfTags }).map(
                (_, i) => ({
                    tag_id: i + 1,
                    id: i + 1,
                    start_page_id: pages[startPageIndex].id, // only one tag on the first page
                }),
            );

            const expected = new Map();
            const expectedTagAppearanceIds = new Set(
                tagAppearances.map((ta) => ta.id),
            );
            for (let i = 0; i < numberOfPages; i++) {
                if (i < startPageIndex) {
                    expected.set(pages[i].id, new Set());
                } else {
                    expected.set(pages[i].id, expectedTagAppearanceIds);
                }
            }

            const actual = _calculateMapAllTagAppearanceIdsByPageId({
                tagAppearances,
                pagesInOrder: pages,
            });

            expect(
                actual.size,
                "result map should have the same number of pages as the input pages",
            ).toEqual(pages.length);

            expect(actual).toEqual(expected);
        });
    });
    describe("sequential page tags", () => {
        it("should correctly map a single tag with many appearances", () => {
            const numberOfPages = 1000;
            const pages = Array.from({ length: numberOfPages }).map((_, i) => ({
                id: i + 1,
            }));
            const tagAppearances = Array.from({ length: numberOfPages }).map(
                (_, i) => ({
                    tag_id: 1,
                    id: i + 1,
                    start_page_id: i + 1,
                }),
            );

            const expected: TagAppearanceIdsByPageId = new Map(
                Array.from({ length: numberOfPages }).map((_, i) => [
                    i + 1,
                    new Set([i + 1]),
                ]),
            );

            const actual = _calculateMapAllTagAppearanceIdsByPageId({
                tagAppearances,
                pagesInOrder: pages,
            });

            expect(actual).toEqual(expected);
        });

        it("should correctly map a multiple tags with many appearances", () => {
            const numberOfPages = 123;
            const numberOfTags = 71;

            const pages = Array.from({ length: numberOfPages }).map((_, i) => ({
                id: i,
            }));
            // Create tag appearances for each page and tag
            const tagAppearances: Pick<
                DatabaseTagAppearance,
                "id" | "tag_id" | "start_page_id"
            >[] = [];
            for (let i = 0; i < numberOfPages; i++) {
                for (let j = 0; j < numberOfTags; j++) {
                    tagAppearances.push({
                        id: i * numberOfTags + j + 1,
                        tag_id: j + 1,
                        start_page_id: i,
                    });
                }
            }

            const expected: TagAppearanceIdsByPageId = new Map(
                Array.from({ length: numberOfPages }).map((_, i) => [
                    i,
                    new Set(
                        tagAppearances
                            .filter((ta) => ta.start_page_id === i)
                            .map((ta) => ta.id),
                    ),
                ]),
            );

            const actual = _calculateMapAllTagAppearanceIdsByPageId({
                tagAppearances,
                pagesInOrder: pages,
            });

            expect(actual).toEqual(expected);
        });
    });

    describe("property-based tests with fast-check", () => {
        describe("invariants that should always hold", () => {
            it("every page should be present in the output map", () => {
                fc.assert(
                    fc.property(
                        fc.uniqueArray(fc.nat({ max: 1000 }), {
                            minLength: 1,
                            maxLength: 100,
                        }),
                        fc.array(
                            fc.record({
                                tag_id: fc.integer({ min: 1, max: 20 }),
                                id: fc.integer({ min: 1 }),
                                start_page_id: fc.nat({ max: 1000 }),
                            }),
                            { maxLength: 200 },
                        ),
                        (pageIds, tagAppearances) => {
                            const pages = pageIds.map((id) => ({ id }));
                            const actual =
                                _calculateMapAllTagAppearanceIdsByPageId({
                                    tagAppearances,
                                    pagesInOrder: pages,
                                });

                            // Every page should be in the output
                            expect(actual.size).toEqual(pages.length);
                            pages.forEach((page) => {
                                expect(actual.has(page.id)).toBe(true);
                            });
                        },
                    ),
                    { numRuns: 100 },
                );
            });

            it("each page should only have tag appearance IDs that exist in input", () => {
                fc.assert(
                    fc.property(
                        fc.uniqueArray(fc.integer({ min: 0, max: 100 }), {
                            minLength: 1,
                            maxLength: 50,
                        }),
                        fc.array(
                            fc.record({
                                tag_id: fc.integer({ min: 1, max: 10 }),
                                id: fc.integer({ min: 1, max: 500 }),
                                start_page_id: fc.integer({ min: 0, max: 100 }),
                            }),
                            { maxLength: 100 },
                        ),
                        (pageIds, tagAppearances) => {
                            const pages = pageIds.map((id) => ({ id }));
                            const validAppearanceIds = new Set(
                                tagAppearances.map((ta) => ta.id),
                            );

                            const actual =
                                _calculateMapAllTagAppearanceIdsByPageId({
                                    tagAppearances,
                                    pagesInOrder: pages,
                                });

                            // Every tag appearance ID in the output should exist in the input
                            actual.forEach((appearanceIds) => {
                                appearanceIds.forEach((id) => {
                                    expect(validAppearanceIds.has(id)).toBe(
                                        true,
                                    );
                                });
                            });
                        },
                    ),
                    { numRuns: 100 },
                );
            });

            it("tag appearances should never appear before their start page", () => {
                fc.assert(
                    fc.property(
                        fc.uniqueArray(fc.integer({ min: 0, max: 100 }), {
                            minLength: 1,
                            maxLength: 50,
                        }),
                        fc.array(
                            fc.record({
                                tag_id: fc.integer({ min: 1, max: 10 }),
                                id: fc.integer({ min: 1, max: 500 }),
                                start_page_id: fc.integer({ min: 0, max: 100 }),
                            }),
                            { maxLength: 100 },
                        ),
                        (pageIds, tagAppearances) => {
                            const pages = pageIds.map((id) => ({ id }));
                            const pageIdToOrder: Record<number, number> = {};
                            pages.forEach((page, index) => {
                                pageIdToOrder[page.id] = index;
                            });

                            const actual =
                                _calculateMapAllTagAppearanceIdsByPageId({
                                    tagAppearances,
                                    pagesInOrder: pages,
                                });

                            // For each tag appearance, it should not appear on pages before its start page
                            tagAppearances.forEach((appearance) => {
                                const startOrder =
                                    pageIdToOrder[appearance.start_page_id];
                                if (startOrder === undefined) return;

                                pages.forEach((page, pageOrder) => {
                                    const appearanceIds = actual.get(page.id);
                                    if (!appearanceIds) return;

                                    if (pageOrder < startOrder) {
                                        expect(
                                            appearanceIds.has(appearance.id),
                                        ).toBe(false);
                                    }
                                });
                            });
                        },
                    ),
                    { numRuns: 100 },
                );
            });
        });

        describe("multiple appearances of same tag", () => {
            it("should handle tags with multiple appearances where each appearance covers different page ranges", () => {
                fc.assert(
                    fc.property(
                        fc.integer({ min: 10, max: 100 }),
                        fc.integer({ min: 2, max: 10 }),
                        fc.integer({ min: 2, max: 20 }),
                        (numPages, numTags, appearancesPerTag) => {
                            const pages = Array.from({ length: numPages }).map(
                                (_, i) => ({ id: i }),
                            );

                            // Create multiple appearances for each tag
                            const tagAppearances: Pick<
                                DatabaseTagAppearance,
                                "id" | "tag_id" | "start_page_id"
                            >[] = [];
                            let appearanceId = 1;

                            for (let tagId = 1; tagId <= numTags; tagId++) {
                                // Create multiple appearances for this tag, evenly distributed
                                const step = Math.floor(
                                    numPages / appearancesPerTag,
                                );
                                for (let i = 0; i < appearancesPerTag; i++) {
                                    const startPageIndex = Math.min(
                                        i * step,
                                        numPages - 1,
                                    );
                                    tagAppearances.push({
                                        id: appearanceId++,
                                        tag_id: tagId,
                                        start_page_id: startPageIndex,
                                    });
                                }
                            }

                            const actual =
                                _calculateMapAllTagAppearanceIdsByPageId({
                                    tagAppearances,
                                    pagesInOrder: pages,
                                });

                            // Verify that each page has the correct appearances
                            // Group appearances by tag_id for verification
                            const appearancesByTag: Record<
                                number,
                                typeof tagAppearances
                            > = {};
                            tagAppearances.forEach((appearance) => {
                                if (!appearancesByTag[appearance.tag_id]) {
                                    appearancesByTag[appearance.tag_id] = [];
                                }
                                appearancesByTag[appearance.tag_id].push(
                                    appearance,
                                );
                            });

                            // For each tag with multiple appearances, verify the transition logic
                            Object.values(appearancesByTag).forEach(
                                (appearances) => {
                                    if (appearances.length < 2) return;

                                    const sortedAppearances = [
                                        ...appearances,
                                    ].sort((a, b) => {
                                        const orderA = pages.findIndex(
                                            (p) => p.id === a.start_page_id,
                                        );
                                        const orderB = pages.findIndex(
                                            (p) => p.id === b.start_page_id,
                                        );
                                        return orderA - orderB;
                                    });

                                    // Verify that each appearance appears only in its designated range
                                    for (
                                        let i = 0;
                                        i < sortedAppearances.length;
                                        i++
                                    ) {
                                        const currentAppearance =
                                            sortedAppearances[i];
                                        const nextAppearance =
                                            sortedAppearances[i + 1];

                                        const startIndex = pages.findIndex(
                                            (p) =>
                                                p.id ===
                                                currentAppearance.start_page_id,
                                        );
                                        const endIndex = nextAppearance
                                            ? pages.findIndex(
                                                  (p) =>
                                                      p.id ===
                                                      nextAppearance.start_page_id,
                                              )
                                            : pages.length;

                                        // Check pages in range should have this appearance
                                        for (
                                            let j = startIndex;
                                            j < endIndex;
                                            j++
                                        ) {
                                            const pageAppearances = actual.get(
                                                pages[j].id,
                                            );
                                            expect(
                                                pageAppearances?.has(
                                                    currentAppearance.id,
                                                ),
                                            ).toBe(true);
                                        }

                                        // Check pages after the next appearance should NOT have this appearance
                                        if (nextAppearance) {
                                            for (
                                                let j = endIndex;
                                                j < pages.length;
                                                j++
                                            ) {
                                                const pageAppearances =
                                                    actual.get(pages[j].id);
                                                expect(
                                                    pageAppearances?.has(
                                                        currentAppearance.id,
                                                    ),
                                                ).toBe(false);
                                            }
                                        }
                                    }
                                },
                            );
                        },
                    ),
                    { numRuns: 50 },
                );
            });

            it("should correctly handle a tag with 2-5 random appearances", () => {
                fc.assert(
                    fc.property(
                        fc.integer({ min: 20, max: 100 }),
                        fc.integer({ min: 2, max: 5 }),
                        (numPages, numAppearances) => {
                            const pages = Array.from({ length: numPages }).map(
                                (_, i) => ({ id: i }),
                            );

                            // Generate random start pages for appearances (sorted)
                            const startPages = fc
                                .sample(
                                    fc.uniqueArray(
                                        fc.integer({
                                            min: 0,
                                            max: numPages - 1,
                                        }),
                                        {
                                            minLength: numAppearances,
                                            maxLength: numAppearances,
                                        },
                                    ),
                                    1,
                                )[0]
                                .sort((a, b) => a - b);

                            const tagAppearances = startPages.map(
                                (startPage, idx) => ({
                                    id: idx + 1,
                                    tag_id: 1,
                                    start_page_id: startPage,
                                }),
                            );

                            const actual =
                                _calculateMapAllTagAppearanceIdsByPageId({
                                    tagAppearances,
                                    pagesInOrder: pages,
                                });

                            // Verify that appearances transition correctly
                            for (let i = 0; i < tagAppearances.length; i++) {
                                const currentAppearance = tagAppearances[i];
                                const nextAppearance = tagAppearances[i + 1];

                                const startIdx =
                                    currentAppearance.start_page_id;
                                const endIdx = nextAppearance
                                    ? nextAppearance.start_page_id
                                    : numPages;

                                // Pages in range should have current appearance
                                for (
                                    let pageIdx = startIdx;
                                    pageIdx < endIdx;
                                    pageIdx++
                                ) {
                                    const appearances = actual.get(pageIdx);
                                    expect(
                                        appearances?.has(currentAppearance.id),
                                    ).toBe(true);
                                }

                                // Pages before start should not have current appearance
                                for (
                                    let pageIdx = 0;
                                    pageIdx < startIdx;
                                    pageIdx++
                                ) {
                                    const appearances = actual.get(pageIdx);
                                    expect(
                                        appearances?.has(currentAppearance.id),
                                    ).toBe(false);
                                }
                            }
                        },
                    ),
                    { numRuns: 100 },
                );
            });
        });

        describe("different tags starting on different pages", () => {
            it("should handle random tags starting on random pages", () => {
                fc.assert(
                    fc.property(
                        fc.integer({ min: 5, max: 100 }),
                        fc.integer({ min: 1, max: 50 }),
                        (numPages, numTags) => {
                            const pages = Array.from({ length: numPages }).map(
                                (_, i) => ({ id: i }),
                            );

                            // Each tag starts on a random page
                            const tagAppearances = fc.sample(
                                fc.record({
                                    tag_id: fc.integer({
                                        min: 1,
                                        max: numTags,
                                    }),
                                    id: fc.integer({ min: 1, max: 10000 }),
                                    start_page_id: fc.integer({
                                        min: 0,
                                        max: numPages - 1,
                                    }),
                                }),
                                numTags,
                            );

                            const actual =
                                _calculateMapAllTagAppearanceIdsByPageId({
                                    tagAppearances,
                                    pagesInOrder: pages,
                                });

                            // Verify basic invariants
                            expect(actual.size).toEqual(numPages);

                            // Each tag appearance should appear from its start page onwards
                            tagAppearances.forEach((appearance) => {
                                const startIdx = pages.findIndex(
                                    (p) => p.id === appearance.start_page_id,
                                );
                                if (startIdx === -1) return;

                                // Should appear on all pages from start onwards (unless superseded by same tag)
                                const sameTagAppearances =
                                    tagAppearances.filter(
                                        (ta) => ta.tag_id === appearance.tag_id,
                                    );
                                const sortedSameTag = [
                                    ...sameTagAppearances,
                                ].sort((a, b) => {
                                    const aIdx = pages.findIndex(
                                        (p) => p.id === a.start_page_id,
                                    );
                                    const bIdx = pages.findIndex(
                                        (p) => p.id === b.start_page_id,
                                    );
                                    return aIdx - bIdx;
                                });

                                const appearanceIndex = sortedSameTag.findIndex(
                                    (ta) => ta.id === appearance.id,
                                );
                                const nextSameTagAppearance =
                                    sortedSameTag[appearanceIndex + 1];
                                const endIdx = nextSameTagAppearance
                                    ? pages.findIndex(
                                          (p) =>
                                              p.id ===
                                              nextSameTagAppearance.start_page_id,
                                      )
                                    : numPages;

                                for (let i = startIdx; i < endIdx; i++) {
                                    const pageAppearances = actual.get(
                                        pages[i].id,
                                    );
                                    expect(
                                        pageAppearances?.has(appearance.id),
                                    ).toBe(true);
                                }
                            });
                        },
                    ),
                    { numRuns: 100 },
                );
            });

            it("should handle multiple tags each with multiple appearances starting on random pages", () => {
                fc.assert(
                    fc.property(
                        fc.integer({ min: 20, max: 80 }),
                        fc.integer({ min: 2, max: 15 }),
                        fc.integer({ min: 1, max: 5 }),
                        (numPages, numTags, maxAppearancesPerTag) => {
                            const pages = Array.from({ length: numPages }).map(
                                (_, i) => ({ id: i }),
                            );
                            const tagAppearances: Pick<
                                DatabaseTagAppearance,
                                "id" | "tag_id" | "start_page_id"
                            >[] = [];
                            let appearanceId = 1;

                            // For each tag, create 1 to maxAppearancesPerTag appearances
                            for (let tagId = 1; tagId <= numTags; tagId++) {
                                const numAppearances = fc.sample(
                                    fc.integer({
                                        min: 1,
                                        max: maxAppearancesPerTag,
                                    }),
                                    1,
                                )[0];

                                // Generate unique random start pages for this tag
                                const startPages = fc
                                    .sample(
                                        fc.uniqueArray(
                                            fc.integer({
                                                min: 0,
                                                max: numPages - 1,
                                            }),
                                            {
                                                minLength: Math.min(
                                                    numAppearances,
                                                    numPages,
                                                ),
                                                maxLength: Math.min(
                                                    numAppearances,
                                                    numPages,
                                                ),
                                            },
                                        ),
                                        1,
                                    )[0]
                                    .sort((a, b) => a - b);

                                for (const startPage of startPages) {
                                    tagAppearances.push({
                                        id: appearanceId++,
                                        tag_id: tagId,
                                        start_page_id: startPage,
                                    });
                                }
                            }

                            const actual =
                                _calculateMapAllTagAppearanceIdsByPageId({
                                    tagAppearances,
                                    pagesInOrder: pages,
                                });

                            // Verify result structure
                            expect(actual.size).toEqual(numPages);

                            // Group by tag to verify appearance transitions
                            const appearancesByTag: Record<
                                number,
                                typeof tagAppearances
                            > = {};
                            tagAppearances.forEach((appearance) => {
                                if (!appearancesByTag[appearance.tag_id]) {
                                    appearancesByTag[appearance.tag_id] = [];
                                }
                                appearancesByTag[appearance.tag_id].push(
                                    appearance,
                                );
                            });

                            // For each tag, verify that appearances don't overlap incorrectly
                            Object.entries(appearancesByTag).forEach(
                                ([, appearances]) => {
                                    // On any given page, only one appearance of this tag should be present
                                    pages.forEach((page) => {
                                        const pageAppearances = actual.get(
                                            page.id,
                                        );
                                        if (!pageAppearances) return;

                                        const thisTagAppearances = Array.from(
                                            pageAppearances,
                                        ).filter((id) =>
                                            appearances.some(
                                                (ta) => ta.id === id,
                                            ),
                                        );

                                        // Should have at most 1 appearance of this tag on this page
                                        expect(
                                            thisTagAppearances.length,
                                        ).toBeLessThanOrEqual(1);
                                    });
                                },
                            );
                        },
                    ),
                    { numRuns: 50 },
                );
            });
        });

        describe("edge cases with property-based testing", () => {
            it("should handle empty tag appearances", () => {
                fc.assert(
                    fc.property(
                        fc.array(fc.integer({ min: 0, max: 100 }), {
                            minLength: 1,
                            maxLength: 50,
                        }),
                        (pageIds) => {
                            const pages = pageIds.map((id) => ({ id }));
                            const actual =
                                _calculateMapAllTagAppearanceIdsByPageId({
                                    tagAppearances: [],
                                    pagesInOrder: pages,
                                });

                            // All pages should have empty sets
                            pages.forEach((page) => {
                                expect(actual.get(page.id)?.size).toBe(0);
                            });
                        },
                    ),
                    { numRuns: 50 },
                );
            });

            it("should handle tag appearances with non-existent page IDs", () => {
                fc.assert(
                    fc.property(
                        fc.integer({ min: 5, max: 50 }),
                        fc.integer({ min: 1, max: 20 }),
                        (numPages, numBadAppearances) => {
                            const pages = Array.from({ length: numPages }).map(
                                (_, i) => ({ id: i }),
                            );
                            const maxPageId = Math.max(
                                ...pages.map((p) => p.id),
                            );

                            // Create appearances with page IDs that don't exist
                            const tagAppearances = Array.from({
                                length: numBadAppearances,
                            }).map((_, i) => ({
                                id: i + 1,
                                tag_id: i + 1,
                                start_page_id: maxPageId + i + 1, // Non-existent page ID
                            }));

                            const actual =
                                _calculateMapAllTagAppearanceIdsByPageId({
                                    tagAppearances,
                                    pagesInOrder: pages,
                                });

                            // All pages should have empty sets since no valid appearances
                            pages.forEach((page) => {
                                expect(actual.get(page.id)?.size).toBe(0);
                            });
                        },
                    ),
                    { numRuns: 50 },
                );
            });
        });
    });
});
