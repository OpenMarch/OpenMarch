import { useCallback, useRef, useState } from "react";
import { TrashIcon, WarningIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@openmarch/ui";
import type { DbConnection } from "@/db-functions/types";
import {
    applyAssignmentEdit,
    castBlocker,
    castCandidates,
    castMode,
    planAssignmentEdit,
    recastBlocker,
    summarizeSlots,
    type AssignmentEdit,
    type AssignmentEditTarget,
    type AssignmentMember,
} from "@/timeline/timelineAssignmentEditor";
import { MAX_CAST_SLOTS } from "@/timeline/timelineCasting";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { Field, Help, NumberField, shown } from "./TimelineTransitionEditor";
import type { TimelineInspectorStringKey } from "./timelineInspectorStrings";

type Translate = (
    key: TimelineInspectorStringKey,
    params?: Record<string, string | number>,
) => string;

/**
 * The most vacant slots listed one by one; the rest are counted. Members are always all listed,
 * so a big transition's vacancies can't hide anybody.
 */
export const MAX_LISTED_VACANT_SLOTS = 16;

function MemberRow({
    member,
    target,
    disabled,
    edit,
    t,
}: {
    member: AssignmentMember;
    target: AssignmentEditTarget;
    disabled: boolean;
    edit: (change: AssignmentEdit) => void;
    t: Translate;
}) {
    const id = member.assignmentId;
    return (
        <li
            className="flex flex-col gap-6"
            data-testid={`timeline-slot-${member.slot}`}
        >
            <div className="flex items-center justify-between gap-8">
                <span className="text-sub font-medium">
                    {t("inspector.timeline.assign.slotMember", {
                        slot: member.slot,
                        marcher: member.label,
                    })}
                </span>
                <Button
                    size="compact"
                    variant="secondary"
                    content="icon"
                    aria-label={t("inspector.timeline.assign.remove", {
                        marcher: member.label,
                    })}
                    disabled={disabled}
                    onClick={() => edit({ kind: "remove", assignmentId: id })}
                >
                    <TrashIcon size={16} />
                </Button>
            </div>
            <div className="flex flex-wrap items-center gap-6">
                <span className="text-sub text-text/60">
                    {t("inspector.timeline.label.slot")}
                </span>
                <NumberField
                    label={t("inspector.timeline.assign.slotFor", {
                        marcher: member.label,
                    })}
                    testId={`timeline-assign-slot-${id}`}
                    value={member.slot}
                    min={0}
                    max={target.slotCount - 1}
                    step={1}
                    disabled={disabled}
                    onCommit={(slot) =>
                        edit({ kind: "slot", assignmentId: id, slot })
                    }
                />
                <span className="text-sub text-text/60">
                    {t("inspector.timeline.label.layer")}
                </span>
                <NumberField
                    label={t("inspector.timeline.assign.layerFor", {
                        marcher: member.label,
                    })}
                    testId={`timeline-assign-layer-${id}`}
                    value={member.layer}
                    step={1}
                    disabled={disabled}
                    onCommit={(layer) =>
                        edit({ kind: "layer", assignmentId: id, layer })
                    }
                />
            </div>
            <div className="flex flex-wrap items-center gap-6">
                <span className="text-sub text-text/60">
                    {t("inspector.timeline.label.beats")}
                </span>
                <NumberField
                    label={t("inspector.timeline.assign.startFor", {
                        marcher: member.label,
                    })}
                    testId={`timeline-assign-start-${id}`}
                    value={member.start}
                    min={target.start}
                    max={target.end - 1}
                    step={1}
                    disabled={disabled}
                    onCommit={(start) =>
                        edit({
                            kind: "beats",
                            assignmentId: id,
                            start,
                            end: member.end,
                        })
                    }
                />
                <NumberField
                    label={t("inspector.timeline.assign.endFor", {
                        marcher: member.label,
                    })}
                    testId={`timeline-assign-end-${id}`}
                    value={member.end}
                    min={target.start + 1}
                    max={target.end}
                    step={1}
                    disabled={disabled}
                    onCommit={(end) =>
                        edit({
                            kind: "beats",
                            assignmentId: id,
                            start: member.start,
                            end,
                        })
                    }
                />
            </div>
            {member.stolen.length === 0 ? (
                <Help>{t("inspector.timeline.assign.notStolen")}</Help>
            ) : (
                member.stolen.map((s) => (
                    <Help
                        key={`${s.start}-${s.end}`}
                        testId={`timeline-assign-stolen-${id}`}
                    >
                        {s.byTransitionId === null
                            ? t("inspector.timeline.assign.stolen", {
                                  start: shown(s.start),
                                  end: shown(s.end),
                              })
                            : t("inspector.timeline.assign.stolenBy", {
                                  start: shown(s.start),
                                  end: shown(s.end),
                                  transition: s.byTransitionId,
                              })}
                    </Help>
                ))
            )}
        </li>
    );
}

function castHelp(
    target: AssignmentEditTarget,
    candidates: readonly number[],
    blocker: ReturnType<typeof castBlocker>,
    t: Translate,
): string {
    switch (blocker) {
        case null:
            return castMode(target) === "nearest"
                ? t("inspector.timeline.assign.castHelp", {
                      count: candidates.length,
                  })
                : t("inspector.timeline.assign.castHelpFtl", {
                      count: candidates.length,
                  });
        case "noVacancy":
            return t("inspector.timeline.assign.castNoVacancy", {
                count: candidates.length,
                vacant: target.vacantSlots.length,
            });
        case "tooManySlots":
            return t("inspector.timeline.assign.tooManySlots", {
                max: MAX_CAST_SLOTS,
            });
        case "allCast":
            return t("inspector.timeline.assign.castAllCast");
        case "noneSelected":
            return t("inspector.timeline.assign.castNoneSelected");
    }
}

function recastHelp(
    blocker: ReturnType<typeof recastBlocker>,
    t: Translate,
): string {
    switch (blocker) {
        case null:
            return t("inspector.timeline.assign.recastHelp");
        case "followTheLeader":
            return t("inspector.timeline.assign.recastFtl");
        case "tooManySlots":
            return t("inspector.timeline.assign.tooManySlots", {
                max: MAX_CAST_SLOTS,
            });
        case "noMembers":
            return t("inspector.timeline.assign.recastNoMembers");
    }
}

/**
 * A transition's slots and assignments (P8.4): who is in each slot, which slots are vacant
 * (D-13), each assignment's slot, layer and beats, and where a higher layer steals it (R-2).
 * Casts the selected marchers into vacant slots, or recasts everyone, by nearest slot (lowest
 * vacant slots for follow the leader). Each change is one undoable edit, a change that writes
 * nothing is skipped, and a refusal is a toast with its friendly message.
 */
export function TimelineAssignmentsEditor({
    target,
    selectedMarcherIds,
    labels,
    database,
    t,
}: {
    target: AssignmentEditTarget;
    selectedMarcherIds: readonly number[];
    /** Drill numbers of the selected marchers, to name the ones a cast makes steal */
    labels: ReadonlyMap<number, string>;
    database: DbConnection;
    t: Translate;
}) {
    /**
     * The store version the last committed edit was planned from. The controls stay disabled
     * until a target built from a newer version arrives: a target rebuilt from the same rows (by
     * scrubbing or playback) is still the one before the edit, and a second edit planned from it
     * would undo the first or name rows the first replaced. The ref guards clicks before the next
     * render.
     */
    const plannedAt = useRef<number | null>(null);
    const [awaiting, setAwaiting] = useState<number | null>(null);
    const pending = awaiting !== null && awaiting >= target.version;
    const edit = useCallback(
        async (change: AssignmentEdit) => {
            if (
                plannedAt.current !== null &&
                plannedAt.current >= target.version
            )
                return;
            const plan = planAssignmentEdit(target, change);
            if (plan === null) return;
            plannedAt.current = target.version;
            setAwaiting(target.version);
            let result;
            try {
                result = await applyAssignmentEdit(
                    database,
                    plan,
                    target.transitionId,
                );
            } catch (error) {
                // Nothing was written, so the shown target is still current
                plannedAt.current = null;
                setAwaiting(null);
                toastTimelineError(error);
                return;
            }
            if (result && result.steals.length > 0)
                toast.info(
                    t("inspector.timeline.assign.castStole", {
                        list: result.steals
                            .map((s) =>
                                t("inspector.timeline.assign.castStoleItem", {
                                    marcher:
                                        labels.get(s.marcherId) ??
                                        String(s.marcherId),
                                    transitions: s.transitionIds.join(", "),
                                }),
                            )
                            .join("; "),
                    }),
                );
        },
        [target, database, labels, t],
    );

    const candidates = castCandidates(target, selectedMarcherIds);
    const cannotCast = castBlocker(
        target,
        candidates,
        selectedMarcherIds.length,
    );
    const cannotRecast = recastBlocker(target);
    const listedVacant = target.vacantSlots.slice(0, MAX_LISTED_VACANT_SLOTS);
    const rows = [
        ...target.members.map((member) => ({ slot: member.slot, member })),
        ...listedVacant.map((slot) => ({ slot, member: null })),
    ].sort((a, b) => a.slot - b.slot);
    const unlistedVacant = target.vacantSlots.length - listedVacant.length;

    return (
        <section
            className="flex flex-col gap-12"
            data-testid={`timeline-assignments-editor-${target.transitionId}`}
            aria-label={t("inspector.timeline.assign.title", {
                id: target.transitionId,
            })}
        >
            <div>
                <h5 className="text-body font-medium">
                    {t("inspector.timeline.assign.title", {
                        id: target.transitionId,
                    })}
                </h5>
                <p className="text-sub text-text/60">
                    {t("inspector.timeline.assign.filled", {
                        filled: target.members.length,
                        count: target.slotCount,
                    })}
                </p>
                {target.vacantSlots.length === 0 ? (
                    <p className="text-sub text-text/60">
                        {t("inspector.timeline.assign.noVacant")}
                    </p>
                ) : (
                    <p
                        className="text-sub flex items-start gap-6"
                        data-testid="timeline-assign-vacancies"
                    >
                        <WarningIcon
                            size={16}
                            className="text-yellow mt-2 shrink-0"
                            aria-hidden
                        />
                        {t("inspector.timeline.assign.vacantList", {
                            count: target.vacantSlots.length,
                            slots: summarizeSlots(target.vacantSlots),
                        })}
                    </p>
                )}
            </div>

            <Field
                label={t("inspector.timeline.assign.casting")}
                help={
                    <>
                        <Help testId="timeline-assign-cast-help">
                            {castHelp(target, candidates, cannotCast, t)}
                        </Help>
                        <Help testId="timeline-assign-recast-help">
                            {recastHelp(cannotRecast, t)}
                        </Help>
                    </>
                }
            >
                <div className="flex flex-wrap gap-6">
                    <Button
                        size="compact"
                        variant="secondary"
                        disabled={pending || cannotCast !== null}
                        onClick={() =>
                            void edit({ kind: "cast", marcherIds: candidates })
                        }
                    >
                        {t("inspector.timeline.assign.cast")}
                    </Button>
                    <Button
                        size="compact"
                        variant="secondary"
                        disabled={pending || cannotRecast !== null}
                        onClick={() => void edit({ kind: "recast" })}
                    >
                        {t("inspector.timeline.assign.recast")}
                    </Button>
                </div>
            </Field>

            <Field
                label={t("inspector.timeline.assign.slots")}
                help={
                    <>
                        <Help>{t("inspector.timeline.assign.slotHelp")}</Help>
                        <Help>{t("inspector.timeline.assign.layerHelp")}</Help>
                    </>
                }
            >
                <ol className="flex flex-col gap-8">
                    {rows.map(({ slot, member }) =>
                        member ? (
                            <MemberRow
                                key={slot}
                                member={member}
                                target={target}
                                disabled={pending}
                                edit={(change) => void edit(change)}
                                t={t}
                            />
                        ) : (
                            <li
                                key={slot}
                                className="text-sub flex items-center gap-6"
                                data-testid={`timeline-slot-${slot}`}
                            >
                                <WarningIcon
                                    size={16}
                                    className="text-yellow shrink-0"
                                    aria-hidden
                                />
                                {t("inspector.timeline.assign.vacantSlot", {
                                    slot,
                                })}
                            </li>
                        ),
                    )}
                </ol>
                {unlistedVacant > 0 && (
                    <Help testId="timeline-assign-more-vacant">
                        {t("inspector.timeline.assign.moreVacant", {
                            count: unlistedVacant,
                        })}
                    </Help>
                )}
            </Field>
        </section>
    );
}

export default TimelineAssignmentsEditor;
