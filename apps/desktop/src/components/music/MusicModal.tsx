import AudioSelector from "./AudioSelector";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { GaugeIcon, MusicNotesIcon, XIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { Button } from "@openmarch/ui";
import React from "react";
import { T, useTranslate } from "@tolgee/react";
import { useTempoModeStore } from "@/tempo/tempoModeStore";

export default function MusicModal({
    label = <MusicNotesIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    const { t } = useTranslate();
    return (
        <SidebarModalLauncher
            name={t("sidebar.music")}
            contents={<MusicModalContents />}
            newContentId="music"
            buttonLabel={label}
            className={buttonClassName}
        />
    );
}

function MusicModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const { t } = useTranslate();
    const openTempoMode = () => {
        toggleOpen();
        useTempoModeStore.getState().setOn(true);
    };

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    <T keyName="music.title" />
                </h4>
                <button
                    aria-label={t("sidebar.close")}
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[30rem] grow flex-col gap-16 overflow-y-auto">
                <AudioSelector />
                {/* Timing lives in tempo mode, next to the music it lines up with: tempos, time
                    signatures, measures, rehearsal marks, MusicXML import and the music's start */}
                <div className="rounded-6 border-stroke bg-fg-1 mx-12 flex flex-col gap-8 border p-12">
                    <p className="text-body text-text/80">
                        {t("music.timingInTempoMode")}
                    </p>
                    <Button
                        size="compact"
                        variant="secondary"
                        className="w-fit"
                        onClick={openTempoMode}
                        data-testid="music-open-tempo-mode"
                    >
                        <GaugeIcon size={18} aria-hidden />
                        {t("music.openTempoMode")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
