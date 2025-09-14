import AudioSelector from "./AudioSelector";
import MusicXmlSelector from "./MusicXmlSelector";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { BooksIcon, XIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import {
    getLastBeatOfTempoGroup,
    TempoGroupsFromMeasures,
} from "@/components/music/TempoGroup/TempoGroup";
import { Button } from "@openmarch/ui";
import React, { useEffect, useMemo, useRef } from "react";
import { useTimingObjects } from "@/hooks";
import TempoGroupCard from "./TempoGroup/TempoGroupCard";
import NewTempoGroupForm from "./TempoGroup/NewTempoGroupForm";
import { MusicNotesIcon } from "@phosphor-icons/react";
import { T, useTolgee } from "@tolgee/react";

export default function MusicModal({
    label = <MusicNotesIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    return (
        <SidebarModalLauncher
            contents={<MusicModalContents />}
            newContentId="music"
            buttonLabel={label}
            className={buttonClassName}
        />
    );
}

function MusicModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const { measures } = useTimingObjects();
    const [newGroupFormIndex, setNewGroupFormIndex] = React.useState<
        number | null
    >(null);
    const [newGroupFormHidden, setNewGroupFormHidden] = React.useState(
        measures.length > 0,
    );
    const tempoGroups = useMemo(
        () => TempoGroupsFromMeasures(measures),
        [measures],
    );

    useEffect(() => {
        console.log("measures", measures);
        // console.debug("tempoGroups", tempoGroups);
    }, [measures]);

    const newFormRef = useRef<HTMLDivElement>(null);
    const { t } = useTolgee();

    const scrollToBottom = () => {
        newFormRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (newGroupFormIndex !== null) {
            setNewGroupFormHidden(true);
        }
    }, [newGroupFormIndex]);

    useEffect(() => {
        if (!newGroupFormHidden) {
            setNewGroupFormIndex(null);
        }
    }, [newGroupFormHidden]);

    useEffect(() => {
        if (!measures.length) {
            setNewGroupFormHidden(false);
        }
    }, [measures]);

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    <T keyName="music.title" />
                </h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[30rem] grow flex-col gap-16 overflow-y-auto">
                <div className="flex flex-col gap-16">
                    <AudioSelector />
                </div>
                <div className="flex items-center gap-8">
                    <h4 className="text-h4 leading-none">
                        <T keyName="music.tempoGroups" />
                    </h4>
                    <a
                        href="https://openmarch.com/guides/music/tempo"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <Button
                            size={"compact"}
                            variant="secondary"
                            className="w-fit min-w-fit whitespace-nowrap"
                        >
                            <BooksIcon size={22} />
                            <T keyName="music.seeDocs" />
                        </Button>
                    </a>
                </div>
                <div className="flex flex-col gap-16">
                    <MusicXmlSelector />
                </div>
                <div id="tempo-groups" className="mx-12 flex flex-col gap-8">
                    {tempoGroups.map((tempoGroup, i) => (
                        <div key={i} className="flex flex-col gap-8">
                            <TempoGroupCard
                                tempoGroup={tempoGroup}
                                index={i}
                                setNewGroupFormIndex={setNewGroupFormIndex}
                            />
                            {newGroupFormIndex === i && (
                                <NewTempoGroupForm
                                    startingPosition={
                                        getLastBeatOfTempoGroup(tempoGroup)
                                            ?.position ?? undefined
                                    }
                                    setSelfHidden={() =>
                                        setNewGroupFormIndex(null)
                                    }
                                />
                            )}
                        </div>
                    ))}
                    <div className="flex flex-col">
                        <div
                            className="flex justify-end py-8"
                            hidden={measures.length === 0}
                        >
                            <Button
                                variant="secondary"
                                onClick={() =>
                                    setNewGroupFormHidden(!newGroupFormHidden)
                                }
                            >
                                {newGroupFormHidden
                                    ? t("music.addTempoGroup")
                                    : t("music.cancel")}
                            </Button>
                        </div>
                        <div ref={newFormRef}>
                            {!newGroupFormHidden && (
                                <NewTempoGroupForm
                                    scrollFunc={scrollToBottom}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
