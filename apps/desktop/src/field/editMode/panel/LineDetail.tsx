import { useEffect, useRef, useState } from "react";
import type { Checkpoint, FieldProperties } from "@openmarch/core";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { getButtonClassName, SegmentedTextSwitch } from "@openmarch/ui";
import ActionButton from "@/shortcuts/ActionButton";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { autoCheckpointNames, mirrorTwin } from "@/field/edits";
import { createCheckpointNamer } from "@/field/edits/messages";
import type { FieldEditRequest } from "@/field/edits";
import { fieldEditMode, useFieldEditModeStore } from "../fieldEditModeStore";
import { findLine, lineLabel, toRef } from "../lines";
import { existingSelection } from "../lineSelection";
import { moveLineEdit, toggleLinesEdit } from "../lineCommands";
import { resolveTypedPosition, yardLineOf } from "../positionInput";
import { useApplyFieldEdits } from "../useApplyFieldEdits";
import { useDraft } from "../useDraft";
import { Numpad } from "../Numpad";
import {
    CommitInput,
    CONTROL,
    Hint,
    ROW,
    SettingBox,
    SwitchRow,
} from "./settingsInputs";
import { lineWhere, useWhereText } from "./lineWhere";

const BUTTON = `${getButtonClassName({ variant: "secondary", size: "compact" })} text-body whitespace-nowrap`;

/** Gives the keyboard back to the field after Enter in a value, so Tab and undo act there again */
function focusField() {
    document
        .querySelector<HTMLElement>('[data-field-edit-pane="field"]')
        ?.focus({ preventScroll: true });
}

/**
 * The Lines tab's Line section (#824): the picked lines, and the one place their values are shown
 * and changed. Nothing picked: how to pick. One line (a mirrored pair counts as one): its
 * position, names (cleared, the ones its position gives it), yard number, Visible and Use as
 * reference. Many: Visible and Use as reference
 * for them all. Every change applies at once, one undo step each: switches on click, text on
 * Enter or leaving the field (Escape puts the text back), as in the Setup tab.
 */
export function LineDetail({ fp }: { fp: FieldProperties }) {
    const { t } = useTranslate();
    const selection = useFieldEditModeStore((s) => s.selection);
    const mirror = useFieldEditModeStore((s) => s.mirror);
    const picked = existingSelection(fp, selection);
    const lines = picked.flatMap((ref) => findLine(fp, ref) ?? []);
    const apply = useApplyFieldEdits();
    const toggle = (key: "visible" | "useAsReference") => {
        const edit = toggleLinesEdit(fp, picked, key, mirror);
        if (edit) void apply(edit);
    };

    return (
        <section
            className="border-stroke flex shrink-0 flex-col gap-4 border-t pt-8"
            aria-label={t("fieldEditMode.line.title")}
            data-testid="field-line-detail"
        >
            {lines.length === 0 ? (
                <>
                    <h5 className="text-h5">{t("fieldEditMode.line.title")}</h5>
                    <p className="text-sub text-text-subtitle">
                        {t("fieldEditMode.line.noneHint")}
                    </p>
                </>
            ) : lines.length === 1 ? (
                <OneLine
                    key={`${lines[0]!.axis}:${lines[0]!.id}`}
                    fp={fp}
                    line={lines[0]!}
                    toggle={toggle}
                />
            ) : (
                <>
                    <h5 className="text-h5">
                        {t("fieldEditMode.lines.pickedMany", {
                            count: lines.length,
                        })}
                    </h5>
                    <StateSwitch
                        label={t("fieldEditMode.popover.visible")}
                        lines={lines}
                        field="visible"
                        onChange={() => toggle("visible")}
                        testId="field-line-visible"
                    />
                    <StateSwitch
                        label={t("fieldEditMode.line.reference")}
                        lines={lines}
                        field="useAsReference"
                        onChange={() => toggle("useAsReference")}
                        testId="field-line-reference"
                    />
                    <div className="flex flex-wrap items-center gap-4 pt-4">
                        <ActionButton
                            action="fieldEditEveryOther"
                            className={BUTTON}
                        >
                            {t("fieldEditMode.line.everyOther")}
                        </ActionButton>
                        <ActionButton
                            action="fieldEditDeleteLines"
                            className={clsx(BUTTON, "text-red ml-auto")}
                        >
                            {t("fieldEditMode.popover.delete")}
                        </ActionButton>
                    </div>
                </>
            )}
        </section>
    );
}

/** Visible or Use as reference for many lines: on when all are; "Mixed" when some are */
function StateSwitch({
    label,
    lines,
    field,
    onChange,
    testId,
}: {
    label: string;
    lines: readonly Checkpoint[];
    field: "visible" | "useAsReference";
    onChange: () => void;
    testId: string;
}) {
    const { t } = useTranslate();
    const on = lines.filter((c) => c[field]).length;
    return (
        <SwitchRow
            label={label}
            checked={on === lines.length}
            onChange={onChange}
            testId={testId}
        >
            {on > 0 && on < lines.length && (
                <span className="text-sub text-text-subtitle">
                    {t("fieldEditMode.line.mixed")}
                </span>
            )}
        </SwitchRow>
    );
}

function OneLine({
    fp,
    line,
    toggle,
}: {
    fp: FieldProperties;
    line: Checkpoint;
    toggle: (key: "visible" | "useAsReference") => void;
}) {
    const { t } = useTranslate();
    const mirror = useFieldEditModeStore((s) => s.mirror);
    const apply = useApplyFieldEdits();
    const whereText = useWhereText(fp);
    const ref = toRef(line);
    const isX = line.axis === "x";
    const where = lineWhere(fp, line, mirror);
    const twin = isX ? mirrorTwin(fp.xCheckpoints, line) : undefined;
    const rename = (patch: Record<string, unknown>) =>
        void apply({
            edit: "updateCheckpoints",
            args: { ids: [ref], patch, mirror: mirror && isX },
        } satisfies FieldEditRequest);
    const trimmed = (text: string) => ({ value: text.trim() });
    // A cleared name is the one the line's position gives it ("45 yard line"), in the app's
    // language: what it would be called had nobody typed one
    const auto = autoCheckpointNames(
        fp,
        line.axis,
        line.stepsFromCenterFront,
        createCheckpointNamer(t),
    );
    const orAuto = (fallback: string) => (text: string) =>
        text.trim() ? trimmed(text) : { value: fallback };

    return (
        <>
            <p className="flex items-baseline gap-8">
                <span className="text-h5 truncate">{line.name}</span>
                <span className="text-sub text-text-subtitle truncate tabular-nums">
                    {whereText(where, line.stepsFromCenterFront)}
                </span>
            </p>
            <PositionRow fp={fp} line={line} />
            <CommitInput
                label={t("fieldEditMode.popover.shortName")}
                stored={line.terseName}
                current={line.terseName}
                parse={orAuto(auto.terseName)}
                placeholder={auto.terseName}
                onCommit={(shortName) => rename({ shortName })}
                hint={t("fieldEditMode.popover.shortNameHint")}
                testId="field-line-short-name"
                afterEnter={focusField}
            />
            <CommitInput
                label={t("fieldEditMode.popover.name")}
                stored={line.name}
                current={line.name}
                parse={orAuto(auto.name)}
                placeholder={auto.name}
                onCommit={(name) => rename({ name })}
                hint={t("fieldEditMode.popover.nameHint")}
                testId="field-line-name"
                afterEnter={focusField}
            />
            {isX && (
                <CommitInput
                    label={t("fieldEditMode.popover.yardNumber")}
                    stored={line.fieldLabel ?? ""}
                    current={line.fieldLabel ?? ""}
                    parse={trimmed}
                    onCommit={(label) =>
                        rename({ fieldLabel: label === "" ? null : label })
                    }
                    placeholder={t("fieldEditMode.popover.none")}
                    hint={t("fieldEditMode.popover.yardNumberHint")}
                    testId="field-line-yard-number"
                    afterEnter={focusField}
                />
            )}
            <SwitchRow
                label={t("fieldEditMode.popover.visible")}
                checked={line.visible}
                onChange={() => toggle("visible")}
                testId="field-line-visible"
            />
            <SwitchRow
                label={t("fieldEditMode.line.reference")}
                checked={line.useAsReference}
                onChange={() => toggle("useAsReference")}
                testId="field-line-reference"
            />
            {mirror && twin && (
                <Hint>
                    {t("fieldEditMode.popover.mirrored", {
                        twin: lineLabel(fp, twin),
                    })}
                </Hint>
            )}
            <div className="flex flex-wrap items-center gap-4 pt-4">
                <ActionButton
                    action="fieldEditDeleteLines"
                    className={clsx(BUTTON, "text-red ml-auto")}
                >
                    {t("fieldEditMode.popover.delete")}
                </ActionButton>
            </div>
        </>
    );
}

/**
 * A line's position, typed as steps, `+4`, `47.5yd` or `85.33/2`: saved on Enter (which gives the
 * keyboard back to the field) or leaving the field, put back with Escape. With Mirror off an X
 * line has its side here too. A double-click or Enter on a line comes here with the text picked.
 * The touch layout shows a number pad under it while it has the keyboard.
 */
function PositionRow({ fp, line }: { fp: FieldProperties; line: Checkpoint }) {
    const { t } = useTranslate();
    const isTouch = useIsTouchMode();
    const mirror = useFieldEditModeStore((s) => s.mirror);
    const wantsFocus = useFieldEditModeStore((s) => s.focusPosition);
    const apply = useApplyFieldEdits();
    const ref = toRef(line);
    const isX = line.axis === "x";
    const steps = line.stepsFromCenterFront;
    const distance = Math.abs(steps);
    const [draft, setDraft] = useDraft(String(distance));
    const [focused, setFocused] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    // Escape drops the typing: the blur that follows must not save it
    const cancelled = useRef(false);
    useEffect(() => {
        if (!wantsFocus) return;
        input.current?.focus();
        input.current?.select();
        fieldEditMode.positionFocused();
    }, [wantsFocus]);

    const football = fp.useHashes;
    const typed = resolveTypedPosition(draft, {
        axis: line.axis,
        football,
        current: distance,
    });
    const side = steps < 0 ? -1 : 1;
    const commit = () => {
        if (cancelled.current) {
            cancelled.current = false;
            setDraft(String(distance));
            return;
        }
        if (typed === null || Math.abs(typed - distance) < 1e-9) {
            setDraft(String(distance));
            return;
        }
        const to = isX ? side * typed : -typed;
        void apply(moveLineEdit(ref, to === 0 ? 0 : to, mirror));
    };
    // What the number counts, then what it is and what can be typed: one line
    const hint = [
        t(
            isX
                ? "fieldEditMode.popover.stepsFromCenter"
                : "fieldEditMode.popover.stepsBehindFront",
        ),
        isX && football && typed !== null && yardLineOf(typed) !== null
            ? t("fieldEditMode.popover.yardLine", { yard: yardLineOf(typed)! })
            : null,
        t(
            isX && football
                ? "fieldEditMode.popover.typeHintYards"
                : "fieldEditMode.popover.typeHint",
        ),
    ]
        .filter(Boolean)
        .join(" · ");
    const atCenter = isX && distance < 1e-6;

    return (
        <div className="flex flex-col gap-2">
            <label className={ROW}>
                <span className="min-w-0">
                    {t("fieldEditMode.popover.position")}
                </span>
                <span className={CONTROL}>
                    <SettingBox
                        ref={input}
                        numeric
                        data-testid="field-line-position"
                        inputMode={isTouch ? "none" : "decimal"}
                        invalid={typed === null}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => {
                            setFocused(false);
                            commit();
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                // Its own: it doesn't also reach the app's Enter
                                e.preventDefault();
                                e.stopPropagation();
                                // Leaving saves it
                                e.currentTarget.blur();
                                focusField();
                            }
                            if (e.key === "Escape") {
                                e.preventDefault();
                                e.stopPropagation();
                                cancelled.current = true;
                                setDraft(String(distance));
                                e.currentTarget.blur();
                            }
                        }}
                    />
                </span>
            </label>
            <Hint>{hint}</Hint>
            {isX && !mirror && !atCenter && (
                <div className={ROW}>
                    <span>{t("fieldEditMode.popover.side")}</span>
                    <SegmentedTextSwitch
                        ariaLabel={t("fieldEditMode.popover.side")}
                        testId="field-line-side"
                        options={[
                            {
                                value: "left",
                                label: fp.sideDescriptions.terseLeft,
                            },
                            {
                                value: "right",
                                label: fp.sideDescriptions.terseRight,
                            },
                        ]}
                        selected={side < 0 ? "left" : "right"}
                        setSelected={(value) => {
                            const onLeft = side < 0;
                            if ((value === "left") === onLeft) return;
                            void apply(moveLineEdit(ref, -steps, false));
                        }}
                    />
                </div>
            )}
            {isTouch && focused && (
                // Keeps the keyboard in the position while its keys are pressed
                <div
                    className="px-12"
                    onPointerDown={(e) => e.preventDefault()}
                >
                    <Numpad
                        yards={isX && football}
                        onKey={(key) =>
                            key === "back"
                                ? setDraft(draft.slice(0, -1))
                                : key === "clear"
                                  ? setDraft("")
                                  : setDraft(draft + key)
                        }
                    />
                </div>
            )}
        </div>
    );
}
