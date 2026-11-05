import type { ReactNode } from "react";

/**
 * Where a timeline's lanes draw (`TimelineBand`), in the surface's own
 * coordinates: x 0 is beat 0, and `top` is just below the waveform.
 */
export interface TimelineBandGeometry {
    top: number;
    width: number;
    pixelsPerBeat: number;
    beatCount: number;
    /** The beats a drag pulls to: page lines and downbeats (`snapSeekBeat`). */
    snapBeats: readonly number[];
    /** The room left of beat 0 (the home page's column): x -leadingInset is the scroll's left edge */
    leadingInset: number;
}

/**
 * Lanes a timeline draws in place of its clip rows (tempo mode's lanes): they make the timeline `height`
 * tall below the waveform and draw `render` there. Not in Basic.
 */
export interface TimelineBand {
    height: number;
    /**
     * The band is what's being edited (tempo mode): the timeline quiets its page row and offers no
     * page editing (moving page flags, adding pages at the playhead) while it shows
     */
    focus?: boolean;
    /** A row the timeline draws over its transport while the band shows: the band's own header */
    header?: ReactNode;
    render(geometry: TimelineBandGeometry): ReactNode;
}
