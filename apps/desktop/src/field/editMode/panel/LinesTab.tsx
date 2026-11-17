import { useEffect } from "react";
import type { FieldProperties } from "@openmarch/core";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import {
    getButtonClassName,
    SegmentedTextSwitch,
    WarningNote,
} from "@openmarch/ui";
import {
    ArrowsLeftRightIcon,
    CheckSquareOffsetIcon,
    PlusIcon,
} from "@phosphor-icons/react";
import ActionButton from "@/shortcuts/ActionButton";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { fieldEditMode, useFieldEditModeStore } from "../fieldEditModeStore";
import { existingSelection } from "../lineSelection";
import { FieldEditKeysHelp } from "../FieldEditKeysHelp";
import { useApplyFieldEdits } from "../useApplyFieldEdits";
import { LinesList, xLinesAsymmetric } from "./LinesList";
import { LineDetail } from "./LineDetail";
import { SwitchRow } from "./settingsInputs";

const BUTTON = `${getButtonClassName({ variant: "secondary", size: "compact" })} text-body whitespace-nowrap`;
/** A pressed mode button: Edit music's look */
const PRESSED = "border-accent text-accent";

/**
 * The Field panel's Lines tab (#824), which is the mode for lines: while it shows, the field draws
 * its rulers and its lines can be picked, dragged and added there. The list above is for finding
 * and picking; the Line section pinned below it shows the picked lines and is the one place their
 * values change. The list scrolls; the Line section stays put, so the row just clicked never moves
 * under the pointer.
 */
export function LinesTab({ fp }: { fp: FieldProperties }) {
    const { t } = useTranslate();
    const apply = useApplyFieldEdits();
    const isTouch = useIsTouchMode();
    const mirror = useFieldEditModeStore((s) => s.mirror);
    const selectMany = useFieldEditModeStore((s) => s.selectMany);
    const selection = useFieldEditModeStore((s) => s.selection);
    const axis = useFieldEditModeStore((s) => s.axis);
    const picked = existingSelection(fp, selection);
    const last = picked[picked.length - 1];
    // A line picked on the field shows its own axis' list, once, when the pick changes: the
    // switch still works after
    const lastAxis = last?.axis;
    const lastId = last?.id;
    useEffect(() => {
        if (lastAxis) fieldEditMode.setAxis(lastAxis);
    }, [lastAxis, lastId]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-8">
            <div className="flex flex-wrap items-center gap-8">
                <ActionButton
                    action="fieldEditMirror"
                    toggleState={mirror ? "on" : "off"}
                    aria-pressed={mirror}
                    data-testid="field-edit-mirror"
                    className={clsx(BUTTON, mirror && PRESSED)}
                    tooltip={t(
                        mirror
                            ? "fieldEditMode.panel.mirrorOnTip"
                            : "fieldEditMode.panel.mirrorOffTip",
                    )}
                >
                    <ArrowsLeftRightIcon size={16} />
                    {t("fieldEditMode.panel.mirror")}
                </ActionButton>
                {isTouch && (
                    // A finger has no Shift: taps add to the pick while this is on
                    <button
                        type="button"
                        aria-pressed={selectMany}
                        className={clsx(BUTTON, selectMany && PRESSED)}
                        onClick={() => fieldEditMode.setSelectMany(!selectMany)}
                    >
                        <CheckSquareOffsetIcon size={16} />
                        {t("fieldEditMode.panel.selectMany")}
                    </button>
                )}
                <span className="ml-auto">
                    <FieldEditKeysHelp />
                </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-8">
                <SegmentedTextSwitch
                    ariaLabel={t("fieldEditMode.lines.axis")}
                    selected={axis}
                    setSelected={(value) =>
                        fieldEditMode.setAxis(value as "x" | "y")
                    }
                    testId="field-lines-axis"
                    options={[
                        {
                            value: "x",
                            label: t("fieldEditMode.lines.xTab", {
                                count: fp.xCheckpoints.length,
                            }),
                            testId: "field-lines-axis-x",
                        },
                        {
                            value: "y",
                            label: t("fieldEditMode.lines.yTab", {
                                count: fp.yCheckpoints.length,
                            }),
                            testId: "field-lines-axis-y",
                        },
                    ]}
                />
                <ActionButton
                    action={
                        axis === "x" ? "fieldEditAddXLine" : "fieldEditAddYLine"
                    }
                    data-testid="field-lines-add"
                    className={BUTTON}
                >
                    <PlusIcon size={14} />
                    {t("fieldEditMode.line.add")}
                </ActionButton>
            </div>

            {axis === "x" && xLinesAsymmetric(fp) && (
                <div role="status" data-testid="field-lines-asymmetric">
                    <WarningNote>
                        {t("fieldEditMode.list.asymmetric")}
                    </WarningNote>
                </div>
            )}
            {axis === "y" && (
                <SwitchRow
                    label={t("fieldEditMode.list.drawAsHashes")}
                    checked={fp.useHashes}
                    testId="field-use-hashes"
                    onChange={(on) =>
                        void apply({
                            edit: "setFieldSettings",
                            args: { patch: { useHashes: on } },
                        })
                    }
                />
            )}

            {/* Room for about six rows; on a short window the tab scrolls as a whole */}
            <div className="-mr-4 min-h-[12.5rem] flex-1 overflow-y-auto pr-4">
                <LinesList fp={fp} axis={axis} />
            </div>

            <LineDetail fp={fp} />
        </div>
    );
}
