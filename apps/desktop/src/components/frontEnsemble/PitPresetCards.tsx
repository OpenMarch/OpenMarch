import * as RadioGroup from "@radix-ui/react-radio-group";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { useId } from "react";
import {
    PIT_PRESET_SIZES,
    pitPresetContents,
    type PitPresetSize,
} from "@/view3d/core/pit/presets";
import PitPresetPicture from "./PitPresetPicture";

const CHOICES = ["none", ...PIT_PRESET_SIZES] as const;
type Choice = (typeof CHOICES)[number];

/**
 * What a preset places, as a list: one line per kind of equipment, its count then its name,
 * podium and mixer included. Two columns keep the Large preset's ten lines short.
 */
export function PitPresetContents({
    size,
    id,
    className,
}: {
    size: PitPresetSize;
    id?: string;
    className?: string;
}) {
    const { t } = useTranslate();
    return (
        <ul
            id={id}
            className={clsx(
                "text-sub grid grid-cols-2 gap-x-12 gap-y-2",
                className,
            )}
            data-testid={`pit-preset-contents-${size}`}
        >
            {pitPresetContents(size).map(({ familyId, count }) => (
                <li key={familyId} className="flex min-w-0 gap-6">
                    <span className="text-text-subtitle w-12 shrink-0 text-right tabular-nums">
                        {count}
                    </span>
                    <span className="text-text truncate">
                        {t(`pit.family.${familyId}`)}
                    </span>
                </li>
            ))}
        </ul>
    );
}

/**
 * None, Small, Medium and Large as selectable rows, one under the other like the panel's
 * equipment list: a picture of that pit seen from above at the left, its name, and the list of
 * what it places. A new show's "Front ensemble?" question, and (without None) the empty front
 * ensemble view's presets. A radio group: arrow keys move between the rows.
 */
export default function PitPresetCards({
    value,
    onChange,
    includeNone = true,
    ...aria
}: {
    /** The chosen preset; null is None */
    value: PitPresetSize | null;
    onChange: (size: PitPresetSize | null) => void;
    /** Whether None is one of the rows */
    includeNone?: boolean;
    "aria-label"?: string;
    "aria-labelledby"?: string;
}) {
    const { t } = useTranslate();
    const idPrefix = useId();
    const selected: Choice = value ?? "none";
    const choices = includeNone ? CHOICES : PIT_PRESET_SIZES;
    return (
        <RadioGroup.Root
            value={selected}
            onValueChange={(next) => {
                if (next === "none") onChange(null);
                else if ((PIT_PRESET_SIZES as readonly string[]).includes(next))
                    onChange(next as PitPresetSize);
            }}
            className="flex flex-col gap-8"
            data-testid="pit-preset-cards"
            {...aria}
        >
            {choices.map((choice) => {
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
                            "rounded-6 flex min-w-0 flex-row items-start gap-12 border p-8 text-left transition-colors duration-150 ease-out",
                            "focus-visible:outline-accent outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2",
                            checked
                                ? "bg-accent/20 border-accent"
                                : "bg-fg-2 border-stroke hover:bg-fg-3",
                        )}
                    >
                        <PitPresetPicture
                            size={choice === "none" ? null : choice}
                            className="rounded-4 border-stroke block h-auto w-2/5 shrink-0 border"
                        />
                        <span className="flex min-w-0 grow flex-col gap-6">
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
                            {choice === "none" ? (
                                <span
                                    id={descriptionId}
                                    className="text-text-subtitle text-sub"
                                >
                                    {t("frontEnsemble.presets.summary.none")}
                                </span>
                            ) : (
                                <PitPresetContents
                                    id={descriptionId}
                                    size={choice}
                                />
                            )}
                        </span>
                    </RadioGroup.Item>
                );
            })}
        </RadioGroup.Root>
    );
}
