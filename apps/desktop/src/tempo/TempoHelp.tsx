/**
 * Tempo mode: how tempo mode works, behind the "?" in its
 * header.
 */
import { Fragment } from "react";
import * as Popover from "@radix-ui/react-popover";
import { QuestionIcon } from "@phosphor-icons/react";
import { ShortcutTooltip } from "@/components/timeline/ShortcutTooltip";
import Shortcut from "@/components/ui/Shortcut";
import tolgee from "@/global/singletons/Tolgee";
import { toolButton } from "./TempoToolbar";

/** How tempo mode works, behind a "?" in its header */
export function TempoHelp() {
    // Each row: a gesture, then what it does (a two-column list)
    const rows: [id: string, what: string, how: string][] = [
        [
            "dragMusic",
            tolgee.t(
                "tempoMode.help.dragMusic.gesture",
                "Drag a spot in the music",
            ),
            tolgee.t("tempoMode.help.dragMusic.effect", "onto its count"),
        ],
        [
            "dragHandle",
            tolgee.t(
                "tempoMode.help.dragHandle.gesture",
                "Drag a count's handle",
            ),
            tolgee.t(
                "tempoMode.help.dragHandle.effect",
                "(the triangle atop the music) onto the music",
            ),
        ],
        [
            "shiftDrag",
            tolgee.t(
                "tempoMode.help.shiftDrag.gesture",
                "Shift while dragging",
            ),
            tolgee.t(
                "tempoMode.help.shiftDrag.effect",
                "moves just that count",
            ),
        ],
        [
            "dragLine",
            tolgee.t("tempoMode.help.dragLine.gesture", "Drag the tempo line"),
            tolgee.t(
                "tempoMode.help.dragLine.effect",
                "up or down; right-click > Set tempo… to type one",
            ),
        ],
        [
            "doubleClickLane",
            tolgee.t(
                "tempoMode.help.doubleClickLane.gesture",
                "Double-click the tempo lane or line",
            ),
            tolgee.t(
                "tempoMode.help.doubleClickLane.effect",
                "adds a tempo change there; double-click a change's dot to remove it",
            ),
        ],
        [
            "dragChangeDot",
            tolgee.t(
                "tempoMode.help.dragChangeDot.gesture",
                "Drag a tempo change's dot",
            ),
            tolgee.t(
                "tempoMode.help.dragChangeDot.effect",
                "up or down for its tempo, sideways to move where it changes",
            ),
        ],
        [
            "dragRoundHandle",
            tolgee.t(
                "tempoMode.help.dragRoundHandle.gesture",
                "Drag a stretch's round handle",
            ),
            tolgee.t(
                "tempoMode.help.dragRoundHandle.effect",
                "makes a gradual change, straight or curved; double-click it for a jump again",
            ),
        ],
        [
            "dragEndDot",
            tolgee.t(
                "tempoMode.help.dragEndDot.gesture",
                "Drag a stretch's square end dot",
            ),
            tolgee.t(
                "tempoMode.help.dragEndDot.effect",
                "sets the tempo it ends on, so a rit. can jump back (a tempo); with a pinned count after it, the counts up to the pin make room",
            ),
        ],
        [
            "rightClickGradual",
            tolgee.t(
                "tempoMode.help.rightClickGradual.gesture",
                "Right-click in a gradual change",
            ),
            tolgee.t(
                "tempoMode.help.rightClickGradual.effect",
                "A tempo: back to the tempo it started at",
            ),
        ],
        [
            "dragMeasures",
            tolgee.t(
                "tempoMode.help.dragMeasures.gesture",
                "Drag along Measures",
            ),
            tolgee.t(
                "tempoMode.help.dragMeasures.effect",
                "selects counts to edit",
            ),
        ],
        [
            "rightClick",
            tolgee.t("tempoMode.help.rightClick.gesture", "Right-click"),
            tolgee.t(
                "tempoMode.help.rightClick.effect",
                "pins, holds, tempo changes, adding and removing counts",
            ),
        ],
        [
            "rightClickMeasure",
            tolgee.t(
                "tempoMode.help.rightClickMeasure.gesture",
                "Right-click a measure",
            ),
            tolgee.t(
                "tempoMode.help.rightClickMeasure.effect",
                "renumber from there (or double-click its number), rehearsal mark, time signature",
            ),
        ],
        [
            "dragMark",
            tolgee.t(
                "tempoMode.help.dragMark.gesture",
                "Drag a rehearsal mark",
            ),
            tolgee.t("tempoMode.help.dragMark.effect", "to another measure"),
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
                "Clear the selection, or cancel a drag; with nothing to clear, leave tempo mode",
            ),
        ],
        [
            "Shift + T",
            tolgee.t("tempoMode.help.keys.toggle", "Tempo mode on and off"),
        ],
    ];
    const label = tolgee.t("tempoMode.help.label", "How tempo mode works");
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
                    className="border-stroke bg-modal text-text shadow-modal rounded-8 z-[100] flex w-[340px] max-w-[calc(100vw-16px)] flex-col gap-8 border px-12 py-10 backdrop-blur-md"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="text-[12px] font-bold">
                        {tolgee.t(
                            "tempoMode.help.title",
                            "Line the counts up with the music",
                        )}
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[11px]">
                        {rows.map(([id, what, how]) => (
                            <Fragment key={id}>
                                <dt className="font-medium whitespace-nowrap">
                                    {what}
                                </dt>
                                <dd className="text-text-subtitle">{how}</dd>
                            </Fragment>
                        ))}
                    </dl>
                    <dl className="border-stroke grid grid-cols-[auto_1fr] items-center gap-x-8 gap-y-3 border-t pt-8 text-[11px]">
                        {keys.map(([key, what]) => (
                            <Fragment key={key}>
                                <dt>
                                    <Shortcut binding={key} />
                                </dt>
                                <dd className="text-text-subtitle">{what}</dd>
                            </Fragment>
                        ))}
                    </dl>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
