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
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";

function PlaybackControls({ className }: topBarComponentProps) {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;

    return (
        <div
            className={`playback-controls ${className}`}
            aria-label="Playback Controls"
            title="Playback Controls"
        >
            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.firstPage}
                className="btn-secondary rounded-none rounded-l group"
                disabled={
                    !selectedPage ||
                    selectedPage.previousPageId === null ||
                    isPlaying
                }
            >
                <FaFastBackward />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.previousPage}
                className="btn-secondary rounded-none"
                disabled={
                    !selectedPage ||
                    selectedPage.previousPageId === null ||
                    isPlaying
                }
            >
                <FaStepBackward />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.playPause}
                className="btn-secondary rounded-none"
                disabled={!selectedPage || selectedPage.nextPageId === null}
            >
                {isPlaying ? <FaPause /> : <FaPlay />}
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.nextPage}
                className="btn-secondary rounded-none"
                disabled={
                    !selectedPage ||
                    selectedPage.nextPageId === null ||
                    isPlaying
                }
            >
                <FaStepForward />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.lastPage}
                className="btn-secondary rounded-none rounded-r"
                disabled={
                    !selectedPage ||
                    selectedPage.nextPageId === null ||
                    isPlaying
                }
            >
                <FaFastForward />
            </RegisteredActionButton>
        </div>
    );
}

export default PlaybackControls;
