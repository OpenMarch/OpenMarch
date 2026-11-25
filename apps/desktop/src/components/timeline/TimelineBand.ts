import type { ReactNode } from "react";
import type { TimelineBeatRange } from "./TimelineViewModel";

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
    /**
     * The page lines alone, and the measures' downbeats alone, for a dragged edge's rule
     * (`snapEdgeBeat`: page lines from 12 px, downbeats from 6 px). Absent: `snapBeats` for both
     */
    pageBeats?: readonly number[];
    downbeats?: readonly number[];
    /** The room left of beat 0 (the home page's column): x -leadingInset is the scroll's left edge */
    leadingInset: number;
    /**
     * Selects `[start, end)` as the window (S at its start, the playhead at its end), as a click on
     * a move's clip does. Absent where the timeline can't select.
     */
    onSelectRange?: (range: TimelineBeatRange) => void;
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
    /**
     * Lanes under the clip rows: something in them takes presses (a cue lane shows), so the
     * playhead and start flag are grabbed only above them. Without it (only the Lanes row shows),
     * they're grabbed the whole way down, as with no lanes.
     */
    takesPresses?: boolean;
    render(geometry: TimelineBandGeometry): ReactNode;
}
