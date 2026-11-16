import { useMemo } from "react";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { equipmentTagsAt, tagsKey } from "./equipment";
import { useShowCues } from "./useShowCues";

/** The tags the 2D field draws by drill numbers at a beat, and a key that changes with them. */
export interface LabelTags {
    at(beat: number | null): {
        readonly key: string;
        readonly tags: ReadonlyMap<number, string>;
    };
}

const NONE = { key: "", tags: new Map<number, string>() } as const;

/**
 * What each performer holds at the field's beat, as the short tag the 2D field draws by their
 * drill number (fork #992 decision 1): only for performers holding something other than their
 * section's usual item. `at` takes a spec beat (fractional while playing) and is cheap to call every
 * frame: it works the tags out again only when the count changes.
 */
export function useEquipmentTags(): LabelTags | null {
    const show = useShowCues();
    const beats = useTimingObjects()?.beats;
    return useMemo(() => {
        if (!show || !beats) return null;
        if (!show.cues.some((c) => c.type === "equipment")) return null;
        let lastCount: number | null = null;
        let last: { key: string; tags: ReadonlyMap<number, string> } = NONE;
        return {
            at(beat) {
                if (beat === null) return NONE;
                const index = Math.max(1, Math.floor(beat + 1e-6));
                const at = beats[Math.min(index, beats.length - 1)];
                const count = at ? show.countOfBeat.get(at.id) : undefined;
                if (count === undefined) return NONE;
                if (count === lastCount) return last;
                const tags = equipmentTagsAt(
                    show.compiled,
                    show.usualValue,
                    count,
                );
                lastCount = count;
                last = { key: tagsKey(tags), tags };
                return last;
            },
        };
    }, [show, beats]);
}
