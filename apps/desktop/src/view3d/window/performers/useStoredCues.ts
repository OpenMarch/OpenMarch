/**
 * The show's stored cues, read in the 3D View window (ADR 0015 D-9). The
 * editor relays every query it invalidates (`useView3dPublisher`), so a cue
 * edit, an undo or a beat or marcher delete refreshes them.
 */
import { useQuery } from "@tanstack/react-query";
import type { CueInput } from "@openmarch/core";
import { allCuesQueryOptions } from "@/hooks/queries/useCues";

const NO_CUES: readonly CueInput[] = [];

/**
 * The stored cues, or null while they are still loading. A query that fails
 * (a file without the cue tables) counts as nothing stored. The compile
 * ignores a cue of a type this build doesn't know.
 */
export function useStoredCues(): readonly CueInput[] | null {
    const { data, isPending } = useQuery(allCuesQueryOptions());
    if (isPending) return null;
    return data ?? NO_CUES;
}
