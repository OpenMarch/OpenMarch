import { useEffect, useMemo, useRef, useState } from "react";
import type { Diagnostic } from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import {
    getTimelineHost,
    resolverSpans,
    useDiagnostics,
    useTimelineResolverStore,
} from "./timelineStore";
import {
    buildMarcherInspection,
    type MarcherInspection,
} from "./timelineInspector";
import {
    buildTransitionEditTargets,
    transitionShapeOptions,
    type TransitionEditTarget,
    type TransitionShapeOption,
} from "./timelineTransitionEditor";
import { useTimelineViewVersions } from "./useTimelineViewVersions";
import {
    buildAssignmentEditTarget,
    type AssignmentEditTarget,
} from "./timelineAssignmentEditor";
import {
    buildShapeEditTargets,
    type ShapeEditTarget,
} from "./timelineShapeEditor";
import { readVersionedTimelineViewTables } from "./useTimelineTracks";
import type { TimelineViewTables } from "./timelineViewModel";

/** The most marchers the inspector explains at once; the rest are counted. */
export const MAX_INSPECTED_MARCHERS = 10;

const NO_DIAGNOSTICS: Diagnostic[] = [];
interface ShapeEdits {
    /**
     * The store and display versions the shapes were read at, summed (as the other editors'
     * targets are); -1 before any read
     */
    readonly version: number;
    readonly targets: readonly ShapeEditTarget[];
}
const NO_SHAPE_EDITS: ShapeEdits = { version: -1, targets: [] };

interface Built {
    readonly inspections: readonly MarcherInspection[];
    readonly transitionEdits: readonly TransitionEditTarget[];
    readonly shapeOptions: readonly TransitionShapeOption[];
    readonly assignmentEdits: readonly AssignmentEditTarget[];
}

const EMPTY_BUILT: Built = {
    inspections: [],
    transitionEdits: [],
    shapeOptions: [],
    assignmentEdits: [],
};

interface VersionedTables {
    readonly version: number;
    readonly displayVersion: number;
    readonly tables: TimelineViewTables;
}

/**
 * The inspector's data (P8.5): each marcher's `explain` at `beat` joined with the rows it names,
 * and the show's diagnostics. Both are re-derived whenever the resolver store's version changes,
 * from rows read under the write lock for that same version, so an explanation and the rows
 * beside it never come from different commits (the last good answer stays until the matching
 * rows arrive). Reads nothing while `enabled` is false.
 *
 * @param marcherIds stable ids of the marchers to explain; pass a memoized array
 * @param beat the beat to explain at, or null to explain nobody (only the diagnostics)
 */
export function useTimelineInspections({
    database,
    enabled,
    marcherIds,
    beat,
}: {
    database: DbConnection;
    enabled: boolean;
    marcherIds: readonly number[];
    beat: number | null;
}): {
    inspections: readonly MarcherInspection[];
    /** Known marchers selected beyond `MAX_INSPECTED_MARCHERS` */
    omitted: number;
    /** Selected marchers the resolver doesn't have; empty until a resolver is ready */
    unknownMarcherIds: readonly number[];
    diagnostics: readonly Diagnostic[];
    /**
     * The transitions the inspections can edit (P8.3), once each, in the order of the inspections:
     * each marcher's current transition, or the one that ends at the beat
     */
    transitionEdits: readonly TransitionEditTarget[];
    /** The shapes a transition can head to */
    shapeOptions: readonly TransitionShapeOption[];
    /** The slots and assignments of each of `transitionEdits` (P8.4), in the same order */
    assignmentEdits: readonly AssignmentEditTarget[];
    /**
     * Every shape, for the shape editor (P8.2), by id, and the version they were read at.
     * Built whether or not a page is selected.
     */
    shapeEdits: ShapeEdits;
} {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const { version, displayVersion } = useTimelineViewVersions();
    const active = enabled && resolver !== null;

    const [loaded, setLoaded] = useState<VersionedTables | null>(null);
    useEffect(() => {
        if (!active) {
            setLoaded(null);
            return;
        }
        let current = true;
        readVersionedTimelineViewTables(database).then(
            (read) => {
                if (current) setLoaded(read);
            },
            (error: unknown) =>
                console.error("Couldn't read the inspector's rows", error),
        );
        return () => {
            current = false;
        };
    }, [active, database, version, displayVersion]);

    const storeDiagnostics = useDiagnostics();
    const diagnostics = active ? storeDiagnostics : NO_DIAGNOSTICS;

    const known = useMemo(() => {
        void version;
        if (!active || !resolver)
            return { ids: [] as number[], unknown: [] as number[] };
        const have = new Set(resolver.marcherIds());
        return {
            ids: marcherIds.filter((id) => have.has(id)),
            unknown: marcherIds.filter((id) => !have.has(id)),
        };
    }, [active, resolver, version, marcherIds]);

    const built = useMemo(() => {
        if (!active || !resolver || !loaded || beat === null)
            return EMPTY_BUILT;
        // Rows of another version: wait for the matching read
        if (
            loaded.version !== version ||
            loaded.displayVersion !== displayVersion
        )
            return null;
        const host = getTimelineHost();
        if (!host) return EMPTY_BUILT;
        const shapeKinds: Record<number, string> = {};
        for (const [id, shape] of Object.entries(host.snapshot.shapes))
            shapeKinds[Number(id)] = shape.kind;
        const sources = {
            tables: loaded.tables,
            transitions: host.snapshot.transitions,
            shapeKinds,
            showDiagnostics: diagnostics,
        };
        const inspections = known.ids
            .slice(0, MAX_INSPECTED_MARCHERS)
            .map((id) =>
                buildMarcherInspection(
                    id,
                    beat,
                    resolver.explain(id, beat),
                    sources,
                ),
            );
        const transitionEdits = buildTransitionEditTargets(inspections, {
            transitions: host.snapshot.transitions,
            shapes: host.snapshot.shapes,
            assignments: loaded.tables.assignments,
        });
        const labels = new Map(
            loaded.tables.marchers.map((m) => [m.id, m.label]),
        );
        const assignmentEdits = transitionEdits.map((target) =>
            buildAssignmentEditTarget(
                host.snapshot.transitions[target.id]!,
                // Moves on a display-only edit too, so the editors' guard can't wait on a
                // resolver version that never comes
                loaded.version + loaded.displayVersion,
                {
                    assignments: loaded.tables.assignments,
                    labels,
                    spansOf: (id) => resolverSpans(resolver, id),
                },
            ),
        );
        return {
            inspections,
            transitionEdits,
            shapeOptions: transitionShapeOptions(
                host.snapshot.shapes,
                loaded.tables.shapes,
            ),
            assignmentEdits,
        };
    }, [
        active,
        resolver,
        loaded,
        version,
        displayVersion,
        beat,
        known,
        diagnostics,
    ]);

    const shapes = useMemo(() => {
        if (!active || !loaded) return NO_SHAPE_EDITS;
        if (
            loaded.version !== version ||
            loaded.displayVersion !== displayVersion
        )
            return null;
        // Moves on a display-only edit too, like the other editors' version (P7.15)
        const shown = loaded.version + loaded.displayVersion;
        const host = getTimelineHost();
        if (!host) return NO_SHAPE_EDITS;
        return {
            version: shown,
            targets: buildShapeEditTargets(
                host.snapshot.shapes,
                loaded.tables.shapes,
                host.snapshot.transitions,
                shown,
            ),
        };
    }, [active, loaded, version, displayVersion]);
    const lastShapes = useRef<ShapeEdits>(NO_SHAPE_EDITS);
    if (shapes !== null) lastShapes.current = shapes;

    const last = useRef<Built>(EMPTY_BUILT);
    if (built !== null) last.current = built;
    const current = built ?? last.current;
    return {
        inspections: current.inspections,
        transitionEdits: current.transitionEdits,
        shapeOptions: current.shapeOptions,
        assignmentEdits: current.assignmentEdits,
        shapeEdits: shapes ?? lastShapes.current,
        omitted: Math.max(0, known.ids.length - MAX_INSPECTED_MARCHERS),
        unknownMarcherIds: known.unknown,
        diagnostics,
    };
}
