import { useId } from "react";
import { useTranslate } from "@tolgee/react";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import {
    DIRECTION_CHANGES,
    DOT_MODES,
    HOLDS_WHILE_BAND_MOVES,
    STEP_OFF_FEET,
    performerDefaults,
    type PerformerDefaults,
    type SavedPerformerDefaults,
} from "@/view3d/core/performerDefaults";

/** Each choice's option names, as translation keys. */
const OPTION_KEYS = {
    stepOffFoot: {
        left: "workspaceSettings.performer.stepOffFoot.left",
        right: "workspaceSettings.performer.stepOffFoot.right",
    },
    dotMode: {
        foot: "workspaceSettings.performer.dotMode.foot",
        body: "workspaceSettings.performer.dotMode.body",
    },
    directionChange: {
        corner: "workspaceSettings.performer.directionChange.corner",
        direct: "workspaceSettings.performer.directionChange.direct",
    },
    holdWhileBandMoves: {
        markTime: "workspaceSettings.performer.holdWhileBandMoves.markTime",
        highMarkTime:
            "workspaceSettings.performer.holdWhileBandMoves.highMarkTime",
        stand: "workspaceSettings.performer.holdWhileBandMoves.stand",
    },
} as const;

const LABEL_KEYS: Record<keyof PerformerDefaults, string> = {
    stepOffFoot: "workspaceSettings.performer.stepOffFoot.label",
    dotMode: "workspaceSettings.performer.dotMode.label",
    directionChange: "workspaceSettings.performer.directionChange.label",
    holdWhileBandMoves: "workspaceSettings.performer.holdWhileBandMoves.label",
};

const OPTIONS: {
    [K in keyof PerformerDefaults]: readonly PerformerDefaults[K][];
} = {
    stepOffFoot: STEP_OFF_FEET,
    dotMode: DOT_MODES,
    directionChange: DIRECTION_CHANGES,
    holdWhileBandMoves: HOLDS_WHILE_BAND_MOVES,
};

const FIELDS = Object.keys(LABEL_KEYS) as (keyof PerformerDefaults)[];

/**
 * Show settings' "Performer defaults": how the 3D View's marchers move
 * wherever no cue says otherwise (`core/performerDefaults.ts`).
 */
export function PerformerDefaultsFields({
    value,
    onChange,
}: {
    value: SavedPerformerDefaults | undefined;
    onChange: (next: SavedPerformerDefaults) => void;
}) {
    const { t } = useTranslate();
    const headingId = useId();
    const current = performerDefaults(value);

    return (
        <section
            aria-labelledby={headingId}
            className="border-stroke flex flex-col gap-12 border-t pt-16"
        >
            <div className="flex flex-col gap-4 px-12">
                <h5 id={headingId} className="text-h5 leading-none">
                    {t("workspaceSettings.performer.title")}
                </h5>
                <p className="text-sub text-text-subtitle">
                    {t("workspaceSettings.performer.description")}
                </p>
            </div>
            {FIELDS.map((field) => {
                const keys = OPTION_KEYS[field] as Record<string, string>;
                return (
                    <div
                        key={field}
                        className="flex items-center justify-between gap-6 px-12"
                    >
                        <span className="text-body text-text/80">
                            {t(LABEL_KEYS[field])}
                        </span>
                        <Select
                            value={current[field]}
                            onValueChange={(next) =>
                                onChange({ ...value, [field]: next })
                            }
                        >
                            <SelectTriggerButton
                                className="w-[13.375rem] px-16"
                                label={t(LABEL_KEYS[field])}
                            />
                            <SelectContent>
                                <SelectGroup>
                                    {OPTIONS[field].map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {t(keys[option])}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                );
            })}
        </section>
    );
}
