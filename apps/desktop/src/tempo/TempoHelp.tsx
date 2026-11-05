/**
 * Edit music: how it works, behind the "?" in its header. Each row is an icon, a short title and
 * one sentence saying how (owner, 2026-11-04: not a gesture column read on into an effect column).
 */
import * as Popover from "@radix-ui/react-popover";
import {
    ArrowsOutCardinalIcon,
    BezierCurveIcon,
    ChartLineIcon,
    CursorClickIcon,
    HashIcon,
    MusicNotesIcon,
    PlusCircleIcon,
    QuestionIcon,
    SelectionIcon,
    TrendDownIcon,
    type Icon,
} from "@phosphor-icons/react";
import { ShortcutTooltip } from "@/components/timeline/ShortcutTooltip";
import Shortcut from "@/components/ui/Shortcut";
import tolgee from "@/global/singletons/Tolgee";
import { toolButton } from "./TempoToolbar";

/** How tempo mode works, behind a "?" in its header */
export function TempoHelp() {
    // Each row: an icon, a short title and a sentence saying how
    const rows: [id: string, icon: Icon, title: string, text: string][] = [
        [
            "dragLine",
            ChartLineIcon,
            tolgee.t("tempoMode.help.dragLine.title", "Set a tempo"),
            tolgee.t(
                "tempoMode.help.dragLine.text",
                "Drag the tempo line up or down. To type a tempo, right-click and choose Set tempo…",
            ),
        ],
        [
            "doubleClickLane",
            PlusCircleIcon,
            tolgee.t(
                "tempoMode.help.doubleClickLane.title",
                "Add a tempo change",
            ),
            tolgee.t(
                "tempoMode.help.doubleClickLane.text",
                "Double-click the tempo lane where it should change. Double-click a change's dot to remove it.",
            ),
        ],
        [
            "dragChangeDot",
            ArrowsOutCardinalIcon,
            tolgee.t(
                "tempoMode.help.dragChangeDot.title",
                "Move a tempo change",
            ),
            tolgee.t(
                "tempoMode.help.dragChangeDot.text",
                "Drag its dot up or down to change the tempo, or sideways to move where it changes.",
            ),
        ],
        [
            "dragRoundHandle",
            BezierCurveIcon,
            tolgee.t(
                "tempoMode.help.dragRoundHandle.title",
                "Change tempo gradually",
            ),
            tolgee.t(
                "tempoMode.help.dragRoundHandle.text",
                "Drag the round handle in the middle of a stretch. Double-click it to jump again.",
            ),
        ],
        [
            "dragEndDot",
            TrendDownIcon,
            tolgee.t(
                "tempoMode.help.dragEndDot.title",
                "Set where a rit. ends",
            ),
            tolgee.t(
                "tempoMode.help.dragEndDot.text",
                "Drag the square dot at the end of a stretch, so the next tempo can jump back (a tempo).",
            ),
        ],
        [
            "dragMeasures",
            SelectionIcon,
            tolgee.t("tempoMode.help.dragMeasures.title", "Select counts"),
            tolgee.t(
                "tempoMode.help.dragMeasures.text",
                "Drag along the measures or the music, then edit them all at once.",
            ),
        ],
        [
            "rightClick",
            CursorClickIcon,
            tolgee.t("tempoMode.help.rightClick.title", "Holds and counts"),
            tolgee.t(
                "tempoMode.help.rightClick.text",
                "Right-click a count to make it a hold, change tempo gradually, or add and remove counts.",
            ),
        ],
        [
            "rightClickMeasure",
            HashIcon,
            tolgee.t(
                "tempoMode.help.rightClickMeasure.title",
                "Measures and rehearsal marks",
            ),
            tolgee.t(
                "tempoMode.help.rightClickMeasure.text",
                "Right-click a measure to renumber it, set its time signature or add a mark. Drag a mark to move it.",
            ),
        ],
        [
            "musicFile",
            MusicNotesIcon,
            tolgee.t("tempoMode.help.musicFile.title", "Change the music"),
            tolgee.t(
                "tempoMode.help.musicFile.text",
                "Click the file's name in the header to switch, import or delete audio, or set the music offset.",
            ),
        ],
    ];
    // Each row: a binding for `Shortcut`, then what the key does
    const keys: [binding: string, what: string][] = [
        [
            "T",
            tolgee.t(
                "tempoMode.help.keys.tap",
                "Tap tempo: tap on each beat to see how fast it is",
            ),
        ],
        [
            "M",
            tolgee.t(
                "tempoMode.help.keys.mark",
                "Drop a rehearsal mark while playing",
            ),
        ],
        [
            "$mod+M",
            tolgee.t("tempoMode.help.keys.metronome", "Metronome on or off"),
        ],
        [
            "Space",
            tolgee.t(
                "tempoMode.help.keys.play",
                "Play from the playhead, or stop where it is",
            ),
        ],
        [
            "Escape",
            tolgee.t(
                "tempoMode.help.keys.escape",
                "Clear the selection, or cancel a drag; with nothing to clear, stop editing music",
            ),
        ],
        [
            "Shift + T",
            tolgee.t(
                "tempoMode.help.keys.toggle",
                "Start or stop editing music",
            ),
        ],
    ];
    const label = tolgee.t("tempoMode.help.label", "How editing music works");
    return (
        <Popover.Root>
            <ShortcutTooltip closeOnPress label={label}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={label}
                        className={toolButton(false, true)}
                    >
                        <QuestionIcon size={13} aria-hidden />
                    </button>
                </Popover.Trigger>
            </ShortcutTooltip>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    collisionPadding={8}
                    className="border-stroke bg-modal text-text shadow-modal rounded-8 z-[100] flex max-h-[var(--radix-popover-content-available-height)] w-[340px] max-w-[calc(100vw-16px)] flex-col gap-8 overflow-y-auto overscroll-contain border px-12 py-10 backdrop-blur-md"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="text-[12px] font-bold">
                        {tolgee.t(
                            "tempoMode.help.title",
                            "Line the counts up with the music",
                        )}
                    </div>
                    <ul className="flex flex-col gap-10 text-[11px]">
                        {rows.map(([id, RowIcon, title, text]) => (
                            <li key={id} className="flex gap-10">
                                <span className="bg-text/5 text-text rounded-6 flex size-24 shrink-0 items-center justify-center">
                                    <RowIcon size={14} aria-hidden />
                                </span>
                                <span className="flex min-w-0 flex-col gap-1">
                                    <span className="font-medium">{title}</span>
                                    <span className="text-text-subtitle leading-[1.4]">
                                        {text}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <ul className="border-stroke flex flex-col gap-4 border-t pt-8 text-[11px]">
                        {keys.map(([key, what]) => (
                            <li
                                key={key}
                                className="flex items-center justify-between gap-12 pl-[34px]"
                            >
                                <span className="text-text-subtitle">
                                    {what}
                                </span>
                                <Shortcut binding={key} />
                            </li>
                        ))}
                    </ul>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
