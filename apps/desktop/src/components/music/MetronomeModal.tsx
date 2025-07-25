import { MetronomeIcon, XIcon } from "@phosphor-icons/react";
import React, { useState } from "react";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import {
    Button,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerCompact,
    SelectGroup,
    SelectTriggerButton,
} from "@openmarch/ui";
import { Slider } from "@openmarch/ui";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { BEAT_STYLES } from "@/hooks/useMetronome";
import { T } from "@tolgee/react";

export default function MetronomeModal({
    label = <MetronomeIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    return (
        <SidebarModalLauncher
            contents={<MetronomeModalContents />}
            newContentId="metronome"
            buttonLabel={label}
            className={buttonClassName}
        />
    );
}

function MetronomeModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const {
        isMetronomeOn,
        setMetronomeOn,
        accentFirstBeat,
        setAccentFirstBeat,
        firstBeatOnly,
        setFirstBeatOnly,
        volume,
        setVolume,
        beatStyle,
        setBeatStyle,
    } = useMetronomeStore();
    const styleKeys = Object.keys(BEAT_STYLES);

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            {/* Header */}
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    <T keyName="music.metronome" />
                </h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                {/* Controls */}
                <div className="flex flex-col gap-10">
                    <h5 className="text-h5">
                        <T keyName="music.general" />
                    </h5>
                    <div className="text-body text-text/80 flex w-full items-center justify-between">
                        <span className="text-body">
                            <T keyName="music.onOff" />
                        </span>
                        <Switch
                            checked={isMetronomeOn}
                            onCheckedChange={setMetronomeOn}
                        />
                    </div>
                    <div className="text-body text-text/80 flex w-full items-center justify-between">
                        <span className="text-body">
                            <T keyName="music.accent" />
                        </span>
                        <Switch
                            checked={accentFirstBeat}
                            onCheckedChange={setAccentFirstBeat}
                        />
                    </div>
                    <div className="text-body text-text/80 flex w-full items-center justify-between">
                        <span className="text-body">
                            <T keyName="music.onlyClickOnMeasure" />
                        </span>
                        <Switch
                            checked={firstBeatOnly}
                            onCheckedChange={setFirstBeatOnly}
                        />
                    </div>
                </div>

                {/* Volume */}
                <div className="flex flex-col gap-10">
                    <h5 className="text-h5">
                        <T keyName="music.volume" />
                    </h5>
                    <div className="flex items-center gap-6">
                        <Slider
                            value={[volume]}
                            min={0}
                            max={100}
                            step={1}
                            onValueChange={([v]) => setVolume(v)}
                        />
                        <span className="text-body w-10 text-right">
                            {volume}
                        </span>
                    </div>
                </div>

                {/* Customization */}
                <div className="flex flex-col gap-10">
                    <h5 className="text-h5">
                        <T keyName="music.customization" />
                    </h5>
                    <div className="text-body text-text/80 flex w-full items-center justify-between">
                        <span className="text-body">
                            <T keyName="music.beatStyle" />
                        </span>
                        <Select value={beatStyle} onValueChange={setBeatStyle}>
                            <SelectTriggerButton
                                label={
                                    (
                                        <T
                                            keyName={
                                                BEAT_STYLES[beatStyle]
                                                    ?.labelKey ||
                                                "music.beatStyle.select"
                                            }
                                        />
                                    ) as any
                                }
                            >
                                <T
                                    keyName={
                                        BEAT_STYLES[beatStyle]?.labelKey ||
                                        "music.beatStyle.select"
                                    }
                                />
                            </SelectTriggerButton>
                            <SelectContent>
                                {styleKeys.map((key) => (
                                    <SelectItem key={key} value={key}>
                                        <T
                                            keyName={BEAT_STYLES[key].labelKey}
                                        />
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        </div>
    );
}
