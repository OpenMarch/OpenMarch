import * as RadioGroup from "@radix-ui/react-radio-group";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import type { EditorMode } from "@/stores/EditorModeStore";
import { editorModeImages } from "./editorModeImages";

export const EDITOR_MODES: readonly EditorMode[] = ["basic", "expert"];

export interface EditorModeCardsProps {
    /** The chosen mode; null shows neither card as chosen. */
    value: EditorMode | null;
    onChange: (mode: EditorMode) => void;
    /** "compact" fits a settings row; "large" is the welcome flow's. */
    size?: "compact" | "large";
    /** Accessible name of the group. */
    "aria-label"?: string;
    "aria-labelledby"?: string;
    id?: string;
}

/**
 * Basic and Expert as two selectable cards, each with a picture, a title and a
 * one-line description. A radio group: arrow keys move between the cards.
 */
export default function EditorModeCards({
    value,
    onChange,
    size = "compact",
    id,
    ...aria
}: EditorModeCardsProps) {
    const { t } = useTranslate();
    const large = size === "large";
    return (
        <RadioGroup.Root
            id={id}
            // An empty value checks no card; Radix still lets Tab reach the group.
            value={value ?? ""}
            onValueChange={(next) => {
                if (next === "basic" || next === "expert") onChange(next);
            }}
            className={clsx("grid grid-cols-2", large ? "gap-16" : "gap-12")}
            data-testid="editor-mode-cards"
            {...aria}
        >
            {EDITOR_MODES.map((mode) => {
                const checked = value === mode;
                const titleId = `editor-mode-${mode}-title${id ? `-${id}` : ""}`;
                const descriptionId = `editor-mode-${mode}-description${id ? `-${id}` : ""}`;
                return (
                    <RadioGroup.Item
                        key={mode}
                        value={mode}
                        aria-labelledby={titleId}
                        aria-describedby={descriptionId}
                        data-testid={`editor-mode-card-${mode}`}
                        className={clsx(
                            "rounded-6 flex min-w-0 flex-col items-stretch gap-8 border text-left transition-colors duration-150 ease-out",
                            "focus-visible:outline-accent outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2",
                            large ? "p-12" : "p-8",
                            checked
                                ? "bg-accent/20 border-accent"
                                : "bg-fg-2 border-stroke hover:border-accent/60",
                        )}
                    >
                        <img
                            src={editorModeImages[mode]}
                            alt=""
                            draggable={false}
                            className="rounded-4 border-stroke aspect-[14/3] w-full border object-cover object-left"
                        />
                        <span className="flex items-center gap-6">
                            {checked ? (
                                <CheckCircleIcon
                                    size={large ? 20 : 16}
                                    weight="fill"
                                    className="text-accent shrink-0"
                                />
                            ) : (
                                <CircleIcon
                                    size={large ? 20 : 16}
                                    className="text-text/50 shrink-0"
                                />
                            )}
                            <span
                                id={titleId}
                                className={clsx(
                                    "text-text font-medium",
                                    large ? "text-h5" : "text-body",
                                )}
                            >
                                {t(`settings.general.editorMode.${mode}`)}
                            </span>
                        </span>
                        <span
                            id={descriptionId}
                            className={clsx(
                                "text-text-subtitle",
                                large ? "text-body" : "text-sub",
                            )}
                        >
                            {t(
                                `settings.general.editorMode.${mode}.description`,
                            )}
                        </span>
                    </RadioGroup.Item>
                );
            })}
        </RadioGroup.Root>
    );
}
