/**
 * Tempo mode: the tempo lanes' layout: lane rows and their
 * names, counts to x and back, grab distances, the header slot and the visible scroll window.
 */
import { useLayoutEffect, useState } from "react";
import tolgee from "@/global/singletons/Tolgee";
import { useHeaderSlot } from "./tempoUi";

/** How far above or below the tempo line (px) a press still takes it */
export const TEMPO_LINE_GRAB_PX = 5;
export const MARKS = { top: 0, height: 20 };
export const MEASURES = { top: 20, height: 22 };
export const TEMPO = { top: 42, height: 76 };
export const MUSIC = { top: 118, height: 124 };
export const TEMPO_BAND_HEIGHT = MUSIC.top + MUSIC.height + 6;
/** The lane names' column at the view's left edge: as wide as the home page's column before beat 0 */
export const LANE_GUTTER = 40;
/**
 * The lanes' names in that column, with what each lane does. Getters, so each read is in the
 * current language.
 */
export const LANES = [
    {
        ...MARKS,
        get name() {
            return tolgee.t("tempoMode.lanes.marks.name", "Marks");
        },
        get title() {
            return tolgee.t(
                "tempoMode.lanes.marks.title",
                "Rehearsal marks: double-click to name one, drag one to another measure, or press M while playing to drop the next",
            );
        },
    },
    {
        ...MEASURES,
        get name() {
            return tolgee.t("tempoMode.lanes.measures.name", "Meas.");
        },
        get title() {
            return tolgee.t(
                "tempoMode.lanes.measures.title",
                "Measures: drag along to select counts, right-click or double-click a number to renumber from there, click a time signature to change it",
            );
        },
    },
    {
        ...TEMPO,
        get name() {
            return tolgee.t("tempoMode.lanes.tempo.name", "Tempo");
        },
        get title() {
            return tolgee.t(
                "tempoMode.lanes.tempo.title",
                "Tempo: drag the line up or down; drag a dot to move a tempo change, or a round handle for a gradual change. Double-click to add a change; right-click > Set tempo… to type one. Drag off the line to select counts",
            );
        },
    },
    {
        ...MUSIC,
        get name() {
            return tolgee.t("tempoMode.lanes.music.name", "Music");
        },
        get title() {
            return tolgee.t(
                "tempoMode.lanes.music.title",
                "The music: drag along it to select counts, click to move the playhead, or right-click a spot to start the music there (on count 1)",
            );
        },
    },
];

export function TempoHeaderSlot() {
    const setElement = useHeaderSlot((s) => s.setElement);
    return (
        <div
            ref={setElement}
            data-testid="tempo-mode-header"
            className="border-stroke relative flex h-32 shrink-0 border-b"
        />
    );
}

/** x of spec beat `b`'s start: the band's x 0 is spec beat 1 (the timeline hides beat 0) */
export const xOf = (b: number, ppb: number) => (b - 1) * ppb;
export const beatAtX = (x: number, ppb: number) => x / ppb + 1;

/** The surface's visible horizontal window, from its scroll container */
export function useScrollWindow(ref: React.RefObject<HTMLElement | null>) {
    const [win, setWin] = useState({ left: 0, width: 1200 });
    useLayoutEffect(() => {
        // The timeline's viewport, found by what it is, not by whether it scrolls yet: opened at
        // a zoom that fits the whole show it doesn't, and zooming in later must still be heard
        const scroller =
            ref.current?.closest<HTMLElement>(
                '[data-testid="timeline-viewport"]',
            ) ?? null;
        if (!scroller) return;
        const el = scroller;
        let frame = 0;
        const read = () => {
            frame = 0;
            setWin((w) =>
                w.left === el.scrollLeft && w.width === el.clientWidth
                    ? w
                    : { left: el.scrollLeft, width: el.clientWidth },
            );
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(read);
        };
        read();
        el.addEventListener("scroll", onScroll, { passive: true });
        const observer = new ResizeObserver(onScroll);
        observer.observe(el);
        return () => {
            el.removeEventListener("scroll", onScroll);
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [ref]);
    return win;
}

/** "its move stays…" as a sentence of its own */
export const upperFirst = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1);
export const fontOf = (el: Element | null) =>
    el ? getComputedStyle(el).fontFamily : "sans-serif";
export const cssColor = (el: Element | null, name: string, fallback: string) =>
    (el && getComputedStyle(el).getPropertyValue(name).trim()) || fallback;
