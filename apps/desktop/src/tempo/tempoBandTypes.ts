/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): types the tempo lanes share: gestures, what's
 * under the pointer, the inline editor, the right-click menu and the add/remove box.
 */
import { type ReactNode } from "react";
import { type TempoSegment } from "./tempoMath";
import { TempoMeasure } from "./useTempoData";

export type Gesture =
    | {
          /** Holding a hit in the music: it lands on the count under the pointer */
          kind: "grab";
          seconds: number;
          pointerX: number;
          beat: number | null;
          one: boolean;
      }
    | {
          /** Holding a count line: it lands on the music under the pointer */
          kind: "line";
          beat: number;
          seconds: number;
          pointerX: number;
          moved: boolean;
          one: boolean;
      }
    | {
          kind: "tempo";
          segment: TempoSegment;
          startY: number;
          factor: number;
          /**
           * BPM per px, from the lane's scale when the drag started. The scale grows while the
           * line is dragged past it; reading it live would make the drag speed up
           */
          bpmPerPx: number;
      }
    | {
          kind: "range";
          anchor: number;
          to: number;
          /** Pressed on a time signature chip: a click without a drag opens its menu */
          meterStart?: number;
          /** Where a press on a chip was (band px): it's a drag once it moves from there */
          pressX?: number;
      }
    | {
          /**
           * Holding a tempo change's point: up or down changes the stretch's tempo (it becomes a
           * "tempo" gesture), sideways moves the change to another count. The axis is chosen
           * once the pointer has moved 4 px, and kept (Logic: never both at once)
           */
          kind: "point";
          at: number;
          startX: number;
          startY: number;
          to: number;
          axis: "x" | null;
      }
    | {
          /** Bending a stretch into a ramp by its handle: the ramp's middle follows the pointer */
          kind: "curve";
          stretch: TempoSegment;
          /** The tempo the ramp ends on */
          target: number;
          curve: number;
      }
    | {
          /** Dragging a rehearsal mark along the marks lane to another measure */
          kind: "mark";
          measure: TempoMeasure;
          to: number;
          moved: boolean;
      };

/** A stretch of counts (spec beats, `to` exclusive); `from === to` marks the line before `from` */
export interface CountRange {
    from: number;
    to: number;
}

/** What's under the pointer in the tempo lane: it shows, and sets the cursor */
export interface TempoHover {
    kind: "line" | "point" | "curve" | "lane";
    /** The stretch it belongs to (a point: the stretch it starts) */
    stretch: CountRange;
}

export interface Editor {
    x: number;
    y: number;
    value: string;
    hint: string;
    onCommit: (value: string) => void;
    /** The counts the edit changes, shown in the lanes while it's open */
    range?: CountRange;
    /** A second thing to edit from here instead (the whole tempo stretch) */
    extra?: { label: string; onSelect: () => void };
}

export interface Menu {
    x: number;
    y: number;
    /** A line above the items: the place the menu is about, said once (owner, 2026-11-01) */
    title?: string;
    /** Beside the title, quieter: the tempo there, the meter, the selection's size */
    subtitle?: string;
    items: {
        label: string;
        onSelect: () => void;
        disabled?: boolean;
        hint?: string;
        /** The counts the item changes, shown in the lanes while the item is pointed at */
        range?: CountRange;
        icon?: ReactNode;
        /** Quiet text at the right: what it goes to, a value */
        aside?: string;
        /** A line above it, starting a group */
        separatorBefore?: boolean;
    }[];
}

export type AskOption =
    | { text: string; run: () => void }
    | { text: string; disabled: string };

export interface CountAsk {
    x: number;
    y: number;
    title: string;
    /** What adding or removing a count is for, and that the recording stays as it is */
    intro: string;
    keep: AskOption;
    shift: { text: string; run: () => void };
    /** Adding only: hold the drill there instead, with no count added */
    hold?: AskOption;
    /** The counts it's about */
    range: CountRange;
    /** The spot is where a page or a move ends: a breath there is likelier than an extra beat */
    boundary?: boolean;
}
