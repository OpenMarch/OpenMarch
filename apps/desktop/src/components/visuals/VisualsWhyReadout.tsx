/**
 * The why readout in Visuals mode's inspector (performer-behavior.md
 * section 7.1): at the playhead's count, what the focused who does on the
 * current tab, how many of them do it, the cue that set it (or where the
 * default comes from) and the cues it beat. Counts read as the transport's
 * do: "Page 2 count 16" (`countWords`).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { T, useTranslate } from "@tolgee/react";
import type { CueTrace } from "@openmarch/core";
import { allCuesQueryOptions } from "@/hooks/queries/useCues";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useVisualsStore } from "@/stores/VisualsStore";
import { useVisualsData } from "./VisualsProvider";
import { useTargetLabel } from "./useTargetLabel";
import { whyAt } from "./visualsWhy";
import { countAtBeatIndex } from "./visualsLanes";
import { countWords } from "./countWhere";
import { cueChannelName, cueValueName } from "./cueValueText";
import { listParts } from "@/utilities/formatList";

export default function VisualsWhyReadout() {
    const { t } = useTranslate();
    const data = useVisualsData();
    const focusIds = useVisualsStore((s) => s.focusMarcherIds);
    const selectCue = useVisualsStore((s) => s.selectCue);
    const beatIndex = useTimelineSelectionStore(displayedBeat);
    const { beats, pages } = useTimingObjects();
    const { data: cues } = useQuery(allCuesQueryOptions());
    const targetLabel = useTargetLabel();

    const count = useMemo(
        () => (data ? countAtBeatIndex(beats, beatIndex, data.counts) : null),
        [data, beats, beatIndex],
    );

    const groups = useMemo(() => {
        if (!data || !focusIds || count === null) return [];
        return whyAt({
            compiled: data.compiled,
            channel: data.channel,
            focusIds: [...focusIds],
            count,
        });
    }, [data, focusIds, count]);

    const where = useMemo(
        () => (data ? countWords(beats, pages, data.counts) : null),
        [data, beats, pages],
    );

    if (!data || !where || count === null || groups.length === 0) return null;
    const cueById = new Map((cues ?? []).map((c) => [c.id, c]));
    const describe = (id: number) => {
        const cue = cueById.get(id);
        if (!cue) return `#${id}`;
        const at = data.counts.countOfBeatId.get(cue.beatId);
        return t("visuals.why.cue", {
            value: cueValueName(cue.value) ?? cue.value,
            who: targetLabel(cue.target),
            where: at === undefined ? "–" : where(at),
        });
    };
    const ownIds = new Set(data.lanes.own.map((c) => c.id));
    const cueLink = (id: number) =>
        ownIds.has(id) ? (
            <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => selectCue(id)}
            >
                {describe(id)}
            </button>
        ) : (
            <span>{describe(id)}</span>
        );
    const reason = (trace: CueTrace) => {
        if (trace.winner !== null) {
            const winner = trace.winner;
            return trace.takenOverFrom ? (
                <T
                    keyName="visuals.why.setByTakenOver"
                    params={{
                        cue: () => cueLink(winner),
                        channel: cueChannelName(trace.takenOverFrom),
                    }}
                />
            ) : (
                <T
                    keyName="visuals.why.setBy"
                    params={{ cue: () => cueLink(winner) }}
                />
            );
        }
        return t(`visuals.why.default.${trace.default?.source ?? "library"}`);
    };

    return (
        <section
            className="border-stroke mt-16 flex flex-col gap-6 border-t pt-12"
            data-testid="visuals-why"
        >
            <p className="text-body text-text">
                {t("visuals.why.title", { where: where(count) })}
            </p>
            {groups.map((group, i) => (
                <div
                    key={i}
                    className="text-sub flex flex-col gap-2"
                    data-testid="visuals-why-group"
                >
                    <p className="text-text">
                        {t("visuals.why.value", {
                            value:
                                (group.value && cueValueName(group.value)) ??
                                group.label ??
                                "–",
                            n: group.count,
                            total: data.marcherCount,
                        })}
                    </p>
                    <p className="text-text-subtitle">{reason(group.trace)}</p>
                    {group.trace.beaten.length > 0 && (
                        <p className="text-text-subtitle">
                            <T
                                keyName="visuals.why.beat"
                                params={{
                                    cues: () =>
                                        listParts(
                                            group.trace.beaten.length,
                                        ).map((part, j) =>
                                            "item" in part ? (
                                                <span
                                                    key={
                                                        group.trace.beaten[
                                                            part.item
                                                        ]
                                                    }
                                                >
                                                    {cueLink(
                                                        group.trace.beaten[
                                                            part.item
                                                        ]!,
                                                    )}
                                                </span>
                                            ) : (
                                                <span key={`sep-${j}`}>
                                                    {part.text}
                                                </span>
                                            ),
                                        ),
                                }}
                            />
                        </p>
                    )}
                </div>
            ))}
        </section>
    );
}
