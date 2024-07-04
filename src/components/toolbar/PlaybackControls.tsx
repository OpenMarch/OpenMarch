import { useEffect, useState } from "react";
import {
    FaFastBackward,
    FaPause,
    FaPlay,
    FaFastForward,
    FaStepBackward,
    FaStepForward,
} from "react-icons/fa";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useIsPlaying } from "../../context/IsPlayingContext";
import { topBarComponentProps } from "@/global/Interfaces";
import { usePageStore } from "@/stores/page/usePageStore";
import Page from "../../global/classes/Page";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";

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
        <div
            className={`playback-controls ${className}`}
            aria-label="Playback Controls"
            title="Playback Controls"
        >
            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.firstPage}
                className="btn-secondary rounded-none rounded-l group"
                disabled={!previousPage || isPlaying}
            >
                <FaFastBackward />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.previousPage}
                className="btn-secondary rounded-none"
                disabled={!previousPage || isPlaying}
            >
                <FaStepBackward />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.playPause}
                className="btn-secondary rounded-none"
                disabled={!nextPage}
            >
                {isPlaying ? <FaPause /> : <FaPlay />}
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.nextPage}
                className="btn-secondary rounded-none"
                disabled={!nextPage || isPlaying}
            >
                <FaStepForward />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.lastPage}
                className="btn-secondary rounded-none rounded-r"
                disabled={!nextPage || isPlaying}
            >
                <FaFastForward />
            </RegisteredActionButton>
        </div>
    );
}

export default PlaybackControls;
