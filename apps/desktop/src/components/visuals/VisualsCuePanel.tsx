/**
 * The picked cue's settings in Visuals mode's inspector
 * (performer-behavior.md section 7.1): its value, its transition (a state)
 * or length (a phrase), the value's own settings, its ripple and notes.
 * Each change is one undoable edit. No popovers: everything is here.
 */
import Shortcut from "@/components/ui/Shortcut";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { T, useTolgee } from "@tolgee/react";
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    Switch,
    TextArea,
} from "@openmarch/ui";
import {
    CUE_LIBRARY,
    cueLibraryValue,
    type CueSettingField,
} from "@openmarch/core";
import {
    CUE_RIPPLE_ORDERS,
    type DatabaseCue,
    type ModifiedCueArgs,
} from "@/db-functions/cues";
import {
    allCuesQueryOptions,
    deleteCuesMutationOptions,
    updateCuesMutationOptions,
} from "@/hooks/queries/useCues";
import { useVisualsStore } from "@/stores/VisualsStore";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useVisualsData } from "./VisualsProvider";
import { countWords } from "./countWhere";
import { useTargetLabel } from "./useTargetLabel";
import FacingWheel from "./FacingWheel";
import {
    cancelFieldPoint,
    requestFieldPoint,
    useIsPickingFieldPoint,
} from "@/field/fieldPointPick";

/** A number field that saves on Enter or when it loses focus; empty saves null. */
function NumberField({
    value,
    placeholder,
    min,
    max,
    onCommit,
    testId,
    label,
}: {
    value: number | null;
    placeholder?: string;
    min?: number;
    max?: number;
    onCommit: (value: number | null) => void;
    testId: string;
    label: string;
}) {
    const [text, setText] = useState(value === null ? "" : String(value));
    useEffect(() => setText(value === null ? "" : String(value)), [value]);
    const commit = () => {
        const trimmed = text.trim();
        if (trimmed === "") {
            if (value !== null) onCommit(null);
            return;
        }
        let n = Math.round(Number(trimmed));
        if (!Number.isFinite(n)) {
            setText(value === null ? "" : String(value));
            return;
        }
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        setText(String(n));
        if (n !== value) onCommit(n);
    };
    return (
        <Input
            type="number"
            aria-label={label}
            data-testid={testId}
            value={text}
            placeholder={placeholder}
            min={min}
            max={max}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === "Enter") commit();
            }}
            className="w-80"
        />
    );
}

function Field({
    label,
    children,
}: {
    label: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-[2.25rem] items-center justify-between gap-8">
            <span className="text-body text-text-subtitle">{label}</span>
            {children}
        </div>
    );
}

/** A setting's or option's label, falling back to its id for one the app doesn't name. */
function useSettingLabel() {
    const { t } = useTolgee();
    return (group: "settings" | "options", id: string) => {
        const key = `visuals.${group}.${id}`;
        const label = t(key);
        return label === key ? id : label;
    };
}

function SettingField({
    field,
    value,
    onCommit,
}: {
    field: CueSettingField;
    value: unknown;
    onCommit: (value: string | number) => void;
}) {
    const label = useSettingLabel();
    const name = label("settings", field.key);
    if (field.kind === "choice") {
        const current =
            typeof value === "string" && field.options.includes(value)
                ? value
                : field.default;
        return (
            <Field label={name}>
                <Select value={current} onValueChange={onCommit}>
                    <SelectTriggerButton
                        label={label("options", current)}
                        data-testid={`visuals-cue-setting-${field.key}`}
                    />
                    <SelectContent>
                        {field.options.map((option) => (
                            <SelectItem key={option} value={option}>
                                {label("options", option)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
        );
    }
    return (
        <Field label={name}>
            <NumberField
                label={name}
                testId={`visuals-cue-setting-${field.key}`}
                value={typeof value === "number" ? value : field.default}
                onCommit={(n) => onCommit(n ?? field.default)}
            />
        </Field>
    );
}

export default function VisualsCuePanel() {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    // the panel shows one picked cue; several picked (for copying) show none
    const picked = useVisualsStore((s) => s.selectedCueIds);
    const selectedCueId = picked.length === 1 ? picked[0]! : null;
    const clearSelectedCues = useVisualsStore((s) => s.clearSelectedCues);
    const data = useVisualsData();
    const targetLabel = useTargetLabel();
    const { data: cues } = useQuery(allCuesQueryOptions());
    const { mutate: updateCues } = useMutation(
        updateCuesMutationOptions(queryClient),
    );
    const { mutate: deleteCues } = useMutation(
        deleteCuesMutationOptions(queryClient),
    );
    const cue: DatabaseCue | undefined = cues?.find(
        (c) => c.id === selectedCueId,
    );
    const { beats, pages } = useTimingObjects();
    // Counts as the transport reads them: "Page 2 count 16"
    const where = useMemo(
        () =>
            data
                ? countWords(beats, pages, data.counts)
                : (count: number) => `count ${count + 1}`,
        [data, beats, pages],
    );
    if (!cue || !data) return null;

    const value = cueLibraryValue(cue.value);
    const count = data.counts.countOfBeatId.get(cue.beatId);
    const update = (change: Omit<ModifiedCueArgs, "id">) =>
        updateCues([{ id: cue.id, ...change }]);
    const fitsAll = (fits: readonly string[]) =>
        data.carries.every((c) => fits.includes(c));
    const choices = CUE_LIBRARY.filter(
        (v) => v.channel === cue.channel && v.kind === cue.kind,
    );

    return (
        <section
            className="border-stroke mt-16 flex flex-col gap-4 border-t pt-12"
            data-testid="visuals-cue-panel"
        >
            <div className="flex items-center justify-between">
                <p className="text-body text-text">
                    <T keyName="visuals.cue.title" />
                </p>
                <Button
                    variant="secondary"
                    size="compact"
                    data-testid="visuals-cue-delete"
                    onClick={() => {
                        deleteCues(new Set([cue.id]));
                        clearSelectedCues();
                    }}
                >
                    <T keyName="visuals.cue.delete" />
                </Button>
            </div>
            <p className="text-sub text-text-subtitle">
                {t("visuals.cue.where", {
                    who: targetLabel(cue.target),
                    where: count === undefined ? "–" : where(count),
                })}
            </p>
            <Field label={<T keyName="visuals.cue.value" />}>
                <Select
                    value={cue.value}
                    onValueChange={(v) => update({ value: v })}
                >
                    <SelectTriggerButton
                        label={value?.name ?? cue.value}
                        data-testid="visuals-cue-value"
                    />
                    <SelectContent>
                        {choices.map((choice) => (
                            <SelectItem key={choice.id} value={choice.id}>
                                {fitsAll(choice.fits)
                                    ? choice.name
                                    : t("visuals.cue.notForEveryone", {
                                          value: choice.name,
                                      })}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            {cue.kind === "state" ? (
                <Field label={<T keyName="visuals.cue.transition" />}>
                    <NumberField
                        label={t("visuals.cue.transition")}
                        testId="visuals-cue-transition"
                        value={cue.transitionLength}
                        placeholder={String(value?.defaultTransition ?? 1)}
                        min={1}
                        onCommit={(n) => update({ transitionLength: n })}
                    />
                </Field>
            ) : (
                <Field label={<T keyName="visuals.cue.length" />}>
                    <NumberField
                        label={t("visuals.cue.length")}
                        testId="visuals-cue-length"
                        value={cue.length}
                        min={Math.max(2, value?.minLength ?? 2)}
                        max={value?.maxLength}
                        onCommit={(n) =>
                            update({
                                length: n ?? Math.max(2, value?.minLength ?? 2),
                            })
                        }
                    />
                </Field>
            )}
            {cue.value === "builtin:facing.angle" && (
                <div className="flex justify-center py-4">
                    <FacingWheel
                        degrees={Number(cue.settings.degrees ?? 0)}
                        onCommit={(degrees) =>
                            update({ settings: { ...cue.settings, degrees } })
                        }
                    />
                </div>
            )}
            {cue.value === "builtin:facing.point" && (
                <PickPointButton
                    // another picked cue drops a pick left open for this one
                    key={cue.id}
                    onPoint={(x, y) =>
                        update({ settings: { ...cue.settings, x, y } })
                    }
                />
            )}
            {(value?.settings ?? []).map((field) => (
                <SettingField
                    key={field.key}
                    field={field}
                    value={cue.settings[field.key]}
                    onCommit={(v) =>
                        update({
                            settings: { ...cue.settings, [field.key]: v },
                        })
                    }
                />
            ))}
            {cue.channel !== "feet" && (
                <>
                    <Field label={<T keyName="visuals.cue.ripple" />}>
                        <Switch
                            data-testid="visuals-cue-ripple"
                            checked={cue.ripple !== null}
                            onCheckedChange={(on) =>
                                update({
                                    ripple: on
                                        ? { span: 4, order: "drill" }
                                        : null,
                                })
                            }
                        />
                    </Field>
                    {cue.ripple && (
                        <>
                            <Field
                                label={<T keyName="visuals.cue.rippleSpan" />}
                            >
                                <NumberField
                                    label={t("visuals.cue.rippleSpan")}
                                    testId="visuals-cue-ripple-span"
                                    value={cue.ripple.span}
                                    min={1}
                                    onCommit={(n) =>
                                        update({
                                            ripple: {
                                                ...cue.ripple!,
                                                span: n ?? 1,
                                            },
                                        })
                                    }
                                />
                            </Field>
                            <Field
                                label={<T keyName="visuals.cue.rippleOrder" />}
                            >
                                <Select
                                    value={cue.ripple.order}
                                    onValueChange={(order) =>
                                        update({
                                            ripple: {
                                                ...cue.ripple!,
                                                order: order as (typeof CUE_RIPPLE_ORDERS)[number],
                                            },
                                        })
                                    }
                                >
                                    <SelectTriggerButton
                                        label={t(
                                            `visuals.cue.order.${cue.ripple.order}`,
                                        )}
                                        data-testid="visuals-cue-ripple-order"
                                    />
                                    <SelectContent>
                                        {CUE_RIPPLE_ORDERS.map((order) => (
                                            <SelectItem
                                                key={order}
                                                value={order}
                                            >
                                                {t(
                                                    `visuals.cue.order.${order}`,
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </>
                    )}
                </>
            )}
            <NotesField
                notes={cue.notes}
                onCommit={(notes) => update({ notes })}
            />
        </section>
    );
}

function NotesField({
    notes,
    onCommit,
}: {
    notes: string | null;
    onCommit: (notes: string | null) => void;
}) {
    const { t } = useTolgee();
    const [text, setText] = useState(notes ?? "");
    useEffect(() => setText(notes ?? ""), [notes]);
    return (
        <TextArea
            aria-label={t("visuals.cue.notes")}
            placeholder={t("visuals.cue.notes")}
            data-testid="visuals-cue-notes"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
                const next = text.trim() === "" ? null : text;
                if (next !== notes) onCommit(next);
            }}
            className="mt-4 min-h-[3rem]"
        />
    );
}

/**
 * Picks a Facing cue's point on the field: the next click on the field is
 * the point, in the dots' space. Escape, or the button again, cancels.
 */
function PickPointButton({
    onPoint,
}: {
    onPoint: (x: number, y: number) => void;
}) {
    const picking = useIsPickingFieldPoint();
    useEffect(() => {
        if (!picking) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") cancelFieldPoint();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [picking]);
    // a request left open when the panel goes away would eat a field click
    useEffect(() => cancelFieldPoint, []);
    return (
        <Button
            variant={picking ? "primary" : "secondary"}
            size="compact"
            data-testid="visuals-pick-point"
            onClick={() =>
                picking
                    ? cancelFieldPoint()
                    : requestFieldPoint((p) =>
                          onPoint(
                              Math.round(p.x * 10) / 10,
                              Math.round(p.y * 10) / 10,
                          ),
                      )
            }
        >
            <T
                keyName={
                    picking
                        ? "visuals.cue.pickingPoint"
                        : "visuals.cue.pickPoint"
                }
                params={{ keys: () => <Shortcut binding="Escape" /> }}
            />
        </Button>
    );
}
