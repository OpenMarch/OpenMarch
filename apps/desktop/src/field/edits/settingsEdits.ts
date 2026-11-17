import type { FieldProperties, FieldPropertyArgs } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { fieldArgs, type SettingKey } from "./fieldModel";
import { finishEdit, invalidArgs, isFiniteNumber } from "./finish";
import type {
    ApplyTemplateArgs,
    FieldEditIssue,
    FieldEditOptions,
    FieldEditResult,
    FieldSettingsPatch,
    SetFieldSettingsArgs,
    TemplateKeep,
} from "./types";

type Check = (value: unknown) => string | undefined;

const boolean: Check = (v) =>
    typeof v === "boolean" ? undefined : "must be true or false";
const nonEmptyText: Check = (v) =>
    typeof v === "string" && v.trim() !== "" ? undefined : "must be text";
const numberAtLeast =
    (min: number, inclusive = true): Check =>
    (v) =>
        isFiniteNumber(v) && (inclusive ? v >= min : v > min)
            ? undefined
            : `must be a number ${inclusive ? "≥" : ">"} ${min}`;
const oneOf =
    (...options: string[]): Check =>
    (v) =>
        options.includes(v as string)
            ? undefined
            : `must be one of ${options.join(", ")}`;

const isRgba = (v: unknown) => {
    const c = v as Record<string, unknown> | null;
    return (
        !!c &&
        typeof c === "object" &&
        ["r", "g", "b", "a"].every((k) => isFiniteNumber(c[k]))
    );
};

const THEME_COLORS = [
    "primaryStroke",
    "secondaryStroke",
    "tertiaryStroke",
    "background",
    "fieldLabel",
    "externalLabel",
    "previousPath",
    "nextPath",
    "shape",
    "tempPath",
] as const;

const PLAIN_CHECKS: Partial<Record<SettingKey, Check>> = {
    name: nonEmptyText,
    stepSizeInches: numberAtLeast(0, false),
    stepSizeWarningThresholdInches: numberAtLeast(0),
    measurementSystem: oneOf("imperial", "metric"),
    halfLineXInterval: numberAtLeast(0),
    halfLineYInterval: numberAtLeast(0),
    topLabelsVisible: boolean,
    bottomLabelsVisible: boolean,
    leftLabelsVisible: boolean,
    rightLabelsVisible: boolean,
    useHashes: boolean,
    isCustom: boolean,
    showFieldImage: boolean,
    imageFillOrFit: oneOf("fill", "fit"),
    backgroundImageOpacity: (v) =>
        isFiniteNumber(v) && v >= 0 && v <= 1
            ? undefined
            : "must be a number from 0 to 1",
};

const SIDE_KEYS = ["verboseLeft", "verboseRight", "terseLeft", "terseRight"];
const YARD_NUMBER_KEYS = [
    "homeStepsFromFrontToOutside",
    "homeStepsFromFrontToInside",
    "awayStepsFromFrontToInside",
    "awayStepsFromFrontToOutside",
];

function nestedErrors(
    key: string,
    value: unknown,
    allowed: readonly string[],
    check: (k: string, v: unknown) => string | undefined,
): FieldEditIssue[] {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return [invalidArgs(`\`${key}\` must be an object`)];
    return Object.entries(value).flatMap(([k, v]) => {
        if (!allowed.includes(k))
            return [invalidArgs(`\`${key}.${k}\` isn't a setting`)];
        const why = check(k, v);
        return why ? [invalidArgs(`\`${key}.${k}\` ${why}`)] : [];
    });
}

/**
 * Sets any of the field's settings outside the checkpoints: name, step size, warning threshold,
 * measurement system, half lines, side names, yard-number placement, edge labels, hashes, image
 * settings and theme. Nested objects merge. Checkpoints have their own edits.
 */
export function setFieldSettings(
    fp: FieldProperties,
    args: SetFieldSettingsArgs,
    _options?: FieldEditOptions,
): FieldEditResult {
    const edit = "setFieldSettings";
    const patch = args?.patch as Record<string, unknown> | undefined;
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
        return finishEdit(edit, fp, null, {
            errors: [invalidArgs("`patch` must be an object")],
        });
    const errors: FieldEditIssue[] = [];
    for (const [key, value] of Object.entries(patch)) {
        if (key === "sideDescriptions")
            errors.push(
                ...nestedErrors(key, value, SIDE_KEYS, (_k, v) =>
                    nonEmptyText(v),
                ),
            );
        else if (key === "yardNumberCoordinates")
            errors.push(
                ...nestedErrors(key, value, YARD_NUMBER_KEYS, (_k, v) =>
                    v === null || isFiniteNumber(v)
                        ? undefined
                        : "must be a number or null",
                ),
            );
        else if (key === "theme")
            errors.push(
                ...nestedErrors(
                    key,
                    value,
                    [...THEME_COLORS, "shapeType", "defaultMarcher"],
                    (k, v) => {
                        if (k === "shapeType")
                            return v === null ||
                                ["circle", "square", "triangle", "x"].includes(
                                    v as string,
                                )
                                ? undefined
                                : "must be circle, square, triangle, x or null";
                        if (k === "defaultMarcher") {
                            const m = v as Record<string, unknown> | null;
                            if (!m || typeof m !== "object")
                                return "must be an object";
                            return Object.entries(m).every(
                                ([mk, mv]) =>
                                    ["fill", "outline", "label"].includes(mk) &&
                                    isRgba(mv),
                            )
                                ? undefined
                                : "takes fill, outline and label as { r, g, b, a }";
                        }
                        return isRgba(v) ? undefined : "must be { r, g, b, a }";
                    },
                ),
            );
        else if (key in PLAIN_CHECKS) {
            const why = PLAIN_CHECKS[key as SettingKey]!(value);
            if (why) errors.push(invalidArgs(`\`${key}\` ${why}`));
        } else
            errors.push({
                code: "unknown-setting",
                message: `\`${key}\` isn't a field setting${key.endsWith("Checkpoints") ? " (checkpoints have their own edits)" : ""}`,
            });
    }
    if (errors.length > 0) return finishEdit(edit, fp, null, { errors });

    const p = patch as FieldSettingsPatch;
    const current = fieldArgs(fp);
    const yardNumberCoordinates = { ...fp.yardNumberCoordinates } as Record<
        string,
        number | undefined
    >;
    for (const [k, v] of Object.entries(p.yardNumberCoordinates ?? {}))
        if (v === null) delete yardNumberCoordinates[k];
        else yardNumberCoordinates[k] = v;
    const themePatch = (p.theme ?? {}) as Record<string, unknown>;
    const next: FieldPropertyArgs = {
        ...current,
        ...(Object.fromEntries(
            Object.entries(p).filter(
                ([k]) =>
                    ![
                        "sideDescriptions",
                        "yardNumberCoordinates",
                        "theme",
                    ].includes(k),
            ),
        ) as Partial<FieldPropertyArgs>),
        sideDescriptions: { ...fp.sideDescriptions, ...p.sideDescriptions },
        yardNumberCoordinates,
        theme: {
            ...fp.theme,
            ...themePatch,
            defaultMarcher: {
                ...fp.theme.defaultMarcher,
                ...((themePatch.defaultMarcher as object | undefined) ?? {}),
            },
        } as FieldPropertyArgs["theme"],
    };
    return finishEdit(edit, fp, next);
}

/** The template ids applyTemplate takes */
export type FieldTemplateId = keyof typeof FieldPropertiesTemplates;

export const FIELD_TEMPLATE_IDS = Object.keys(
    FieldPropertiesTemplates,
) as FieldTemplateId[];

/** The settings that are the field's shape: where the lines are and how far apart steps are */
export const GEOMETRY_KEYS = [
    "xCheckpoints",
    "yCheckpoints",
    "stepSizeInches",
    "yardNumberCoordinates",
    "useHashes",
    "halfLineXInterval",
    "halfLineYInterval",
] as const satisfies readonly (keyof FieldPropertyArgs)[];

/** The settings that are the field's look and the user's preferences */
export const LOOK_KEYS = [
    "theme",
    "showFieldImage",
    "imageFillOrFit",
    "backgroundImageOpacity",
    "topLabelsVisible",
    "bottomLabelsVisible",
    "leftLabelsVisible",
    "rightLabelsVisible",
    "sideDescriptions",
    "measurementSystem",
    "stepSizeWarningThresholdInches",
] as const satisfies readonly (keyof FieldPropertyArgs)[];

/**
 * Switches to a template, keeping the current look ("look", the default), the current lines
 * ("lines") or nothing ("none", what the customizer's Apply Field Type does today; a caller
 * standing in for it passes "none" explicitly). The diff pairs checkpoints by position
 * (template ids restart at 0) and lists in `kept` what of the current field stays where it
 * differs from the template (B11: nothing is wiped silently).
 */
export function applyTemplate(
    fp: FieldProperties,
    args: ApplyTemplateArgs,
    _options?: FieldEditOptions,
): FieldEditResult {
    const edit = "applyTemplate";
    const keep: TemplateKeep = args?.keep ?? "look";
    const errors: FieldEditIssue[] = [];
    if (!["none", "look", "lines"].includes(keep))
        errors.push(invalidArgs('`keep` must be "none", "look" or "lines"'));
    const template = FieldPropertiesTemplates[
        args?.template as FieldTemplateId
    ] as FieldProperties | undefined;
    if (!template || !FIELD_TEMPLATE_IDS.includes(args.template as never))
        errors.push({
            code: "unknown-template",
            message: `No template "${String(args?.template)}". Templates: ${FIELD_TEMPLATE_IDS.join(", ")}`,
        });
    if (errors.length > 0 || !template)
        return finishEdit(edit, fp, null, { errors });

    const current = fieldArgs(fp);
    const fromTemplate = fieldArgs(template);
    const keptKeys: readonly (keyof FieldPropertyArgs)[] =
        keep === "look" ? LOOK_KEYS : keep === "lines" ? GEOMETRY_KEYS : [];
    const next: FieldPropertyArgs = { ...fromTemplate };
    for (const key of keptKeys)
        (next as unknown as Record<string, unknown>)[key] = current[key];
    const kept = keptKeys.filter(
        (key) => !sameJson(current[key], fromTemplate[key]),
    );
    if (keep === "lines" && kept.length > 0) {
        // Still the user's own lines: still their field's name, and custom
        next.name = current.name;
        next.isCustom = true;
    }
    // Template checkpoints are shared: copy them so no edit can reach the template
    next.xCheckpoints = next.xCheckpoints.map((c) => ({ ...c }));
    next.yCheckpoints = next.yCheckpoints.map((c) => ({ ...c }));
    return finishEdit(edit, fp, next, { match: "position", kept });
}

function sameJson(a: unknown, b: unknown) {
    return JSON.stringify(a) === JSON.stringify(b);
}
