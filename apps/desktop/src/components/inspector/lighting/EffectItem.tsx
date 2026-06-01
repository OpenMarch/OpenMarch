import {
    defaultSolidEffectArgs,
    LightingEffectType,
    parseEffectArgs,
    SolidEffectArgs,
} from "@openmarch/core";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerCompact,
} from "@openmarch/ui";
import { RgbaColor } from "@uiw/react-color";
import ColorPicker from "@/components/ui/ColorPicker";
import { T, useTolgee } from "@tolgee/react";
import {
    type ChangeEvent,
    type KeyboardEvent,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { TrashIcon } from "@phosphor-icons/react";

const FALLBACK_RGBA: RgbaColor = { r: 255, g: 0, b: 0, a: 1 };

function isRgbaColor(value: unknown): value is RgbaColor {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<RgbaColor>;
    return (
        typeof candidate.r === "number" &&
        typeof candidate.g === "number" &&
        typeof candidate.b === "number" &&
        typeof candidate.a === "number"
    );
}

function hex6ToRgba(hex: string): RgbaColor {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m) return FALLBACK_RGBA;
    const n = parseInt(m[1], 16);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
        a: 1,
    };
}

function rgbaToHex6(color: RgbaColor): string {
    const r = Math.round(color.r);
    const g = Math.round(color.g);
    const b = Math.round(color.b);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function secondsToMs(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds < 0) return 0;
    return Math.max(0, Math.round(seconds * 1000));
}

function effectTypeLabel(
    effectType: LightingEffectType,
    t: (key: string) => string | undefined,
): string {
    const keyByType = {
        solid: "workspace.lightDesigner.effects.effectItem.typeSolid",
        strobe: "workspace.lightDesigner.effects.effectItem.typeStrobe",
        fade: "workspace.lightDesigner.effects.effectItem.typeFade",
    } as const;
    const fallbackByType = {
        solid: "Solid",
        strobe: "Strobe",
        fade: "Fade",
    } as const;
    return t(keyByType[effectType]) || fallbackByType[effectType];
}

type EffectItemProps = {
    effectId: number;
    name: string;
    type: LightingEffectType;
    args: string;
    nameChangeFn: (name: string | null) => void;
    typeChangeFn: (type: LightingEffectType) => void;
    argsChangeFn: (argsJson: string) => void;
    deleteEffectFn: () => void;
};

type SolidEffectArgsInputProps = {
    currentArgs: SolidEffectArgs;
    currentArgsJson: string;
    argsChangeFn: (argsJson: string) => void;
    durationMs: number;
};

const SolidEffectArgsInput = ({
    currentArgs,
    currentArgsJson,
    argsChangeFn,
    durationMs,
}: SolidEffectArgsInputProps) => {
    const { t } = useTolgee();
    const [colorHex, setColorHex] = useState(currentArgs.color);

    useEffect(() => {
        setColorHex(currentArgs.color);
    }, [currentArgs.color]);

    const commitArgs = (draftColor: string) => {
        const nextArgs: SolidEffectArgs = {
            durationMs: Math.max(0, Math.round(durationMs)),
            color: draftColor,
        };
        const nextArgsJson = JSON.stringify(nextArgs);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    const applyColor = (color: unknown) => {
        if (!isRgbaColor(color)) return;
        const nextHex = rgbaToHex6(color);
        setColorHex(nextHex);
        commitArgs(nextHex);
    };

    return (
        <ColorPicker
            doNotUseForm
            disableAlpha
            className="px-0"
            label={
                t("workspace.lightDesigner.effects.effectItem.color") || "Color"
            }
            initialColor={hex6ToRgba(colorHex)}
            defaultColor={hex6ToRgba(defaultSolidEffectArgs.color)}
            onBlur={applyColor}
        />
    );
};

const EffectItem = ({
    effectId,
    name,
    type,
    args,
    nameChangeFn,
    typeChangeFn,
    argsChangeFn,
    deleteEffectFn,
}: EffectItemProps) => {
    const { t } = useTolgee();
    const nameId = useId();
    const nameInputRef = useRef<HTMLInputElement>(null);
    const durationInputRef = useRef<HTMLInputElement>(null);
    const typeSelectTriggerRef = useRef<HTMLButtonElement>(null);
    const [typePickerOpen, setTypePickerOpen] = useState(false);

    const [durationMs, setDurationMs] = useState(() => {
        const parsed = parseEffectArgs(type, args);
        return parsed.durationMs;
    });

    const [editingName, setEditingName] = useState(false);
    const [editingDuration, setEditingDuration] = useState(false);
    const [draftName, setDraftName] = useState(name);
    const [draftDurationSeconds, setDraftDurationSeconds] = useState(() => {
        const parsed = parseEffectArgs(type, args);
        return parsed.durationMs / 1000;
    });

    useEffect(() => {
        setDraftName(name);
    }, [name]);

    useEffect(() => {
        const parsed = parseEffectArgs(type, args);
        setDurationMs(parsed.durationMs);
        setDraftDurationSeconds(parsed.durationMs / 1000);
    }, [args, type]);

    useEffect(() => {
        if (editingName) nameInputRef.current?.focus();
    }, [editingName]);

    useEffect(() => {
        if (editingDuration) durationInputRef.current?.focus();
    }, [editingDuration]);

    useEffect(() => {
        if (!typePickerOpen) return;
        const id = requestAnimationFrame(() => {
            typeSelectTriggerRef.current?.focus();
        });
        return () => cancelAnimationFrame(id);
    }, [typePickerOpen]);

    const commitNameFromDraft = () => {
        const nextName = draftName.slice(0, 255);
        const normalizedName = nextName.trim() === "" ? null : nextName;
        nameChangeFn(normalizedName);
        setEditingName(false);
    };

    const commitDurationFromDraft = () => {
        const ms = secondsToMs(draftDurationSeconds);
        setDraftDurationSeconds(ms / 1000);
        setDurationMs(ms);
        const base = parseEffectArgs(type, args);
        const nextArgs = { ...base, durationMs: ms };
        const nextJson = JSON.stringify(nextArgs);
        if (nextJson !== args) argsChangeFn(nextJson);
        setEditingDuration(false);
    };

    const openNameEdit = () => {
        setEditingDuration(false);
        setTypePickerOpen(false);
        setDraftName(name);
        setEditingName(true);
    };

    const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
        setDraftName(e.currentTarget.value.slice(0, 255));
    };

    const handleNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commitNameFromDraft();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            setDraftName(name);
            setEditingName(false);
        }
    };

    const displayName =
        name.trim() !== ""
            ? name
            : t("workspace.lightDesigner.effects.effectItem.defaultName", {
                  id: effectId,
              }) || `Effect ${effectId}`;

    const handleTypeChange = (newType: string) => {
        const next = newType as LightingEffectType;
        if (next !== "solid") return;
        if (next === type) return;
        setEditingName(false);
        setEditingDuration(false);
        setTypePickerOpen(false);
        typeChangeFn(next);
    };

    const openTypePicker = () => {
        if (editingName) commitNameFromDraft();
        if (editingDuration) commitDurationFromDraft();
        setTypePickerOpen(true);
    };

    const renderArgsInput = () => {
        const parsedArgs = parseEffectArgs(type, args) as SolidEffectArgs;
        return (
            <SolidEffectArgsInput
                currentArgs={parsedArgs}
                currentArgsJson={args}
                argsChangeFn={argsChangeFn}
                durationMs={durationMs}
            />
        );
    };

    return (
        <div
            className="flex w-full flex-col gap-8"
            aria-label={`${type} lighting effect ${name.trim() !== "" ? name : `Effect ${effectId}`}`}
        >
            <div className="flex w-full min-w-0 items-start justify-between gap-6">
                <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1">
                    {editingName ? (
                        <Input
                            id={nameId}
                            ref={nameInputRef}
                            compact
                            type="text"
                            className="w-full min-w-0"
                            value={draftName}
                            onChange={handleNameChange}
                            onBlur={commitNameFromDraft}
                            onKeyDown={handleNameKeyDown}
                            aria-label={
                                t(
                                    "workspace.lightDesigner.effects.effectItem.name",
                                ) || "Name"
                            }
                        />
                    ) : (
                        <button
                            type="button"
                            className={
                                name.trim() === ""
                                    ? "text-h5 text-text/50 hover:text-text/80 w-full min-w-0 cursor-pointer truncate text-left italic transition-colors"
                                    : "text-h5 text-text hover:text-accent w-full min-w-0 cursor-pointer truncate text-left transition-colors"
                            }
                            onClick={openNameEdit}
                        >
                            {displayName}
                        </button>
                    )}

                    {typePickerOpen ? (
                        <Select
                            value={type}
                            open={typePickerOpen}
                            onOpenChange={setTypePickerOpen}
                            onValueChange={(value) => {
                                handleTypeChange(value);
                            }}
                        >
                            <SelectTriggerCompact
                                ref={typeSelectTriggerRef}
                                className="border-stroke bg-fg-2 w-fit max-w-full min-w-[7rem] justify-between self-start"
                                label={
                                    t(
                                        "workspace.lightDesigner.effects.effectItem.effectType",
                                    ) || "Effect type"
                                }
                            />
                            <SelectContent>
                                <SelectItem value="solid">
                                    <T
                                        keyName="workspace.lightDesigner.effects.effectItem.typeSolid"
                                        defaultValue="Solid"
                                    />
                                </SelectItem>
                                <SelectItem value="strobe" disabled>
                                    <T
                                        keyName="workspace.lightDesigner.effects.effectItem.typeStrobe"
                                        defaultValue="Strobe"
                                    />
                                </SelectItem>
                                <SelectItem value="fade" disabled>
                                    <T
                                        keyName="workspace.lightDesigner.effects.effectItem.typeFade"
                                        defaultValue="Fade"
                                    />
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    ) : (
                        <button
                            type="button"
                            className="text-sub text-text/60 hover:text-accent w-fit max-w-full cursor-pointer text-left transition-colors"
                            onClick={openTypePicker}
                            aria-label={
                                t(
                                    "workspace.lightDesigner.effects.effectItem.effectType",
                                ) || "Effect type"
                            }
                        >
                            {effectTypeLabel(type, t)}
                        </button>
                    )}
                </div>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            className="shrink-0"
                            variant="secondary"
                            size="compact"
                            aria-label={t(
                                "workspace.lightDesigner.effects.effectItem.deleteAria",
                                { defaultValue: "Delete effect" },
                            )}
                        >
                            <TrashIcon size={18} aria-hidden />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogTitle>
                            <T
                                keyName="workspace.lightDesigner.effects.effectItem.deleteTitle"
                                defaultValue="Delete this effect?"
                            />
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <T
                                keyName="workspace.lightDesigner.effects.effectItem.deleteDescription"
                                defaultValue="This effect will be removed from the current lighting scene."
                            />
                        </AlertDialogDescription>
                        <div className="flex justify-end gap-8 pt-16">
                            <AlertDialogCancel asChild>
                                <Button variant="secondary" size="compact">
                                    <T
                                        keyName="workspace.lightDesigner.effects.effectItem.cancel"
                                        defaultValue="Cancel"
                                    />
                                </Button>
                            </AlertDialogCancel>
                            <AlertDialogAction>
                                <Button
                                    variant="red"
                                    size="compact"
                                    onClick={deleteEffectFn}
                                >
                                    <T
                                        keyName="workspace.lightDesigner.effects.effectItem.deleteConfirm"
                                        defaultValue="Delete"
                                    />
                                </Button>
                            </AlertDialogAction>
                        </div>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            {renderArgsInput()}
        </div>
    );
};

export default EffectItem;
