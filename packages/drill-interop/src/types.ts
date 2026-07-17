/**
 * Normalized, vendor-neutral representation of a drill produced by a third-party
 * drill-design tool and read from a drill interchange package (`.3dz`).
 *
 * All coordinates are expressed in the source tool's own units (steps measured
 * from the center of the field). Consumers are responsible for converting these
 * into their own coordinate space using {@link DrillFieldBorder}.
 */
export interface DrillShow {
    /** Human-readable show title, when present in the document. */
    title?: string;
    /** Every performer in the cast, in document order. */
    performers: DrillPerformer[];
    /** Prop markers discovered from non-cast coordinate records. */
    props: DrillPerformer[];
    /** Performers present in page frames but absent from the cast list. */
    supplemental: DrillPerformer[];
    /** Ordered formations ("sets"), each with the coordinates that define it. */
    sets: DrillSet[];
    /** The field boundary rectangle the coordinates are measured against. */
    field: DrillFieldBorder;
    /**
     * The full source grid: step ratio, sidelines, hashes, and yard lines. Used
     * to convert coordinates by true step size and to reconstruct the field the
     * drill was designed on.
     */
    grid: DrillGrid;
    /**
     * Show-level production notes (a closing credit / thank-you block), when the
     * document carries one. Not tied to any set.
     */
    productionNotes?: string;
    /** Total number of counts (beats) in the show, across all sets. */
    totalCounts: number;
    /**
     * Per-count audio timestamps from the document's `SYNC` chunk, when present.
     * Used to build real beat durations and align the imported audio.
     */
    audioSync?: DrillAudioSync;
    /** Embedded show audio, when the package includes it. */
    audio?: DrillAudio;
    /** Embedded field-surface image, when the package includes it. */
    surface?: DrillImage;
}

/**
 * Audio alignment from a `SYNC` chunk: seconds into the audio file when each
 * count occurs (`timestamps[i]` ↔ count `i`).
 */
export type DrillAudioSync = {
    /** Source-tool path to the audio file (informational). */
    path: string;
    timestamps: number[];
};

/** A single performer/marcher in the cast. */
export interface DrillPerformer {
    /** Stable identifier used to join a performer to their per-set coordinates. */
    id: string;
    /** Drill label shown to the user, e.g. `"T3"`, `"G10"`. */
    label: string;
    /** Parsed alphabetic prefix from {@link label}, e.g. `"TS"`. */
    drill_prefix: string;
    /** Parsed numeric suffix from {@link label}, e.g. `3`. */
    drill_order: number;
}

/** A formation the performers move between. */
export interface DrillSet {
    /** The set's display name, e.g. `"179-182"` or `"224"`. */
    name: string;
    /**
     * The count (beat) index, from the start of this document, at which the set
     * is reached. The first set is `0`.
     */
    startCount: number;
    /** Number of counts spent moving to this set from the previous one. */
    counts: number;
    /** Optional director note attached to the set. */
    notes?: string;
    /** Performer id -> position at this set, in source field units. */
    coordinates: Record<string, DrillPoint>;
}

/** A position in the source tool's field units, measured from field center. */
export interface DrillPoint {
    /** Left/right, positive toward the audience's right. */
    x: number;
    /**
     * Front/back, positive toward the **front** (audience) sideline — the
     * opposite of OpenMarch, which measures negative toward the back. The
     * importer flips this axis; see `sourceFrontSidelineUnits` in
     * `apps/desktop/src/components/import/drillTransform.ts`.
     */
    y: number;
}

/** The field boundary the source coordinates are measured against. */
export interface DrillFieldBorder {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/**
 * The full source grid definition, in the source tool's field units. Everything
 * needed to convert coordinates into real steps and to reconstruct the field the
 * drill was designed on. Distances multiply by {@link stepsPerUnitX}/
 * {@link stepsPerUnitY} to become 8-to-5 steps.
 */
export interface DrillGrid {
    /** The field boundary rectangle, in source units. */
    border: DrillFieldBorder;
    /** Steps per source unit on the X (left/right) axis, e.g. `1.6` for 8-to-5. */
    stepsPerUnitX: number;
    /** Steps per source unit on the Y (front/back) axis. */
    stepsPerUnitY: number;
    /**
     * Y positions of the horizontal major lines (the sidelines), in source
     * units. The smallest is the front sideline, the largest the back sideline.
     */
    sidelinesY: number[];
    /** Y positions of the hash lines, in source units. */
    hashesY: number[];
    /** X positions of the vertical major lines (yard lines), in source units. */
    yardLinesX: number[];
    /** Measurement system implied by the source grid's unit token. */
    measurementSystem: "imperial" | "metric";
    /** Grid template name, e.g. `"default"`, when present. */
    templateName?: string;
    /** Field-surface image file name, when the grid references one. */
    surfaceImageName?: string;
}

/** An embedded image extracted from the package. */
export interface DrillImage {
    /** Original file name within the package. */
    name: string;
    /** Raw file bytes. */
    data: Uint8Array;
}

/** Embedded audio extracted from the package. */
export interface DrillAudio {
    /** Original file name within the package. */
    name: string;
    /** Raw file bytes. */
    data: Uint8Array;
}
