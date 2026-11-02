/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): how tempo mode works, behind the "?" in its
 * header.
 */
import { Fragment } from "react";
import * as Popover from "@radix-ui/react-popover";
import { QuestionIcon } from "@phosphor-icons/react";
import {
    Keycaps,
    ShortcutTooltip,
} from "@/components/timeline/ShortcutTooltip";
import { toolButton } from "./TempoToolbar";

/** How tempo mode works, behind a "?" in its header */
export function TempoHelp() {
    const rows: [string, string][] = [
        ["Drag a spot in the music", "onto its count"],
        [
            "Drag a count's handle",
            "(the triangle atop the music) onto the music",
        ],
        ["Shift while dragging", "moves just that count"],
        ["Drag the tempo line", "up or down; double-click it to type a tempo"],
        [
            "Double-click the tempo lane",
            "adds a tempo change there; double-click a change's dot to remove it",
        ],
        [
            "Drag a tempo change's dot",
            "up or down for its tempo, sideways to move where it changes",
        ],
        [
            "Drag a stretch's round handle",
            "makes a gradual change, straight or curved; double-click it for a jump again",
        ],
        ["Drag along Measures", "selects counts to edit"],
        [
            "Right-click",
            "pins, holds, tempo changes, adding and removing counts",
        ],
        [
            "Right-click a measure",
            "renumber from there (or double-click its number), rehearsal mark, time signature",
        ],
        ["Drag a rehearsal mark", "to another measure"],
    ];
    const keys: [string, string][] = [
        ["T", "Tap along (plays from a measure back; taps there count)"],
        ["M", "Drop a rehearsal mark while playing"],
        ["Space", "Play from the playhead, or stop where it is"],
        ["Enter", "Apply taps (while tapping: stop and apply)"],
        [
            "Esc",
            "Clear the selection, or cancel a drag or taps; with nothing to clear, leave tempo mode",
        ],
        ["Shift + T", "Tempo mode on and off"],
    ];
    return (
        <Popover.Root>
            <ShortcutTooltip closeOnPress label="How tempo mode works">
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label="How tempo mode works"
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
                        Line the counts up with the music
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[11px]">
                        {rows.map(([what, how]) => (
                            <Fragment key={what}>
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
                                    <Keycaps shortcut={key} />
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
