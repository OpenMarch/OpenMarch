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
    /** Total number of counts (beats) in the show, across all sets. */
    totalCounts: number;
    /** Embedded show audio, when the package includes it. */
    audio?: DrillAudio;
}

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
    /** Front/back, positive toward the back of the field. */
    y: number;
}

/** The field boundary the source coordinates are measured against. */
export interface DrillFieldBorder {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** Embedded audio extracted from the package. */
export interface DrillAudio {
    /** Original file name within the package. */
    name: string;
    /** Raw file bytes. */
    data: Uint8Array;
}
