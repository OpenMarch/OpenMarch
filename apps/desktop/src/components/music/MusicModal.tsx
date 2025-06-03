import AudioSelector from "./AudioSelector";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { XIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import {
    getLastBeatOfTempoGroup,
    TempoGroupsFromMeasures,
} from "@/components/music/TempoGroup/TempoGroup";
import { Button } from "@openmarch/ui";
import React, { useEffect, useMemo, useRef } from "react";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import TempoGroupCard from "./TempoGroup/TempoGroupCard";
import NewTempoGroupForm from "./TempoGroup/NewTempoGroupForm";
import { MusicNotesIcon } from "@phosphor-icons/react";

export default function MusicModal({
    label = <MusicNotesIcon size={24} />,
}: {
    label?: string | React.ReactNode;
}) {
    return (
        <SidebarModalLauncher
            contents={<MusicModalContents />}
            buttonLabel={label}
        />
    );
}
function MusicModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const { measures } = useTimingObjectsStore();
    const [newGroupFormIndex, setNewGroupFormIndex] = React.useState<
        number | null
    >(null);
    const [newGroupFormHidden, setNewGroupFormHidden] = React.useState(
        measures.length > 0,
    );
    const [helpBoxOpen, setHelpBoxOpen] = React.useState(false);
    const tempoGroups = useMemo(
        () => TempoGroupsFromMeasures(measures),
        [measures],
    );
    const newFormRef = useRef<HTMLDivElement>(null);

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
        <div className="animate-scale-in text-text flex w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <h4 className="text-h4 leading-none">Music</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>
            {/* <div id="measure editing container">
                <MeasureEditor />
                </div> */}
            <div className="flex flex-col gap-16">
                <AudioSelector />
            </div>
            <div className="flex items-center gap-8">
                <h4 className="text-h4 leading-none">Tempo Groups</h4>
                <button
                    className="text-text-subtitle hover:text-accent rounded-full duration-150 ease-out"
                    onClick={() => setHelpBoxOpen(true)}
                >
                    ?
                </button>
            </div>
            <div id="tempo-groups" className="mx-12 flex flex-col gap-8">
                <div
                    className="bg-fg-2 rounded-4 border-stroke bg-bg-1 flex flex-col gap-8 border p-16"
                    hidden={!helpBoxOpen}
                >
                    <h5 className="font-medium">What is a tempo group?</h5>
                    <ul className="text-text-subtitle ml-8 list-inside list-disc text-sm">
                        <li>
                            Tempo groups are collections of measures that have
                            the same time signature and tempo
                        </li>
                        <li>
                            Groups that have the same time signature and tempo
                            are combined into a single group, unless the second
                            group has a name. (I.e. &quot;A&quot; or
                            &quot;Closer&quot;)
                        </li>
                    </ul>
                    <div className="flex justify-end">
                        <Button
                            variant="secondary"
                            onClick={() => setHelpBoxOpen(false)}
                        >
                            Close
                        </Button>
                    </div>
                </div>
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
                                setSelfHidden={() => setNewGroupFormIndex(null)}
                            />
                        )}
                    </div>
                ))}
                <div className="flex min-h-[40rem] flex-col">
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
                            {newGroupFormHidden ? "Add New Group" : "Cancel"}
                        </Button>
                    </div>
                    <div ref={newFormRef}>
                        {!newGroupFormHidden && (
                            <NewTempoGroupForm scrollFunc={scrollToBottom} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
