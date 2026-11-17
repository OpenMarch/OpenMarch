import * as RadioGroup from "@radix-ui/react-radio-group";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { useId } from "react";
import {
    PIT_PRESET_SIZES,
    type PitPresetSize,
} from "@/view3d/core/pit/presets";
import PitPresetPicture from "./PitPresetPicture";

const CHOICES = ["none", ...PIT_PRESET_SIZES] as const;
type Choice = (typeof CHOICES)[number];

/**
 * None, Small, Medium and Large as selectable cards, each with a picture of that pit seen from
 * above, its name and what it holds: a new show's "Front ensemble?" question. A radio group: arrow
 * keys move between the cards.
 */
export default function PitPresetCards({
    value,
    onChange,
    ...aria
}: {
    /** The chosen preset; null is None */
    value: PitPresetSize | null;
    onChange: (size: PitPresetSize | null) => void;
    "aria-label"?: string;
    "aria-labelledby"?: string;
}) {
    const { t } = useTranslate();
    const idPrefix = useId();
    const selected: Choice = value ?? "none";
    return (
        <RadioGroup.Root
            value={selected}
            onValueChange={(next) => {
                if (next === "none") onChange(null);
                else if ((PIT_PRESET_SIZES as readonly string[]).includes(next))
                    onChange(next as PitPresetSize);
            }}
            className="grid grid-cols-2 gap-12"
            data-testid="pit-preset-cards"
            {...aria}
        >
            {CHOICES.map((choice) => {
                const checked = selected === choice;
                const titleId = `${idPrefix}-${choice}-title`;
                const descriptionId = `${idPrefix}-${choice}-description`;
                return (
                    <RadioGroup.Item
                        key={choice}
                        value={choice}
                        aria-labelledby={titleId}
                        aria-describedby={descriptionId}
                        data-testid={`pit-preset-card-${choice}`}
                        className={clsx(
                            "rounded-6 flex min-w-0 flex-col items-stretch gap-8 border p-8 text-left transition-colors duration-150 ease-out",
                            "focus-visible:outline-accent outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2",
                            checked
                                ? "bg-accent/20 border-accent"
                                : "bg-fg-2 border-stroke hover:border-accent/60",
                        )}
                    >
                        <PitPresetPicture
                            size={choice === "none" ? null : choice}
                            className="rounded-4 border-stroke block h-auto w-full border"
                        />
                        <span className="flex items-center gap-6">
                            {checked ? (
                                <CheckCircleIcon
                                    size={16}
                                    weight="fill"
                                    className="text-accent shrink-0"
                                />
                            ) : (
                                <CircleIcon
                                    size={16}
                                    className="text-text/50 shrink-0"
                                />
                            )}
                            <span
                                id={titleId}
                                className="text-text text-body font-medium"
                            >
                                {choice === "none"
                                    ? t("frontEnsemble.presets.none")
                                    : t(`frontEnsemble.presets.${choice}`)}
                            </span>
                        </span>
                        <span
                            id={descriptionId}
                            className="text-text-subtitle text-sub"
                        >
                            {choice === "none"
                                ? t("frontEnsemble.presets.summary.none")
                                : t(`frontEnsemble.presets.summary.${choice}`)}
                        </span>
                    </RadioGroup.Item>
                );
            })}
        </RadioGroup.Root>
    );
}
