import { useEffect, useState } from "react";
import {
    Rewind,
    SkipBack,
    Play,
    Pause,
    SkipForward,
    FastForward,
} from "@phosphor-icons/react";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useIsPlaying } from "../../context/IsPlayingContext";
import { topBarComponentProps } from "@/global/Interfaces";
import { usePageStore } from "@/stores/page/usePageStore";
import Page from "../../global/classes/Page";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";
import ToolbarSection from "./ToolbarSection";

function PlaybackControls({ className }: topBarComponentProps) {
    const { selectedPage } = useSelectedPage()!;
    const { pages } = usePageStore()!;
    const { isPlaying } = useIsPlaying()!;
    const [previousPage, setPreviousPage] = useState<Page | null>(null);
    const [nextPage, setNextPage] = useState<Page | null>(null);

    useEffect(() => {
        if (!pages || pages.length === 0 || !selectedPage) {
            setPreviousPage(null);
            setNextPage(null);
        } else {
            setPreviousPage(selectedPage.getPreviousPage(pages));
            setNextPage(selectedPage.getNextPage(pages));
        }
    }, [pages, selectedPage]);

    return (
        <ToolbarSection aria-label="Playback Controls">
            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.firstPage}
                className="btn-secondary rounded-none rounded-l group"
                disabled={!previousPage || isPlaying}
            >
                <Rewind size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.previousPage}
                className="btn-secondary rounded-none"
                disabled={!previousPage || isPlaying}
            >
                <SkipBack size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.playPause}
                className="btn-secondary rounded-none"
                disabled={!nextPage}
            >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.nextPage}
                className="btn-secondary rounded-none"
                disabled={!nextPage || isPlaying}
            >
                <SkipForward size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.lastPage}
                className="btn-secondary rounded-none rounded-r"
                disabled={!nextPage || isPlaying}
            >
                <FastForward size={24} />
            </RegisteredActionButton>
        </ToolbarSection>
    );
}

export default PlaybackControls;
