/**
 * Visuals mode's inspector (performer-behavior.md section 7.1). The Who
 * list: the band, its sections, its tags and the canvas selection.
 * Clicking one focuses it, and the field dims everyone else; clicking it
 * again clears the focus. The selected cue's settings and the why readout
 * join it below once cues can be picked on the timeline.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { T, useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import {
    allTagsQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
} from "@/hooks/queries/tags/queries";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { getSectionObjectByName } from "@/global/classes/Sections";
import { useVisualsStore } from "@/stores/VisualsStore";
import VisualsCuePanel from "./VisualsCuePanel";
import VisualsWhyReadout from "./VisualsWhyReadout";
import { ShowChecksSection } from "@/components/notes/ShowNotesList";
import {
    sameWho,
    whoEntries,
    type VisualsWho,
    type WhoEntry,
} from "./visualsWho";

const NO_TAGS: ReadonlyMap<number, readonly number[]> = new Map();

/** A built-in section's translated name; a show's own section as spelled. */
function sectionLabel(name: string, t: (key: string) => string): string {
    const section = getSectionObjectByName(name);
    return section.name === name ? t(section.tName) : name;
}

function WhoRow({
    who,
    label,
    count,
    testId,
}: {
    who: VisualsWho;
    label: React.ReactNode;
    count: React.ReactNode;
    testId: string;
}) {
    const focus = useVisualsStore((s) => s.focus);
    const toggleFocus = useVisualsStore((s) => s.toggleFocus);
    const focused = sameWho(focus, who);
    return (
        <button
            type="button"
            aria-pressed={focused}
            data-testid={testId}
            onClick={() => toggleFocus(who)}
            className={clsx(
                "rounded-6 text-body text-text flex min-h-[2.25rem] w-full items-center justify-between gap-8 border px-12 text-left",
                focused
                    ? "border-accent bg-fg-2"
                    : "hover:bg-fg-2 border-transparent",
            )}
        >
            <span className="min-w-0 truncate">{label}</span>
            <span className="text-sub text-text-subtitle shrink-0">
                {count}
            </span>
        </button>
    );
}

function Heading({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-sub text-text-subtitle mt-12 mb-4 px-12">
            {children}
        </p>
    );
}

export default function VisualsInspector() {
    const { t } = useTranslate();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { data: tags } = useQuery(allTagsQueryOptions());
    const { data: byTag } = useQuery(marcherIdsForAllTagIdsQueryOptions());
    const { selectedMarchers } = useSelectedMarchers()!;
    const focus = useVisualsStore((s) => s.focus);
    const clearFocus = useVisualsStore((s) => s.clearFocus);

    const entries = useMemo(
        () => whoEntries(marchers ?? [], tags ?? [], byTag ?? NO_TAGS),
        [marchers, tags, byTag],
    );
    const [band, ...rest] = entries;
    const sections = rest.filter(
        (e): e is WhoEntry & { who: { kind: "section" } } =>
            e.who.kind === "section",
    );
    const tagRows = rest.filter(
        (e): e is WhoEntry & { who: { kind: "tag" } } => e.who.kind === "tag",
    );

    return (
        <div
            className="rounded-6 border-stroke bg-fg-1 flex h-full w-xs min-w-0 flex-col border p-12"
            data-testid="visuals-inspector"
        >
            <div className="flex items-center justify-between">
                <p className="text-body text-text/60">
                    <T keyName="visuals.inspector.title" />
                </p>
                {focus && (
                    <button
                        type="button"
                        className="text-sub text-text-subtitle hover:text-text"
                        onClick={clearFocus}
                        data-testid="visuals-clear-focus"
                    >
                        <T keyName="visuals.inspector.clearFocus" />
                    </button>
                )}
            </div>
            <div className="relative mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto">
                <p className="text-body text-text mb-4">
                    <T keyName="visuals.inspector.who" />
                </p>
                {!focus && (
                    <p className="text-sub text-text-subtitle mb-8">
                        <T keyName="visuals.inspector.focusHint" />
                    </p>
                )}
                {band && (
                    <WhoRow
                        who={band.who}
                        label={<T keyName="visuals.inspector.band" />}
                        count={band.count}
                        testId="visuals-who-band"
                    />
                )}
                <WhoRow
                    who={{ kind: "selection" }}
                    label={<T keyName="visuals.inspector.selection" />}
                    count={t("visuals.inspector.selectionCount", {
                        count: selectedMarchers.length,
                    })}
                    testId="visuals-who-selection"
                />
                {sections.length > 0 && (
                    <Heading>
                        <T keyName="visuals.inspector.sections" />
                    </Heading>
                )}
                {sections.map((e) => (
                    <WhoRow
                        key={`section-${e.label}`}
                        who={e.who}
                        label={sectionLabel(e.label, t)}
                        count={e.count}
                        testId={`visuals-who-section-${e.label}`}
                    />
                ))}
                {tagRows.length > 0 && (
                    <Heading>
                        <T keyName="visuals.inspector.tags" />
                    </Heading>
                )}
                {tagRows.map((e) => (
                    <WhoRow
                        key={`tag-${e.who.tagId}`}
                        who={e.who}
                        label={
                            tags
                                ?.find((x) => x.id === e.who.tagId)
                                ?.name?.trim() ||
                            t("visuals.inspector.unnamedTag", {
                                id: String(e.who.tagId),
                            })
                        }
                        count={e.count}
                        testId={`visuals-who-tag-${e.who.tagId}`}
                    />
                ))}
                <VisualsCuePanel />
                <VisualsWhyReadout />
                {/* ADR 0002 D-22: the same Show checks as the Editor's inspector */}
                <div className="mt-24">
                    <ShowChecksSection />
                </div>
            </div>
        </div>
    );
}
