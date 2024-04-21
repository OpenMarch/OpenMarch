import { useEffect, useRef, useState } from "react";
import { ButtonGroup, Button, OverlayTrigger, Tooltip } from "react-bootstrap";
import { FaFastBackward, FaPause, FaPlay, FaFastForward, FaStepBackward, FaStepForward } from "react-icons/fa";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useIsPlaying } from "../../context/IsPlayingContext";
import { topBarComponentProps } from "@/global/Interfaces";
import { usePageStore } from "@/stores/page/usePageStore";
import { Page } from "../../global/classes/Page";
import { useRegisteredActionsStore } from "@/stores/registeredAction/useRegisteredActionsStore";
import { RegisteredActionsEnum } from "@/utilities/RegisteredActionsHandler";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";

enum PlaybackControlsEnum {
    firstPage = "firstPage",
    previousPage = "previousPage",
    nextPage = "nextPage",
    lastPage = "lastPage",
}

function PlaybackControls({ className }: topBarComponentProps) {
    const { selectedPage } = useSelectedPage()!;
    const { pages } = usePageStore()!;
    const { isPlaying } = useIsPlaying()!;
    const [previousPage, setPreviousPage] = useState<Page | null>(null);
    const [nextPage, setNextPage] = useState<Page | null>(null);
    const { linkRegisteredAction } = useRegisteredActionsStore();

    const firstPageRef = useRef<HTMLButtonElement>(null);
    const previousPageRef = useRef<HTMLButtonElement>(null);
    const nextPageRef = useRef<HTMLButtonElement>(null);
    const lastPageRef = useRef<HTMLButtonElement>(null);
    const playPauseRef = useRef<HTMLButtonElement>(null);

    // register the button refs for the keyboard shortcuts
    useEffect(() => {
        if (firstPageRef.current) linkRegisteredAction(RegisteredActionsEnum.firstPage, firstPageRef);
        if (previousPageRef.current) linkRegisteredAction(RegisteredActionsEnum.previousPage, previousPageRef);
        if (playPauseRef.current) linkRegisteredAction(RegisteredActionsEnum.playPause, playPauseRef);
        if (nextPageRef.current) linkRegisteredAction(RegisteredActionsEnum.nextPage, nextPageRef);
        if (lastPageRef.current) linkRegisteredAction(RegisteredActionsEnum.lastPage, lastPageRef);
    }, [linkRegisteredAction]);

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
        <div className="playback-controls">
            <ButtonGroup aria-label="Playback Controls" title="Playback Controls" className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.firstPage.instructionalString}
                    </Tooltip>}
                >
                    <Button variant="secondary" title="First page"
                        value={PlaybackControlsEnum.firstPage}
                        disabled={!previousPage || isPlaying}
                        ref={firstPageRef}
                    >
                        <FaFastBackward />
                    </Button>
                </OverlayTrigger>

                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.previousPage.instructionalString}
                    </Tooltip>}
                >
                    <Button variant="secondary" title="Previous page"
                        value={PlaybackControlsEnum.previousPage}
                        disabled={!previousPage || isPlaying}
                        ref={previousPageRef}
                    >
                        <FaStepBackward />
                    </Button>
                </OverlayTrigger>

                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {isPlaying ?
                            RegisteredActionsObjects.playPause.instructionalStringToggleOff
                            : RegisteredActionsObjects.playPause.instructionalStringToggleOn
                        }
                    </Tooltip>}
                >
                    <Button variant="secondary"
                        title="Play or pause" disabled={!nextPage} ref={playPauseRef}
                    >
                        {isPlaying ? <FaPause /> : <FaPlay />}
                    </Button>
                </OverlayTrigger>

                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.nextPage.instructionalString}
                    </Tooltip>}
                >
                    <Button variant="secondary" title="Next page"
                        value={PlaybackControlsEnum.nextPage}
                        disabled={!nextPage || isPlaying}
                        ref={nextPageRef}
                    >
                        <FaStepForward />
                    </Button>
                </OverlayTrigger>

                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.lastPage.instructionalString}
                    </Tooltip>}
                >
                    <Button variant="secondary" title="Last page"
                        value={PlaybackControlsEnum.lastPage}
                        disabled={!nextPage || isPlaying}
                        ref={lastPageRef}
                    >
                        <FaFastForward />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>
        </div>
    );
}

export default PlaybackControls;
