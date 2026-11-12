import { useId } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useTranslate } from "@tolgee/react";
import {
    ArrowsOutSimpleIcon,
    HandSwipeRightIcon,
    MouseLeftClickIcon,
    MouseRightClickIcon,
    MouseScrollIcon,
    type Icon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import {
    CONTROL_SCHEMES,
    SCHEME_GESTURES,
    type ControlScheme,
    type GestureInput,
} from "./controlScheme";

const INPUT_ICONS: Record<GestureInput, Icon> = {
    drag: MouseLeftClickIcon,
    rightDrag: MouseRightClickIcon,
    scroll: MouseScrollIcon,
    swipe: HandSwipeRightIcon,
    pinch: ArrowsOutSimpleIcon,
};

/**
 * The Controls choice as three cards, each listing its gestures (an icon and
 * a muted name for the input, then the camera move), so the schemes can be
 * compared before picking one. Side by side where there's room, stacked in
 * the narrow View settings panel. Used in Settings > 3D View and in the 3D View's View settings.
 * Plain React: the Settings window imports it, so nothing here may load three.js.
 */
export default function ControlSchemePicker({
    id,
    value,
    onChange,
    testId,
}: {
    id?: string;
    value: ControlScheme;
    onChange: (scheme: ControlScheme) => void;
    testId?: string;
}) {
    const { t } = useTranslate();
    const idBase = useId();
    return (
        <div className="@container w-full max-w-640">
            <ToggleGroup.Root
                id={id}
                type="single"
                value={value}
                // Radix sends "" when the active card is clicked again; keep it.
                onValueChange={(next) => {
                    if (next) onChange(next as ControlScheme);
                }}
                aria-label={t("settings.view3d.controls")}
                data-testid={testId}
                className="grid grid-cols-1 gap-8 @lg:grid-cols-3"
            >
                {CONTROL_SCHEMES.map((scheme) => (
                    <ToggleGroup.Item
                        key={scheme}
                        value={scheme}
                        data-value={scheme}
                        // Named by the title alone, so a screen reader doesn't
                        // read every gesture on each arrow press; the list
                        // describes it.
                        aria-labelledby={`${idBase}-${scheme}-name`}
                        aria-describedby={`${idBase}-${scheme}-gestures`}
                        className={clsx(
                            "rounded-6 text-text flex min-w-0 flex-col gap-6 border p-8 text-left outline-hidden duration-150 ease-out",
                            "border-stroke bg-fg-2 hover:border-text/30",
                            // bg-fg-2 is a gradient image, which would hide the tint
                            "data-[state=on]:border-accent data-[state=on]:bg-accent/10 data-[state=on]:hover:border-accent data-[state=on]:bg-none",
                            "focus-visible:ring-accent focus-visible:ring-2",
                        )}
                    >
                        <span
                            id={`${idBase}-${scheme}-name`}
                            className="text-body font-medium"
                        >
                            {t(`settings.view3d.controls.${scheme}`)}
                        </span>
                        <span
                            id={`${idBase}-${scheme}-gestures`}
                            className="text-sub flex flex-col gap-4"
                        >
                            {SCHEME_GESTURES[scheme].map(({ input, move }) => {
                                const InputIcon = INPUT_ICONS[input];
                                const inputName = t(
                                    `settings.view3d.controls.input.${input}`,
                                );
                                const moveName = t(
                                    `settings.view3d.controls.move.${move}`,
                                );
                                return (
                                    <span
                                        key={input}
                                        className="flex items-center gap-6"
                                    >
                                        <InputIcon
                                            size={18}
                                            className="text-text-subtitle shrink-0"
                                            aria-hidden
                                        />
                                        <span className="text-text-subtitle min-w-0 flex-1 break-words">
                                            {inputName}
                                        </span>
                                        <span className="shrink-0">
                                            {moveName}
                                        </span>
                                    </span>
                                );
                            })}
                        </span>
                    </ToggleGroup.Item>
                ))}
            </ToggleGroup.Root>
        </div>
    );
}
