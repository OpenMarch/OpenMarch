import { useMemo } from "react";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    equipmentIconsAt,
    iconsKey,
    type EquipmentIconKey,
} from "./equipmentIcons";
import { useShowCues } from "./useShowCues";

/** The icons the 2D field draws after drill numbers at a beat, and a key that changes with them. */
export interface LabelIcons {
    at(beat: number | null): {
        readonly key: string;
        readonly icons: ReadonlyMap<number, EquipmentIconKey>;
    };
}

const NONE = { key: "", icons: new Map<number, EquipmentIconKey>() } as const;

/**
 * What each performer holds at the field's beat, as the icon the 2D field draws after their drill
 * number (fork #992), for whom the field display bar's Equipment icons setting says: performers
 * holding something other than their own instrument (the default), everyone, or nobody (null).
 * `at` takes a spec beat (fractional while playing) and is cheap to call every frame: it works the
 * icons out again only when the count changes.
 */
export function useEquipmentIcons(): LabelIcons | null {
    const show = useShowCues();
    const beats = useTimingObjects()?.beats;
    const shown = useUiSettingsStore(
        (s) => s.uiSettings.equipmentIcons ?? "changed",
    );
    return useMemo(() => {
        if (!show || !beats || shown === "off") return null;
        if (
            shown === "changed" &&
            !show.cues.some((c) => c.type === "equipment")
        )
            return null;
        const sections = new Map(show.marchers.map((m) => [m.id, m.section]));
        let lastCount: number | null = null;
        let last: {
            key: string;
            icons: ReadonlyMap<number, EquipmentIconKey>;
        } = NONE;
        return {
            at(beat) {
                if (beat === null) return NONE;
                const index = Math.max(1, Math.floor(beat + 1e-6));
                const at = beats[Math.min(index, beats.length - 1)];
                const count = at ? show.countOfBeat.get(at.id) : undefined;
                if (count === undefined) return NONE;
                if (count === lastCount) return last;
                const icons = equipmentIconsAt({
                    compiled: show.compiled,
                    usualValue: show.usualValue,
                    sectionOf: (id) => sections.get(id),
                    count,
                    shown,
                });
                lastCount = count;
                last = { key: iconsKey(icons), icons };
                return last;
            },
        };
    }, [show, beats, shown]);
}
