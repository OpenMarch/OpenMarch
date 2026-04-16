import {
    FadeEffectArgs,
    LightingEffectType,
    parseEffectArgs,
    SolidEffectArgs,
} from "@openmarch/core";
import { ReactNode, useEffect, useId, useState } from "react";

type EffectItemProps = {
    name: string;
    type: LightingEffectType;
    args: string;
    nameChangeFn: (name: string | null) => void;
    typeChangeFn: (type: LightingEffectType) => void;
    argsChangeFn: (argsJson: string) => void;
};

type SolidEffectArgsInputProps = {
    currentArgs: SolidEffectArgs;
    currentArgsJson: string;
    argsChangeFn: (argsJson: string) => void;
};

const SolidEffectArgsInput = ({
    currentArgs,
    currentArgsJson,
    argsChangeFn,
}: SolidEffectArgsInputProps) => {
    const durationId = useId();
    const colorId = useId();
    const [durationMs, setDurationMs] = useState(currentArgs.durationMs);
    const [color, setColor] = useState(currentArgs.color);

    useEffect(() => {
        setDurationMs(currentArgs.durationMs);
        setColor(currentArgs.color);
    }, [currentArgs.color, currentArgs.durationMs]);

    const commitArgs = (draftDurationMs: number, draftColor: string) => {
        const nextArgs: SolidEffectArgs = {
            durationMs: Math.max(0, Math.round(draftDurationMs)),
            color: draftColor,
        };
        const nextArgsJson = JSON.stringify(nextArgs);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    const handleDurationMsBlur = () => {
        const sanitizedDurationMs = Math.max(0, Math.round(durationMs));
        setDurationMs(sanitizedDurationMs);
        commitArgs(sanitizedDurationMs, color);
    };

    const handleColorBlur = () => {
        commitArgs(durationMs, color);
    };

    return (
        <div>
            <label htmlFor={durationId}>Duration (ms)</label>
            <input
                id={durationId}
                min={0}
                type="number"
                value={durationMs}
                onChange={(e) => {
                    setDurationMs(e.currentTarget.valueAsNumber || 0);
                }}
                onBlur={handleDurationMsBlur}
            />

            <label htmlFor={colorId}>Color</label>
            <input
                id={colorId}
                type="color"
                value={color}
                onChange={(e) => {
                    setColor(e.currentTarget.value);
                }}
                onBlur={handleColorBlur}
            />
        </div>
    );
};

type FadeEffectArgsInputProps = {
    currentArgs: FadeEffectArgs;
    currentArgsJson: string;
    argsChangeFn: (argsJson: string) => void;
};

const FadeEffectArgsInput = ({
    currentArgs,
    currentArgsJson,
    argsChangeFn,
}: FadeEffectArgsInputProps) => {
    const durationId = useId();
    const colorId = useId();
    const [durationMs, setDurationMs] = useState(currentArgs.durationMs);
    const [color, setColor] = useState(currentArgs.color);

    useEffect(() => {
        setDurationMs(currentArgs.durationMs);
        setColor(currentArgs.color);
    }, [currentArgs.color, currentArgs.durationMs]);

    const commitArgs = (draftDurationMs: number, draftColor: string) => {
        const nextArgs: FadeEffectArgs = {
            durationMs: Math.max(0, Math.round(draftDurationMs)),
            color: draftColor,
        };
        const nextArgsJson = JSON.stringify(nextArgs);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    return (
        <div>
            <label htmlFor={durationId}>Fade duration (ms)</label>
            <input
                id={durationId}
                min={0}
                type="number"
                value={durationMs}
                onChange={(e) => {
                    setDurationMs(e.currentTarget.valueAsNumber || 0);
                }}
                onBlur={() => {
                    const sanitizedDurationMs = Math.max(
                        0,
                        Math.round(durationMs),
                    );
                    setDurationMs(sanitizedDurationMs);
                    commitArgs(sanitizedDurationMs, color);
                }}
            />

            <label htmlFor={colorId}>Fade target color</label>
            <input
                id={colorId}
                type="color"
                value={color}
                onChange={(e) => {
                    setColor(e.currentTarget.value);
                }}
                onBlur={() => {
                    commitArgs(durationMs, color);
                }}
            />
        </div>
    );
};

type EffectArgsEditorProps = {
    argsJson: string;
    argsChangeFn: (argsJson: string) => void;
};

const effectArgsEditorMap: Record<
    LightingEffectType,
    (props: EffectArgsEditorProps) => ReactNode
> = {
    solid: ({ argsJson, argsChangeFn }) => (
        <SolidEffectArgsInput
            currentArgs={parseEffectArgs("solid", argsJson)}
            currentArgsJson={argsJson}
            argsChangeFn={argsChangeFn}
        />
    ),
    fade: ({ argsJson, argsChangeFn }) => (
        <FadeEffectArgsInput
            currentArgs={parseEffectArgs("fade", argsJson)}
            currentArgsJson={argsJson}
            argsChangeFn={argsChangeFn}
        />
    ),
    strobe: () => <p>Strobe editor is not implemented yet.</p>,
};

const EffectItem = ({
    name,
    type,
    args,
    nameChangeFn,
    typeChangeFn,
    argsChangeFn,
}: EffectItemProps) => {
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextName = e.currentTarget.value.slice(0, 255);
        const normalizedName = nextName.trim() === "" ? null : nextName;
        nameChangeFn(normalizedName);
    };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = e.currentTarget.value as LightingEffectType;
        if (newType === type) return;
        typeChangeFn(newType);
    };

    const renderArgsInput = () =>
        effectArgsEditorMap[type]({ argsJson: args, argsChangeFn });

    return (
        <div aria-label={`${type} lighting effect ${name}`}>
            <input type="text" value={name} onChange={handleNameChange} />
            <select value={type} onChange={handleTypeChange}>
                <option value="solid">Solid</option>
                <option value="strobe">Strobe</option>
                <option value="fade">Fade</option>
            </select>
            {renderArgsInput()}
        </div>
    );
};

export default EffectItem;
