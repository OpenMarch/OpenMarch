import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslate } from "@tolgee/react";
import { useQuery } from "@tanstack/react-query";
import {
    CaretDownIcon,
    CaretRightIcon,
    WarningIcon,
    InfoIcon,
} from "@phosphor-icons/react";
import type { Diagnostic, SpanKind, XY } from "@openmarch/core";
import { db } from "@/global/database/db";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import {
    useTimelineSelectionStore,
    windowMove,
    type StoredTimelineMembership,
} from "@/stores/TimelineSelectionStore";
import {
    groupDiagnosticsByTransition,
    type MarcherInspection,
} from "@/timeline/timelineInspector";
import { useTimelineInspections } from "@/timeline/useTimelineInspections";
import type {
    TransitionEditTarget,
    TransitionShapeOption,
} from "@/timeline/timelineTransitionEditor";
import type { AssignmentEditTarget } from "@/timeline/timelineAssignmentEditor";
import { shapeFrameFor } from "@/timeline/timelineShapeEditor";
import { InspectorCollapsible } from "./InspectorCollapsible";
import { TimelineAssignmentsEditor } from "./TimelineAssignmentsEditor";
import { TimelineShapesEditor } from "./TimelineShapesEditor";
import { TimelineTransitionEditor } from "./TimelineTransitionEditor";
import {
    DIAGNOSTIC_STRING_KEYS,
    TIMELINE_INSPECTOR_STRINGS,
    type TimelineInspectorStringKey,
} from "./timelineInspectorStrings";

type Params = Record<string, string | number>;

const NO_EDITS: readonly TransitionEditTarget[] = [];
const NO_SHAPES: readonly TransitionShapeOption[] = [];
const NO_ASSIGNMENT_EDITS: readonly AssignmentEditTarget[] = [];
const NO_SHAPE_EDITS = { version: -1, targets: [] } as const;

/** Looks a string up by key, with its English text as the default. */
export type InspectorTranslate = (
    key: TimelineInspectorStringKey,
    params?: Params,
) => string;

/** The inspector's translator: Tolgee's `t`, falling back to the English text. */
export function useInspectorTranslate(): InspectorTranslate {
    const { t } = useTranslate();
    return useMemo(
        () => (key, params) =>
            t(key, {
                defaultValue: TIMELINE_INSPECTOR_STRINGS[key],
                ...params,
            }),
        [t],
    );
}

/** One whole sentence per span kind, so no translated word is changed or spliced in. */
const ORIGIN_SPAN_KEYS = {
    hold: "inspector.timeline.origin.spanHold",
    founding: "inspector.timeline.origin.spanFounding",
    join: "inspector.timeline.origin.spanJoin",
    resume: "inspector.timeline.origin.spanResume",
} as const satisfies Record<SpanKind, TimelineInspectorStringKey>;

/** A coordinate, rounded for reading. */
const num = (value: number) => String(Math.round(value * 100) / 100);
const xy = (point: XY) => ({ x: num(point[0]), y: num(point[1]) });

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex justify-between gap-8">
            <dt className="text-sub text-text/60 shrink-0">{label}</dt>
            <dd className="text-sub text-right break-words">{children}</dd>
        </div>
    );
}

function DiagnosticItem({
    diagnostic,
    t,
    showTransition,
}: {
    diagnostic: Diagnostic;
    t: InspectorTranslate;
    showTransition?: boolean;
}) {
    const Icon = diagnostic.level === "warning" ? WarningIcon : InfoIcon;
    return (
        <li
            className="flex items-start gap-6"
            data-testid={`timeline-diagnostic-${diagnostic.code}`}
        >
            <Icon
                size={16}
                className={
                    diagnostic.level === "warning"
                        ? "text-yellow mt-2 shrink-0"
                        : "text-text/60 mt-2 shrink-0"
                }
                aria-label={t(
                    diagnostic.level === "warning"
                        ? "inspector.timeline.diagnostics.warning"
                        : "inspector.timeline.diagnostics.info",
                )}
            />
            <span className="text-sub">
                <span className="font-mono">{diagnostic.code}</span>
                {showTransition &&
                    ` · ${t("inspector.timeline.diagnostics.transition", { id: diagnostic.transitionId })}`}
                {": "}
                {t(DIAGNOSTIC_STRING_KEYS[diagnostic.code], {
                    slot: diagnostic.slot ?? "",
                    transition: diagnostic.transitionId,
                })}
            </span>
        </li>
    );
}

/** One marcher's `explain` at the beat, worded for reading (P8.5). Read-only. */
export function MarcherInspectionView({
    inspection,
    label,
    t,
}: {
    inspection: MarcherInspection;
    label: string;
    t: InspectorTranslate;
}) {
    const { span, transition, ftl, origin } = inspection;
    const edge = (value: number, which: "Start" | "End") =>
        Number.isFinite(value)
            ? num(value)
            : t(`inspector.timeline.beats.show${which}`);

    return (
        <div
            className="flex flex-col gap-8"
            data-testid={`timeline-inspection-${inspection.marcherId}`}
        >
            <h5 className="text-body font-medium">
                {t("inspector.timeline.marcherTitle", {
                    marcher: label,
                    beat: num(inspection.beat),
                })}
            </h5>
            <dl className="flex flex-col gap-4">
                <Row label={t("inspector.timeline.label.span")}>
                    <span data-testid="timeline-span-kind">
                        {t(`inspector.timeline.span.${span.kind}`)}
                    </span>
                </Row>
                <p className="text-sub text-text/60">
                    {t(`inspector.timeline.span.${span.kind}Help`)}
                </p>
                <Row label={t("inspector.timeline.label.beats")}>
                    {t("inspector.timeline.beats.range", {
                        start: edge(span.start, "Start"),
                        end: edge(span.end, "End"),
                    })}
                </Row>
                {transition && (
                    <Row label={t("inspector.timeline.label.transition")}>
                        {transition.timelineName
                            ? t("inspector.timeline.transition.onTimeline", {
                                  id: transition.id,
                                  timeline: transition.timelineName,
                              })
                            : t("inspector.timeline.transition.plain", {
                                  id: transition.id,
                              })}
                    </Row>
                )}
                {inspection.layer !== null && (
                    <Row label={t("inspector.timeline.label.layer")}>
                        {inspection.layer}
                    </Row>
                )}
                {span.slot !== null && transition && (
                    <Row label={t("inspector.timeline.label.slot")}>
                        {t("inspector.timeline.slot.value", {
                            slot: span.slot,
                            count: transition.slotCount,
                        })}
                    </Row>
                )}
                {inspection.progress !== null && (
                    <Row label={t("inspector.timeline.label.progress")}>
                        {t("inspector.timeline.progress.value", {
                            percent: Math.round(inspection.progress * 100),
                        })}
                    </Row>
                )}
                <Row label={t("inspector.timeline.label.origin")}>
                    {origin.kind === "home"
                        ? t("inspector.timeline.origin.home", xy(origin.xy))
                        : origin.transitionId === null
                          ? t(
                                "inspector.timeline.origin.spanHold",
                                xy(origin.xy),
                            )
                          : t(ORIGIN_SPAN_KEYS[origin.span], {
                                transition: origin.transitionId,
                                ...xy(origin.xy),
                            })}
                </Row>
                {transition && (
                    <>
                        <Row label={t("inspector.timeline.label.pathStyle")}>
                            {t(
                                `inspector.timeline.pathStyle.${transition.style}`,
                            )}
                        </Row>
                        {transition.bulge !== null && (
                            <Row label={t("inspector.timeline.label.bulge")}>
                                {num(transition.bulge)}
                            </Row>
                        )}
                        {transition.waypoints > 0 && (
                            <Row
                                label={t("inspector.timeline.label.waypoints")}
                            >
                                {transition.waypoints}
                            </Row>
                        )}
                        <Row label={t("inspector.timeline.label.destination")}>
                            {transition.destination.kind === "shape"
                                ? transition.destination.name
                                    ? t(
                                          "inspector.timeline.destination.shape",
                                          {
                                              name: transition.destination.name,
                                              kind: transition.destination
                                                  .shape,
                                          },
                                      )
                                    : t(
                                          "inspector.timeline.destination.shapeUnnamed",
                                          {
                                              id: transition.destination
                                                  .shapeId,
                                              kind: transition.destination
                                                  .shape,
                                          },
                                      )
                                : t("inspector.timeline.destination.points", {
                                      count: transition.destination.count,
                                  })}
                        </Row>
                        <Row label={t("inspector.timeline.label.orderMode")}>
                            {t(
                                `inspector.timeline.orderMode.${transition.order}`,
                            )}
                        </Row>
                    </>
                )}
                {ftl && (
                    <>
                        <Row label={t("inspector.timeline.label.memberOrder")}>
                            {ftl.q === null
                                ? t("inspector.timeline.ftl.notMember")
                                : t("inspector.timeline.ftl.place", {
                                      place: ftl.q + 1,
                                      count: ftl.memberCount,
                                  })}
                        </Row>
                        <Row label={t("inspector.timeline.label.orderSource")}>
                            {ftl.orderSource.kind === "inherit"
                                ? t("inspector.timeline.ftl.sourceInherit", {
                                      transition:
                                          ftl.orderSource.fromTransitionId,
                                  })
                                : ftl.orderSource.fallback
                                  ? t("inspector.timeline.ftl.sourceFallback")
                                  : t("inspector.timeline.ftl.sourceSlot")}
                        </Row>
                        {ftl.target && (
                            <Row label={t("inspector.timeline.label.target")}>
                                {t(
                                    "inspector.timeline.ftl.target",
                                    xy(ftl.target),
                                )}
                            </Row>
                        )}
                    </>
                )}
            </dl>
            <div>
                <p className="text-sub text-text/60">
                    {t("inspector.timeline.diagnostics.title")}
                </p>
                {inspection.diagnostics.length === 0 ? (
                    <p className="text-sub">
                        {t("inspector.timeline.diagnostics.none")}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-4">
                        {inspection.diagnostics.map((d, i) => (
                            <DiagnosticItem
                                key={`${d.code}-${d.transitionId}-${d.slot ?? ""}-${i}`}
                                diagnostic={d}
                                t={t}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

/** The whole show's diagnostics, by transition (spec 8.9: the inspector MUST show them). */
export function ShowDiagnosticsList({
    diagnostics,
    t,
}: {
    diagnostics: readonly Diagnostic[];
    t: InspectorTranslate;
}) {
    const groups = useMemo(
        () => groupDiagnosticsByTransition(diagnostics),
        [diagnostics],
    );
    if (diagnostics.length === 0)
        return (
            <p className="text-sub" data-testid="timeline-show-diagnostics">
                {t("inspector.timeline.diagnostics.showNone")}
            </p>
        );
    return (
        <div
            className="flex flex-col gap-8"
            data-testid="timeline-show-diagnostics"
        >
            {groups.map((group) => (
                <ul
                    key={group.transitionId}
                    className="flex flex-col gap-4"
                    aria-label={t("inspector.timeline.diagnostics.transition", {
                        id: group.transitionId,
                    })}
                >
                    {group.diagnostics.map((d, i) => (
                        <DiagnosticItem
                            key={`${d.code}-${d.marcherId ?? ""}-${d.slot ?? ""}-${i}`}
                            diagnostic={d}
                            t={t}
                            showTransition
                        />
                    ))}
                </ul>
            ))}
        </div>
    );
}

/**
 * The playhead's beat and the move the window is on, held together while the playhead is scrubbed
 * (code review): the inspector's explanations and editors are rebuilt once the scrub ends, not on
 * every beat it passes, and keep showing the last settled ones meanwhile rather than going blank.
 * Held together, the held beat is never clamped into a move the scrubbing window passes over. As
 * `useTimelinePageBridge` waits for the scrub. While scrubbing the store's selectors return the
 * same value, so the scrub doesn't render this at all.
 */
export function useSettledInspectorWindow(): {
    beat: number;
    move: StoredTimelineMembership | null;
} {
    const liveBeat = useTimelineSelectionStore((s) =>
        s.scrubbing ? null : s.playheadBeat,
    );
    const liveMove = useTimelineSelectionStore((s) =>
        s.scrubbing ? undefined : windowMove(s),
    );
    const held = useRef<{
        beat: number;
        move: StoredTimelineMembership | null;
    } | null>(null);
    if (held.current === null) {
        // Mounted mid-scrub: what the store has now
        const state = useTimelineSelectionStore.getState();
        held.current = { beat: state.playheadBeat, move: windowMove(state) };
    }
    if (liveBeat !== null && liveMove !== undefined)
        held.current = { beat: liveBeat, move: liveMove };
    return held.current;
}

function TimelineInspectorContent() {
    const t = useInspectorTranslate();
    const { selectedMarchers } = useSelectedMarchers()!;
    const marcherIds = useMemo(
        () => selectedMarchers.map((m) => m.id),
        [selectedMarchers],
    );
    const labels = useMemo(
        () => new Map(selectedMarchers.map((m) => [m.id, m.drill_number])),
        [selectedMarchers],
    );
    // UI-14: in timeline mode the inspector explains at the paused playhead P, where edits land
    // (UI-10). On a flag that is the page's end beat, as before; between flags a mid-page move's
    // transitions show.
    // With the move the window is (isolated, P may be anywhere inside it), if it has a clip
    const { beat: playheadBeat, move } = useSettledInspectorWindow();
    // UI-14: with a move, explain inside it: at P, or its last beat when P is on its end, where
    // the next move starts. So the details below are about this move's transitions.
    const beat = move
        ? Math.min(Math.max(playheadBeat, move.start), move.end - 1)
        : playheadBeat;
    const [detailsOpen, setDetailsOpen] = useState(false);
    const {
        inspections,
        omitted,
        diagnostics,
        unknownMarcherIds,
        transitionEdits = NO_EDITS,
        shapeOptions = NO_SHAPES,
        assignmentEdits = NO_ASSIGNMENT_EDITS,
        shapeEdits = NO_SHAPE_EDITS,
    } = useTimelineInspections({
        database: db,
        enabled: true,
        marcherIds,
        beat,
    });
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const frame = useMemo(
        () => shapeFrameFor(fieldProperties ?? null),
        [fieldProperties],
    );
    // Each selected marcher's explanation and its transition's editors
    const details = (
        <>
            {inspections.map((inspection) => (
                <MarcherInspectionView
                    key={inspection.marcherId}
                    inspection={inspection}
                    label={labels.get(inspection.marcherId) ?? ""}
                    t={t}
                />
            ))}
            {transitionEdits.map((target) => {
                const slots = assignmentEdits.find(
                    (a) => a.transitionId === target.id,
                );
                return (
                    <Fragment key={target.id}>
                        <TimelineTransitionEditor
                            target={target}
                            shapes={shapeOptions}
                            database={db}
                            t={t}
                        />
                        {slots && (
                            <TimelineAssignmentsEditor
                                target={slots}
                                selectedMarcherIds={marcherIds}
                                labels={labels}
                                database={db}
                                t={t}
                            />
                        )}
                    </Fragment>
                );
            })}
        </>
    );
    return (
        <InspectorCollapsible
            defaultOpen
            translatableTitle={{ keyName: "inspector.timeline.title" }}
            className="mt-12 flex flex-col gap-16"
        >
            {move ? (
                inspections.length > 0 && (
                    <div className="flex flex-col gap-16">
                        <button
                            type="button"
                            data-testid="timeline-move-details-toggle"
                            // A move's control (UI-14 round-2 review): Enter opens it, rather than
                            // reaching the app's Enter shortcut (create a shape)
                            data-timeline-own-keys="true"
                            aria-expanded={detailsOpen}
                            onClick={() => setDetailsOpen((o) => !o)}
                            className="text-body focus-visible:text-accent flex items-center gap-6 text-left font-medium outline-hidden"
                        >
                            {detailsOpen ? (
                                <CaretDownIcon size={16} />
                            ) : (
                                <CaretRightIcon size={16} />
                            )}
                            {t("inspector.timeline.move.details", {
                                count: inspections.length + omitted,
                            })}
                        </button>
                        {detailsOpen && omitted > 0 && (
                            <p
                                className="text-sub text-text/60"
                                data-testid="timeline-move-details-capped"
                            >
                                {t("inspector.timeline.move.detailsCapped", {
                                    shown: inspections.length,
                                    count: inspections.length + omitted,
                                })}
                            </p>
                        )}
                        {detailsOpen && details}
                    </div>
                )
            ) : (
                <>
                    {details}
                    {omitted > 0 && (
                        <p className="text-sub text-text/60">
                            {t("inspector.timeline.omitted", {
                                count: omitted,
                            })}
                        </p>
                    )}
                </>
            )}
            {unknownMarcherIds.map((id) => (
                <p key={id} className="text-sub text-text/60">
                    {t("inspector.timeline.notInTimeline", {
                        marcher: labels.get(id) ?? "",
                    })}
                </p>
            ))}
            <TimelineShapesEditor
                shapes={shapeEdits.targets}
                version={shapeEdits.version}
                selectedMarcherIds={marcherIds}
                beat={beat}
                frame={frame}
                database={db}
                t={t}
            />
            <div>
                <h5 className="text-body font-medium">
                    {t("inspector.timeline.diagnostics.showTitle", {
                        count: diagnostics.length,
                    })}
                </h5>
                <ShowDiagnosticsList diagnostics={diagnostics} t={t} />
            </div>
        </InspectorCollapsible>
    );
}

/**
 * The inspector's timeline section (P8.5): for the selected marchers, why each is where it is at
 * the paused playhead (UI-14; it read the selected page's end beat before), from the resolver's
 * `explain`, and the show's diagnostics. While the window is a move with a clip, its Move card
 * comes first (UI-14). Only in timeline mode; with the flag off it renders nothing and reads
 * nothing.
 */
export function TimelineInspectorSection() {
    const timelineMode = useTimelineMode();
    if (!timelineMode) return null;
    return <TimelineInspectorContent />;
}

export default TimelineInspectorSection;
