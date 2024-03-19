import React, { MouseEventHandler, useCallback, useEffect } from "react";
import { ButtonGroup, Button, OverlayTrigger, Tooltip } from "react-bootstrap";
import { FaFastBackward, FaPause, FaPlay, FaFastForward, FaStepBackward, FaStepForward } from "react-icons/fa";
import { DefinedKeyboardActions } from "@/KeyboardListeners";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useIsPlaying } from "../../context/IsPlayingContext";
import { topBarComponentProps } from "@/global/Interfaces";
import { usePageStore } from "@/stores/page/usePageStore";
import { useKeyboardActionsStore } from "@/stores/keyboardShortcutButtons/useKeyboardActionsStore";
import { Page } from "../../global/classes/Page";

enum PlaybackControlsEnum {
    firstPage = "firstPage",
    previousPage = "previousPage",
    nextPage = "nextPage",
    lastPage = "lastPage",
}

function PlaybackControls({ className }: topBarComponentProps) {
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { pages } = usePageStore()!;
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const [previousPage, setPreviousPage] = React.useState<Page | null>(null);
    const [nextPage, setNextPage] = React.useState<Page | null>(null);
    const { registerKeyboardAction } = useKeyboardActionsStore();

    const firstPageRef = React.useRef<HTMLButtonElement>(null);
    const previousPageRef = React.useRef<HTMLButtonElement>(null);
    const nextPageRef = React.useRef<HTMLButtonElement>(null);
    const lastPageRef = React.useRef<HTMLButtonElement>(null);
    const playPauseRef = React.useRef<HTMLButtonElement>(null);

    // register the button refs for the keyboard shortcuts
    useEffect(() => {
        if (firstPageRef.current) {
            registerKeyboardAction(DefinedKeyboardActions.firstPage.keyString, () => {
                firstPageRef.current?.click();
            });
        }
        if (previousPageRef.current) {
            registerKeyboardAction(DefinedKeyboardActions.previousPage.keyString, () => {
                previousPageRef.current?.click();
            });
        }
        if (playPauseRef.current) {
            registerKeyboardAction(DefinedKeyboardActions.playPause.keyString, () => {
                playPauseRef.current?.click();
            });
        }
        if (nextPageRef.current) {
            registerKeyboardAction(DefinedKeyboardActions.nextPage.keyString, () => {
                nextPageRef.current?.click();
            });
        }
        if (lastPageRef.current) {
            registerKeyboardAction(DefinedKeyboardActions.lastPage.keyString, () => {
                lastPageRef.current?.click();
            });
        }
    }, [registerKeyboardAction]);

    useEffect(() => {
        if (!pages || pages.length === 0 || !selectedPage) {
            setPreviousPage(null);
            setNextPage(null);
        } else {
            setPreviousPage(Page.getPreviousPage(selectedPage, pages));
            setNextPage(Page.getNextPage(selectedPage, pages));
        }
    }, [pages, selectedPage]);

    const changeSelectedPageHandler: MouseEventHandler<HTMLButtonElement> = useCallback((e) => {
        const action = e.currentTarget.value as PlaybackControlsEnum;
        switch (action) {
            case PlaybackControlsEnum.firstPage:
                setSelectedPage(Page.getFirstPage(pages));
                break;
            case PlaybackControlsEnum.previousPage:
                if (previousPage) {
                    setSelectedPage(previousPage);
                }
                break;
            case PlaybackControlsEnum.nextPage:
                if (nextPage) {
                    setSelectedPage(nextPage);
                }
                break;
            case PlaybackControlsEnum.lastPage:
                setSelectedPage(Page.getLastPage(pages));
                break;
            default:
                break;
        }
    }, [setSelectedPage, pages, previousPage, nextPage]);

    const togglePlay = useCallback(() => {
        setIsPlaying(!isPlaying);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setIsPlaying, isPlaying]);

    return (
        <div className="playback-controls">
            <ButtonGroup aria-label="Playback Controls" title="Playback Controls" className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {DefinedKeyboardActions.firstPage.instructionalString}
                    </Tooltip>}
                >
                    <Button variant="secondary" title="First page"
                        value={PlaybackControlsEnum.firstPage}
                        onClick={changeSelectedPageHandler}
                        disabled={!previousPage}
                        ref={firstPageRef}
                    >
                        <FaFastBackward />
                    </Button>
                </OverlayTrigger>

                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {DefinedKeyboardActions.previousPage.instructionalString}
                    </Tooltip>}
                >
                    <Button variant="secondary" title="Previous page"
                        value={PlaybackControlsEnum.previousPage}
                        onClick={changeSelectedPageHandler}
                        disabled={!previousPage}
                        ref={previousPageRef}
                    >
                        <FaStepBackward />
                    </Button>
                </OverlayTrigger>

                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {isPlaying ?
                            DefinedKeyboardActions.playPause.instructionalStringToggleOff
                            : DefinedKeyboardActions.playPause.instructionalStringToggleOn
                        }
                    </Tooltip>}
                >
                    <Button variant="secondary" onClick={togglePlay}
                        title="Play or pause" disabled={!nextPage} ref={playPauseRef}
                    >
                        {isPlaying ? <FaPause /> : <FaPlay />}
                    </Button>
                </OverlayTrigger>

                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {DefinedKeyboardActions.nextPage.instructionalString}
                    </Tooltip>}
                >
                    <Button variant="secondary" title="Next page"
                        value={PlaybackControlsEnum.nextPage}
                        onClick={changeSelectedPageHandler}
                        disabled={!nextPage}
                        ref={nextPageRef}
                    >
                        <FaStepForward />
                    </Button>
                </OverlayTrigger>

                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {DefinedKeyboardActions.lastPage.instructionalString}
                    </Tooltip>}
                >
                    <Button variant="secondary" title="Last page"
                        value={PlaybackControlsEnum.lastPage}
                        onClick={changeSelectedPageHandler}
                        disabled={!nextPage}
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
