/**
 * PDF-specific wizard configuration step components.
 * Each step collects one piece of config needed to parse PDF coordinate sheets.
 */

import { useEffect, useState } from "react";
import { getButtonClassName } from "@openmarch/ui";
import { useQuery } from "@tanstack/react-query";
import { fieldPropertiesQueryOptions } from "@/hooks/queries";
import type { AdapterStepProps } from "../types";
import type { SourceHashType } from "./coordParser";
import { detectFieldHashType } from "./index";
import IndoorTemplates from "@/global/classes/fieldTemplates/Indoor";

type IndoorTemplateKey = keyof typeof IndoorTemplates;

// ── Shared sub-components ────────────────────────────────────────────

function StepNavigation({
    onBack,
    onNext,
    hideBack,
}: {
    onBack: () => void;
    onNext: () => void;
    hideBack?: boolean;
}) {
    return (
        <div className={`flex ${hideBack ? "justify-end" : "justify-between"}`}>
            {!hideBack && (
                <button
                    onClick={onBack}
                    className={getButtonClassName({
                        variant: "secondary",
                        size: "default",
                        content: "text",
                        className: undefined,
                    })}
                >
                    ← Back
                </button>
            )}
            <button
                onClick={onNext}
                className={getButtonClassName({
                    variant: "primary",
                    size: "default",
                    content: "text",
                    className: undefined,
                })}
            >
                Next →
            </button>
        </div>
    );
}

function RadioOption<T extends string>({
    value,
    selected,
    label,
    onSelect,
}: {
    value: T;
    selected: T;
    label: string;
    onSelect: (value: T) => void;
}) {
    const isActive = selected === value;
    return (
        <label
            className={`rounded-6 flex cursor-pointer items-center gap-12 border px-16 py-12 duration-150 ease-out hover:-translate-y-[2px] active:translate-y-4 ${
                isActive ? "border-accent bg-fg-2" : "border-stroke bg-fg-1"
            }`}
        >
            <div
                className={`flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border ${
                    isActive
                        ? "border-accent bg-accent"
                        : "border-stroke bg-fg-2"
                }`}
            >
                {isActive && (
                    <div className="bg-text-invert size-[0.4375rem] rounded-full" />
                )}
            </div>
            <span className="text-body leading-none">{label}</span>
            <input
                type="radio"
                value={value}
                checked={isActive}
                onChange={() => onSelect(value)}
                className="sr-only"
            />
        </label>
    );
}

// ── Constants ────────────────────────────────────────────────────────

const INDOOR_TEMPLATE_LABELS: Record<IndoorTemplateKey, string> = {
    INDOOR_40x60_8to5: "40×60 — 8 to 5 (24″ steps)",
    INDOOR_50x70_8to5: "50×70 — 8 to 5 (24″ steps)",
    INDOOR_50x80_8to5: "50×80 — 8 to 5 (24″ steps)",
    INDOOR_50x90_8to5: "50×90 — 8 to 5 (24″ steps)",
    INDOOR_40x60_6to5: "40×60 — 6 to 5 (30″ steps)",
    INDOOR_50x70_6to5: "50×70 — 6 to 5 (30″ steps)",
    INDOOR_50x80_6to5: "50×80 — 6 to 5 (30″ steps)",
    INDOOR_50x90_6to5: "50×90 — 6 to 5 (30″ steps)",
};

const HASH_TYPE_LABELS: Record<SourceHashType, string> = {
    HS: "High School",
    CH: "College / NCAA",
    PH: "Pro / NFL",
};

// ── Step 1: Field Type ──────────────────────────────────────────────

export function FieldTypeStep({
    config,
    onConfigChange,
    onNext,
}: AdapterStepProps) {
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const fieldType = (config.fieldType as "outdoor" | "indoor") ?? "outdoor";

    useEffect(() => {
        if (!fieldProperties || config.fieldType) return;
        const isIndoor =
            (fieldProperties.xCheckpoints?.length ?? 0) > 0 &&
            !(fieldProperties.xCheckpoints as { name: string }[]).some((cp) =>
                /\byard\s*line\b/i.test(cp.name),
            );
        onConfigChange({ fieldType: isIndoor ? "indoor" : "outdoor" });
    }, [fieldProperties, config.fieldType, onConfigChange]);

    return (
        <div className="flex flex-col gap-16">
            <button
                onClick={() => {
                    const hashType = fieldProperties?.yCheckpoints
                        ? detectFieldHashType(
                              fieldProperties.yCheckpoints as {
                                  name: string;
                              }[],
                          )
                        : "HS";
                    onConfigChange({
                        useCurrentField: true,
                        sourceHashType: hashType,
                    });
                    onNext();
                }}
                className="rounded-6 border-accent bg-fg-2 flex flex-col gap-4 border p-16 text-left duration-150 ease-out hover:-translate-y-[2px] active:translate-y-4"
            >
                <span className="text-body font-medium">
                    My file is already set up with the same field as the PDF
                </span>
                <span className="text-sub text-text-subtitle">
                    Use the current file's field settings — skip straight to
                    review
                </span>
            </button>

            <div className="flex items-center gap-8">
                <div className="border-stroke h-px flex-1 border-t" />
                <span className="text-sub text-text-subtitle">
                    or choose manually
                </span>
                <div className="border-stroke h-px flex-1 border-t" />
            </div>

            <div className="flex gap-12">
                {[
                    {
                        value: "outdoor" as const,
                        label: "Outdoor / Football",
                        desc: "Yard lines and hashes (e.g. 4 steps Inside 40 yd ln)",
                    },
                    {
                        value: "indoor" as const,
                        label: "Indoor",
                        desc: "Numbered or lettered lines (e.g. On 5 line, On A line)",
                    },
                ].map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() =>
                            onConfigChange({
                                fieldType: opt.value,
                                useCurrentField: false,
                            })
                        }
                        className={`rounded-6 flex flex-1 flex-col gap-6 border p-16 text-left duration-150 ease-out hover:-translate-y-[2px] active:translate-y-4 ${
                            fieldType === opt.value
                                ? "border-accent bg-fg-2"
                                : "border-stroke bg-fg-1"
                        }`}
                    >
                        <span className="text-body font-medium">
                            {opt.label}
                        </span>
                        <span className="text-sub text-text-subtitle">
                            {opt.desc}
                        </span>
                    </button>
                ))}
            </div>
            <StepNavigation
                hideBack
                onBack={() => {}}
                onNext={() => {
                    onConfigChange({ useCurrentField: false, fieldType });
                    onNext();
                }}
            />
        </div>
    );
}

// ── Step 2: Hash Type (outdoor) ──────────────────────────────────────

export function HashTypeStep({
    config,
    onConfigChange,
    onNext,
    onBack,
}: AdapterStepProps) {
    const hashType = (config.sourceHashType as SourceHashType) ?? "HS";

    return (
        <div className="flex flex-col gap-16">
            <p className="text-body text-text-subtitle">
                What hash type does this PDF use?
            </p>
            <div className="flex flex-col gap-6">
                {(Object.keys(HASH_TYPE_LABELS) as SourceHashType[]).map(
                    (value) => (
                        <RadioOption
                            key={value}
                            value={value}
                            selected={hashType}
                            label={HASH_TYPE_LABELS[value]}
                            onSelect={(v) =>
                                onConfigChange({ sourceHashType: v })
                            }
                        />
                    ),
                )}
            </div>
            <StepNavigation onBack={onBack} onNext={onNext} />
        </div>
    );
}

// ── Step 3: Indoor Template ──────────────────────────────────────────

export function IndoorTemplateStep({
    config,
    onConfigChange,
    onNext,
    onBack,
}: AdapterStepProps) {
    const templateKey =
        (config.indoorTemplate as IndoorTemplateKey) ?? "INDOOR_50x80_8to5";

    return (
        <div className="flex flex-col gap-16">
            <p className="text-body text-text-subtitle">
                Which indoor field template does this PDF use?
            </p>
            <div className="flex flex-col gap-6">
                {(
                    Object.keys(INDOOR_TEMPLATE_LABELS) as IndoorTemplateKey[]
                ).map((key) => (
                    <RadioOption
                        key={key}
                        value={key}
                        selected={templateKey}
                        label={INDOOR_TEMPLATE_LABELS[key]}
                        onSelect={(v) => onConfigChange({ indoorTemplate: v })}
                    />
                ))}
            </div>
            <StepNavigation onBack={onBack} onNext={onNext} />
        </div>
    );
}

// ── Step 4: Indoor Reference Labels ──────────────────────────────────

export function IndoorReferencesStep({
    config,
    onConfigChange,
    onNext,
    onBack,
}: AdapterStepProps) {
    const templateKey =
        (config.indoorTemplate as IndoorTemplateKey) ?? "INDOOR_50x80_8to5";
    const flipAxes = (config.flipIndoorAxes as boolean) ?? false;
    const [aliases, setAliases] = useState<Record<string, string>>(
        (config.indoorAliases as Record<string, string>) ?? {},
    );

    const template = IndoorTemplates[templateKey];

    const checkpointGroups = [
        {
            title: "Lateral (left-right)",
            checkpoints: Array.from(
                new Map(
                    (
                        template.xCheckpoints as {
                            name: string;
                            stepsFromCenterFront: number;
                            useAsReference: boolean;
                        }[]
                    )
                        .filter((cp) => cp.useAsReference)
                        .sort(
                            (a, b) =>
                                a.stepsFromCenterFront - b.stepsFromCenterFront,
                        )
                        .map((cp) => [cp.name, cp] as const),
                ).values(),
            ),
        },
        {
            title: "Front-back (depth)",
            checkpoints: (
                template.yCheckpoints as {
                    name: string;
                    stepsFromCenterFront: number;
                    useAsReference: boolean;
                }[]
            )
                .filter((cp) => cp.useAsReference)
                .sort(
                    (a, b) => b.stepsFromCenterFront - a.stepsFromCenterFront,
                ),
        },
    ];

    return (
        <div className="flex flex-col gap-16">
            <label className="flex cursor-pointer items-center gap-8">
                <input
                    type="checkbox"
                    checked={flipAxes}
                    onChange={(e) =>
                        onConfigChange({ flipIndoorAxes: e.target.checked })
                    }
                    className="accent-accent size-[1rem]"
                />
                <span className="text-body">
                    Letters (A–E) are lateral, numbers (1–5) are front-back
                </span>
            </label>
            <p className="text-body text-text-subtitle">
                For each field reference, enter the label your PDF uses. Leave
                blank if unused or if it already matches the name shown.
            </p>
            <div className="flex max-h-[420px] flex-col gap-16 overflow-y-auto pr-4">
                {checkpointGroups.map(({ title, checkpoints }) => (
                    <div key={title} className="flex flex-col gap-8">
                        <p className="text-sub text-text-subtitle font-medium tracking-wide uppercase">
                            {title}
                        </p>
                        <div className="flex flex-col gap-6">
                            {checkpoints.map((cp) => (
                                <div
                                    key={`${title}-${cp.name}`}
                                    className="flex items-center gap-12"
                                >
                                    <span className="text-body w-[120px] shrink-0">
                                        {cp.name}
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="blank = use default"
                                        value={aliases[cp.name] ?? ""}
                                        onChange={(e) => {
                                            const updated = {
                                                ...aliases,
                                                [cp.name]: e.target.value,
                                            };
                                            setAliases(updated);
                                            onConfigChange({
                                                indoorAliases: updated,
                                            });
                                        }}
                                        className="border-stroke bg-fg-2 text-body placeholder:text-text-subtitle rounded-6 focus:border-accent flex-1 border px-12 py-6 focus:outline-none"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <StepNavigation onBack={onBack} onNext={onNext} />
        </div>
    );
}
