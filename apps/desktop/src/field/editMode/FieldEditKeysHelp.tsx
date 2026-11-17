import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { T, useTranslate } from "@tolgee/react";
import { getButtonClassName } from "@openmarch/ui";
import { KeyboardIcon } from "@phosphor-icons/react";
import { POPOVER_CLASS } from "@/components/ui/popupClasses";
import Shortcut from "@/components/ui/Shortcut";
import { Tip } from "@/components/ui/Tip";
import { useIsTouchMode } from "@/stores/InputModeStore";
import type { ActionId } from "@/shortcuts/definitions";
import { getActionLabel } from "@/shortcuts/labels";

/** The keys the help lists, in the order you'd use them */
const KEYS: readonly ActionId[] = [
    "fieldEditNextLine",
    "fieldEditPreviousLine",
    "fieldEditNextPane",
    "fieldEditEditLine",
    "fieldEditToggleVisible",
    "fieldEditToggleReference",
    "fieldEditDeleteLines",
    "fieldEditNudgeRight",
    "fieldEditNudgeRightFine",
    "fieldEditAddXLine",
    "fieldEditAddYLine",
    "fieldEditMirror",
    "fieldEditDone",
];

/**
 * The Lines tab's keyboard help (#824): how the keyboard gets around the mode (Tab walks the lines while
 * the field has the keyboard; F6 moves between the field and the Field panel) and the
 * mode's keys, each with its shortcut as the user has it.
 */
export function FieldEditKeysHelp() {
    const { t } = useTranslate();
    const [open, setOpen] = useState(false);
    const isTouch = useIsTouchMode();
    const translate = (key: string, params?: Record<string, string | number>) =>
        t(key, params as never);
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Tip label={t("fieldEditMode.help.button")} disabled={isTouch}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        data-testid="field-edit-keys"
                        aria-label={t("fieldEditMode.help.button")}
                        className={`${getButtonClassName({ variant: "ghost", size: "compact", content: "icon" })} text-text-subtitle`}
                    >
                        <KeyboardIcon size={16} />
                    </button>
                </Popover.Trigger>
            </Tip>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    data-testid="field-edit-keys-help"
                    className={`${POPOVER_CLASS} z-50 flex w-320 flex-col gap-8`}
                >
                    <p className="text-body font-medium">
                        {t("fieldEditMode.help.title")}
                    </p>
                    <p className="text-sub text-text-subtitle">
                        <T
                            keyName="fieldEditMode.help.route"
                            params={{
                                tab: () => (
                                    <Shortcut action="fieldEditNextLine" />
                                ),
                                pane: () => (
                                    <Shortcut action="fieldEditNextPane" />
                                ),
                            }}
                        />
                    </p>
                    <ul className="flex flex-col gap-4">
                        {KEYS.map((action) => (
                            <li
                                key={action}
                                className="text-sub flex items-center justify-between gap-8"
                            >
                                <span>{getActionLabel(action, translate)}</span>
                                <Shortcut action={action} />
                            </li>
                        ))}
                    </ul>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
