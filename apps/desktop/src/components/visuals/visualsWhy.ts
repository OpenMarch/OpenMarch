/**
 * The why readout (performer-behavior.md section 7.1): at one count, what
 * the focused who does on a channel, how many of them do each thing, and
 * why: the cue that set it (or where the default comes from) and the cues it
 * beat. Read from compile's own trace (`traceCue`), so the readout and the
 * 3D View agree. Pure.
 */
import { traceCue, type CompiledCues, type CueTrace } from "@openmarch/core";
import type { VisualsChannel } from "./visualsWho";
import { cueValueLabel } from "./cueValueText";

/** One value the focused marchers have at the count, and its trace. */
export interface WhyGroup {
    /** The value's label, or null where nothing is set (past the show's end). */
    label: string | null;
    /** The value's id, or null where nothing is set. */
    value: string | null;
    /** How many focused marchers have it. */
    count: number;
    /** The trace for the first of them in drill order. */
    trace: CueTrace;
}

/**
 * The values the focused marchers have at `count`, most common first; ties
 * keep drill order. A who doing one thing gives one group.
 */
export function whyAt({
    compiled,
    channel,
    focusIds,
    count,
}: {
    compiled: CompiledCues;
    channel: VisualsChannel;
    /** Focused marchers, in drill order. */
    focusIds: readonly number[];
    count: number;
}): WhyGroup[] {
    const groups = new Map<string, WhyGroup & { first: number }>();
    focusIds.forEach((id, order) => {
        const seg = compiled
            .segments(id, channel)
            .find((s) => s.from <= count && count < s.to);
        const label = seg
            ? cueValueLabel(seg.value, seg.settings, seg.label)
            : null;
        const value = seg?.value ?? null;
        const key = `${label}|${seg?.cueId ?? "default"}`;
        const group = groups.get(key);
        if (group) group.count++;
        else
            groups.set(key, {
                label,
                value,
                count: 1,
                trace: traceCue(compiled, id, channel, count),
                first: order,
            });
    });
    return [...groups.values()]
        .sort((a, b) => b.count - a.count || a.first - b.first)
        .map(({ label, value, count, trace }) => ({
            label,
            value,
            count,
            trace,
        }));
}
