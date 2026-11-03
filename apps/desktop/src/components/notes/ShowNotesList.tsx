/**
 * "Show checks" (ADR 0002 D-22, C2.6): the show's one quiet list, in the inspector in the Editor
 * and in Visuals, and an item's own checks in its editor. Never a modal or a block. Each row names
 * what and where ("Page 1 count 7", as the transport says it); clicking it moves the playhead
 * there and selects what it names, and a row offers its one-click fix when it has one.
 *
 * Named "checks" so it doesn't sit beside the page's and the cue's free-text "Notes".
 */
import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import { InfoIcon, WarningIcon } from "@phosphor-icons/react";
import { notesForItem, type ShowNote } from "@/notes/showNotes";
import {
    snapItemToHolderMutationOptions,
    useShowNotes,
} from "@/hooks/useShowNotes";
import { allMarcherRowsQueryOptions } from "@/hooks/queries/useMarchers";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { beatWhere, type NamedPageBox } from "@/timeline/timelineRangeWords";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import { formatAndList } from "@/utilities/formatList";
import { InspectorCollapsible } from "@/components/inspector/InspectorCollapsible";

export interface NotesViewProps {
    notes: readonly ShowNote[];
    /** The page boxes, to say each note's count as the transport does */
    pageBoxes: readonly NamedPageBox[];
    itemName: (itemId: number) => string;
    marcherName: (marcherId: number) => string;
    /** Snap to holder, for a put-down drift note */
    onSnap: (placementId: number) => void;
    /** A fix in flight: its button waits */
    snapping?: number | null;
    /** Clicking a note: seek to its count and select what it names */
    onPick?: (note: ShowNote) => void;
}

type Translate = ReturnType<typeof useTranslate>["t"];

/** Names, up to three, then a count. */
const names = (t: Translate, list: readonly string[]) =>
    list.length > 3
        ? t("showChecks.performers", { count: list.length })
        : formatAndList(list);

/** A note's line and its detail, in the designer's words. */
export function noteText(
    t: Translate,
    note: ShowNote,
    {
        pageBoxes,
        itemName,
        marcherName,
    }: Pick<NotesViewProps, "pageBoxes" | "itemName" | "marcherName">,
): { text: string; detail?: string } {
    const at = note.beat === null ? null : beatWhere(note.beat, pageBoxes);
    const where = at
        ? translateTimelineText(at, (key, params) => t(key, params))
        : null;
    const withWhere = (text: string) =>
        note.beat === null
            ? text
            : where
              ? t("showChecks.withWhere", { text, where })
              : t("showChecks.withStart", { text });
    const [itemId, ...others] = note.what.itemIds;
    const item = itemId === undefined ? "" : itemName(itemId);
    const who = names(t, note.what.marcherIds.map(marcherName));
    switch (note.kind) {
        case "hand_conflict": {
            const hand = note.detail?.hand ?? "both";
            const takers = others.map(itemName);
            const other = formatAndList(takers);
            return {
                text: withWhere(t("showChecks.handConflict", { item })),
                detail: !note.detail?.byCarry
                    ? t("showChecks.handConflictDetail", {
                          other,
                          count: takers.length,
                          who,
                          hand,
                      })
                    : takers.length === 0
                      ? t("showChecks.handConflictByCarry", { who, hand })
                      : t("showChecks.handConflictWithCarry", {
                            other,
                            who,
                            hand,
                        }),
            };
        }
        case "short_handed_hold":
            return {
                text: withWhere(t("showChecks.shortHanded", { item })),
                detail: t("showChecks.shortHandedDetail", {
                    who,
                    held: note.detail?.held ?? 0,
                    needed: note.detail?.needed ?? 2,
                }),
            };
        case "put_down_drift":
            return {
                text: withWhere(t("showChecks.putDownDrift", { item })),
                detail: t("showChecks.putDownDriftDetail", { who }),
            };
        case "crew_distance":
            return {
                text: withWhere(t("showChecks.crewDistance", { item })),
                detail: t("showChecks.crewDistanceDetail", { who }),
            };
        case "crewless_move":
            return { text: withWhere(t("showChecks.crewlessMove", { item })) };
        case "carry_mismatch":
            return {
                text: withWhere(t("showChecks.carryMismatch")),
                detail: who ? t("showChecks.forWho", { who }) : undefined,
            };
        case "silk_aspect":
            return {
                text: withWhere(t("showChecks.silkAspect")),
                detail: who ? t("showChecks.forWho", { who }) : undefined,
            };
    }
}

function NoteRow({
    note,
    ...props
}: { note: ShowNote } & Omit<NotesViewProps, "notes">) {
    const { t } = useTranslate();
    const { text, detail } = noteText(t, note, props);
    const action = note.action;
    const warning = note.detail?.level === "warning";
    const Icon = warning ? WarningIcon : InfoIcon;
    return (
        <li
            className="flex items-start justify-between gap-8"
            data-testid="show-note"
            data-note-kind={note.kind}
            data-note-beat={note.beat ?? ""}
        >
            <button
                type="button"
                className="hover:bg-fg-2 rounded-6 flex min-w-0 flex-1 items-start gap-6 px-4 py-4 text-left"
                onClick={() => props.onPick?.(note)}
                title={t("showChecks.pick")}
            >
                <Icon
                    size={16}
                    className={
                        warning
                            ? "text-yellow mt-2 shrink-0"
                            : "text-text-subtitle mt-2 shrink-0"
                    }
                    aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                    <span className="text-body text-text">{text}</span>
                    {detail && (
                        <span className="text-sub text-text-subtitle">
                            {detail}
                        </span>
                    )}
                </span>
            </button>
            {action?.kind === "snap_to_holder" && (
                <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    className="mt-4 shrink-0"
                    disabled={props.snapping === action.placementId}
                    onClick={() => props.onSnap(action.placementId)}
                >
                    {t("showChecks.snapToHolder")}
                </Button>
            )}
        </li>
    );
}

/** The show-wide list, from data the caller passes. */
export function ShowNotesListView({ notes, ...props }: NotesViewProps) {
    const { t } = useTranslate();
    return (
        <section
            className="flex flex-col gap-4"
            aria-label={t("showChecks.title")}
            data-testid="show-notes"
        >
            {notes.length === 0 ? (
                <p className="text-sub text-text-subtitle">
                    {t("showChecks.empty")}
                </p>
            ) : (
                <ul className="flex flex-col">
                    {notes.map((note) => (
                        <NoteRow key={note.id} note={note} {...props} />
                    ))}
                </ul>
            )}
        </section>
    );
}

/** One item's checks, for its readout; nothing when it has none. */
export function ItemNotesView({
    itemId,
    notes,
    ...props
}: NotesViewProps & { itemId: number }) {
    const own = notesForItem(notes, itemId);
    if (own.length === 0) return null;
    return (
        <ul className="flex flex-col" data-testid="item-notes">
            {own.map((note) => (
                <NoteRow key={note.id} note={note} {...props} />
            ))}
        </ul>
    );
}

/** The live checks with their actions: Snap to holder, and click to seek and select. */
function useLiveNotes(): NotesViewProps & { notes: ShowNote[] } {
    const { notes, itemName, itemMarcherId, marcherName } = useShowNotes();
    const pageBoxes = useTimelineSelectionStore((s) => s.pageBoxes);
    const snap = useMutation(snapItemToHolderMutationOptions());
    const { data: rows } = useQuery(allMarcherRowsQueryOptions());
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const byId = useMemo(
        () => new Map((rows ?? []).map((m) => [m.id, m])),
        [rows],
    );
    return {
        notes,
        pageBoxes,
        itemName,
        marcherName,
        onSnap: (id) => snap.mutate(id),
        snapping: snap.isPending ? (snap.variables ?? null) : null,
        onPick: (note) => {
            if (note.beat !== null)
                useTimelineSelectionStore.getState().seek(note.beat);
            const ids = [
                ...note.what.itemIds.flatMap((id) => {
                    const m = itemMarcherId(id);
                    return m === undefined ? [] : [m];
                }),
                ...note.what.marcherIds,
            ];
            const picked = [...new Set(ids)].flatMap((id) => {
                const m = byId.get(id);
                return m ? [m] : [];
            });
            if (picked.length > 0) setSelectedMarchers(picked);
        },
    };
}

/** The show's checks list, live. */
export default function ShowNotesList() {
    return <ShowNotesListView {...useLiveNotes()} />;
}

/** The inspector's "Show checks (N)" section, in the Editor and in Visuals. */
export function ShowChecksSection() {
    const live = useLiveNotes();
    return (
        <div data-testid="show-checks">
            <InspectorCollapsible
                defaultOpen
                translatableTitle={{
                    keyName: "showChecks.titleCount",
                    parameters: { count: live.notes.length },
                }}
                className="mt-12 flex flex-col gap-8"
            >
                <ShowNotesListView {...live} />
            </InspectorCollapsible>
        </div>
    );
}

/** An item's checks, live. */
export function ItemNotes({ itemId }: { itemId: number }) {
    return <ItemNotesView itemId={itemId} {...useLiveNotes()} />;
}
