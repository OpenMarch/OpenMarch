import { useEffect, useMemo, useRef, useState } from "react";
import type { Diagnostic } from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import {
    getTimelineHost,
    useDiagnostics,
    useTimelineResolverStore,
} from "./timelineStore";
import {
    buildMarcherInspection,
    type MarcherInspection,
} from "./timelineInspector";
import { readVersionedTimelineViewTables } from "./useTimelineTracks";
import type { TimelineViewTables } from "./timelineViewModel";

/** The most marchers the inspector explains at once; the rest are counted. */
export const MAX_INSPECTED_MARCHERS = 10;

const NO_DIAGNOSTICS: Diagnostic[] = [];

interface VersionedTables {
    readonly version: number;
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
} {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
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
    }, [active, database, version]);

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
        if (!active || !resolver || !loaded || beat === null) return [];
        // Rows of another version: wait for the matching read
        if (loaded.version !== version) return null;
        const host = getTimelineHost();
        if (!host) return [];
        const shapeKinds: Record<number, string> = {};
        for (const [id, shape] of Object.entries(host.snapshot.shapes))
            shapeKinds[Number(id)] = shape.kind;
        const sources = {
            tables: loaded.tables,
            transitions: host.snapshot.transitions,
            shapeKinds,
            showDiagnostics: diagnostics,
        };
        return known.ids
            .slice(0, MAX_INSPECTED_MARCHERS)
            .map((id) =>
                buildMarcherInspection(
                    id,
                    beat,
                    resolver.explain(id, beat),
                    sources,
                ),
            );
    }, [active, resolver, loaded, version, beat, known, diagnostics]);

    const last = useRef<readonly MarcherInspection[]>([]);
    if (built !== null) last.current = built;
    return {
        inspections: built ?? last.current,
        omitted: Math.max(0, known.ids.length - MAX_INSPECTED_MARCHERS),
        unknownMarcherIds: known.unknown,
        diagnostics,
    };
}
