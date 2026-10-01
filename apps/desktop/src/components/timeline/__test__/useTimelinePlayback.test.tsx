import { act, renderHook, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { describeDbTests, type DbConnection, schema } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import type Page from "@/global/classes/Page";
import { useTimingObjects } from "@/hooks";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    pageAtBeat,
    pageForSeek,
    pageForNavigation,
    useTimelinePlayback,
} from "../useTimelinePlayback";

/**
 * The timeline's adapter onto the existing playback clock (P8.1): the cursor while paused, and
 * seeking, page navigation and play/pause through the selected page and IsPlayingContext.
 */

/** Pages as `fromDatabasePages` builds them: page 0 holds only the fixed beat 0. */
const pagesStartingAt = (...starts: number[]) =>
    starts.map(
        (start, index) =>
            ({
                id: index + 1,
                beats: [{ index: start }],
            }) as unknown as Page,
    );

describe("pageAtBeat", () => {
    const pages = pagesStartingAt(0, 1, 9);

    it("finds the page whose beats contain the beat", () => {
        expect(pageAtBeat(pages, 0)?.id).toBe(1);
        expect(pageAtBeat(pages, 1)?.id).toBe(2);
        expect(pageAtBeat(pages, 8)?.id).toBe(2);
        expect(pageAtBeat(pages, 9)?.id).toBe(3);
        expect(pageAtBeat(pages, 40)?.id).toBe(3);
    });

    it("returns null before the first page or without pages", () => {
        expect(pageAtBeat(pagesStartingAt(1), 0)).toBeNull();
        expect(pageAtBeat([], 3)).toBeNull();
    });
});

describe("pageForSeek", () => {
    const pages = pagesStartingAt(0, 1, 9);

    it("selects the page whose move contains or ends at the line", () => {
        // Page 0 holds beat 0 and ends at line 1; page 1 is [1, 9); page 2 starts at 9
        expect(pageForSeek(pages, 0)?.id).toBe(1);
        expect(pageForSeek(pages, 1)?.id).toBe(1);
        expect(pageForSeek(pages, 2)?.id).toBe(2);
        expect(pageForSeek(pages, 9)?.id).toBe(2);
        expect(pageForSeek(pages, 10)?.id).toBe(3);
    });
});

describe("pageForNavigation", () => {
    const pages = pagesStartingAt(0, 1, 9);

    it("moves to the adjacent page and to either end", () => {
        expect(pageForNavigation(pages, pages[1]!, "next-page")?.id).toBe(3);
        expect(pageForNavigation(pages, pages[1]!, "previous-page")?.id).toBe(
            1,
        );
        expect(pageForNavigation(pages, pages[1]!, "first-page")?.id).toBe(1);
        expect(pageForNavigation(pages, null, "last-page")?.id).toBe(3);
    });

    it("stays put past either end or with nothing selected", () => {
        expect(pageForNavigation(pages, pages[2]!, "next-page")).toBeNull();
        expect(pageForNavigation(pages, pages[0]!, "previous-page")).toBeNull();
        expect(pageForNavigation(pages, null, "next-page")).toBeNull();
        expect(pageForNavigation([], null, "first-page")).toBeNull();
    });
});

/** Beats 1..16 of 0.5 s after the fixed beat 0; page 1 starts at beat 1 and page 2 at beat 9. */
const seedShow = (db: DbConnection) =>
    transactionWithHistory(db, "seedShow", async (tx) => {
        await tx.insert(schema.beats).values(
            Array.from({ length: 16 }, (_, i) => ({
                id: i + 1,
                position: i + 1,
                duration: 0.5,
            })),
        );
        await tx.insert(schema.pages).values([
            { id: 1, start_beat: 1 },
            { id: 2, start_beat: 9 },
        ]);
    });

describeDbTests("useTimelinePlayback", (it) => {
    const renderPlayback = (wrapper: ComponentType<{ children: ReactNode }>) =>
        renderHook(
            () => {
                const { beats, pages } = useTimingObjects()!;
                return {
                    pages,
                    playback: useTimelinePlayback({ beats, pages }),
                    selected: useSelectedPage()!,
                    playing: useIsPlaying()!,
                };
            },
            { wrapper },
        );

    it("puts the paused cursor at the selected page's end beat", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));

        expect(result.current.playback.positionBeat).toBe(0);
        act(() => {
            result.current.selected.setSelectedPage({ id: 1 });
        });
        expect(result.current.playback.positionBeat).toBe(9);
        act(() => {
            result.current.selected.setSelectedPage({ id: 2 });
        });
        expect(result.current.playback.positionBeat).toBe(17);
        act(() => {
            result.current.selected.setSelectedPage({ id: 0 });
        });
        expect(result.current.playback.positionBeat).toBe(1);
    });

    it("seeks and navigates by selecting pages, and only while paused", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));

        act(() => {
            result.current.playback.onSeek!(12);
        });
        expect(result.current.selected.selectedPage?.id).toBe(2);
        act(() => {
            result.current.playback.onSeek!(2);
        });
        expect(result.current.selected.selectedPage?.id).toBe(1);
        act(() => {
            result.current.playback.onNavigate!("previous-page");
        });
        expect(result.current.selected.selectedPage?.id).toBe(0);
        act(() => {
            result.current.playback.onNavigate!("last-page");
        });
        expect(result.current.selected.selectedPage?.id).toBe(2);

        act(() => {
            result.current.playing.setIsPlaying(true);
        });
        act(() => {
            result.current.playback.onSeek!(1);
        });
        act(() => {
            result.current.playback.onNavigate!("first-page");
        });
        expect(result.current.selected.selectedPage?.id).toBe(2);
    });

    it("keeps the selection when seeking to the paused cursor", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));

        for (const id of [0, 1, 2]) {
            act(() => {
                result.current.selected.setSelectedPage({ id });
            });
            const cursor = result.current.playback.positionBeat;
            expect(cursor).toBe(
                pageEndBeat(result.current.selected.selectedPage!),
            );
            act(() => {
                result.current.playback.onSeek!(cursor);
            });
            expect(result.current.selected.selectedPage?.id).toBe(id);
            expect(result.current.playback.positionBeat).toBe(cursor);
        }
    });

    it("selects the page whose move a mid-page seek lands in", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));

        // Page 1 moves over [1, 9); a seek to line 5 selects it and the cursor goes to its end
        act(() => {
            result.current.playback.onSeek!(5);
        });
        expect(result.current.selected.selectedPage?.id).toBe(1);
        expect(result.current.playback.positionBeat).toBe(9);
        // Line 10 is inside page 2's move
        act(() => {
            result.current.playback.onSeek!(10);
        });
        expect(result.current.selected.selectedPage?.id).toBe(2);
        expect(result.current.playback.positionBeat).toBe(17);
    });

    it("names the selected page while paused, not the page under the cursor", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));

        act(() => {
            result.current.selected.setSelectedPage({ id: 1 });
        });
        // The cursor is at beat 9, page 2's first beat, but page 1 is selected
        expect(result.current.playback.positionBeat).toBe(9);
        expect(result.current.playback.pageLabel).toBe(
            result.current.selected.selectedPage!.name,
        );

        act(() => {
            result.current.playing.setIsPlaying(true);
        });
        expect(result.current.playback.pageLabel).toBeUndefined();
    });

    it("plays only from a page with a next page, and always pauses", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));

        act(() => {
            result.current.selected.setSelectedPage({ id: 2 });
        });
        act(() => {
            result.current.playback.onPlayingChange!(true);
        });
        expect(result.current.playback.isPlaying).toBe(false);

        act(() => {
            result.current.selected.setSelectedPage({ id: 1 });
        });
        act(() => {
            result.current.playback.onPlayingChange!(true);
        });
        expect(result.current.playback.isPlaying).toBe(true);
        // While playing, the cursor follows the audio clock and is never -1
        expect(result.current.playback.positionBeat).toBeGreaterThanOrEqual(0);

        act(() => {
            result.current.playback.onPlayingChange!(false);
        });
        expect(result.current.playback.isPlaying).toBe(false);
        // Back at page 1's end beat
        expect(result.current.playback.positionBeat).toBe(9);
    });
});
