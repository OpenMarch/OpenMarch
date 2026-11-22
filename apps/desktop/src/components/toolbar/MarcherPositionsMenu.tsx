import { useState } from "react";
import { T } from "@tolgee/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import ActionButton from "@/shortcuts/ActionButton";
import ClearPageMenuItems from "@/components/toolbar/ClearPageMenuItems";

const ITEM_CLASS = "text-text touch:min-h-44 px-6 py-4";

/**
 * The "All marchers ▾" menu (Alignment toolbar) and the "Selected marchers ▾" menu (marcher
 * inspector). Both list the same actions in the command palette's words, so a change here shows
 * in both: Clear Page N (and its "later pages move back too" variant) and Move to next page's spots.
 * Only the trigger's look differs between the two places.
 */
export default function MarcherPositionsMenu({
    scope,
    triggerClassName,
    caretSize,
}: {
    scope: "all" | "selected";
    triggerClassName: string;
    caretSize: number;
}) {
    const [open, setOpen] = useState(false);
    const close = () => setOpen(false);
    return (
        <Dropdown.Root open={open} onOpenChange={setOpen}>
            <Dropdown.Trigger className={triggerClassName}>
                <T
                    keyName={
                        scope === "all"
                            ? "toolbar.alignment.allMarchers"
                            : "toolbar.alignment.selectedMarchers"
                    }
                />{" "}
                <CaretDownIcon size={caretSize} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
                <Dropdown.Content className="bg-modal rounded-6 shadow-modal backdrop-blur-32 border-stroke flex flex-col items-start gap-0 border p-8">
                    <ClearPageMenuItems
                        scope={scope}
                        onRun={close}
                        className={ITEM_CLASS}
                    />
                    <ActionButton
                        action={
                            scope === "all"
                                ? "setAllMarchersToNextPage"
                                : "setSelectedMarchersToNextPage"
                        }
                        onRun={close}
                        className={ITEM_CLASS}
                    >
                        <T keyName="toolbar.alignment.moveToNextPageSpots" />
                    </ActionButton>
                </Dropdown.Content>
            </Dropdown.Portal>
        </Dropdown.Root>
    );
}
