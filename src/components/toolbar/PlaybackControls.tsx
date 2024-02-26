import React, { MouseEventHandler, useCallback, useEffect } from "react";
import { ButtonGroup, Button, OverlayTrigger, Tooltip } from "react-bootstrap";
import { FaFastBackward, FaPause, FaPlay, FaFastForward, FaStepBackward, FaStepForward } from "react-icons/fa";
import { DefinedKeyboardActions } from "@/KeyboardListeners";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useIsPlaying } from "../../context/IsPlayingContext";
import { topBarComponentProps } from "@/global/Interfaces";
import { usePageStore } from "@/stores/page/usePageStore";
import { getNextPage } from "../page/PageUtils";
import { useKeyboardActionsStore } from "@/stores/keyboardShortcutButtons/useKeyboardActionsStore";

function PlaybackControls({ className }: topBarComponentProps) {
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { pages } = usePageStore()!;
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const [playIsDisabled, setPlayIsDisabled] = React.useState(false);
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
        if (!pages || pages.length === 0 || !selectedPage)
            setPlayIsDisabled(true);
        else if (getNextPage(selectedPage, pages) === null)
            setPlayIsDisabled(true);
        else
            setPlayIsDisabled(false);
    }, [pages, selectedPage]);

    const changeSelectedPageHandler: MouseEventHandler<HTMLButtonElement> = useCallback((e) => {
        const newPageOrder = parseInt(e.currentTarget.value);
        if (selectedPage) {
            setSelectedPage(pages.find(page => page.order === newPageOrder) || selectedPage);
        }
    }, [selectedPage, pages, setSelectedPage]);

    const lowestPageOrder = useCallback(() => {
        if (selectedPage && pages.length > 0) {
            const orders = Object.values(pages).map(page => page.order);
            return Math.min(...orders);
        }

        // Default, may cause issues
        return 0;
    }, [selectedPage, pages]);

    const hightestPageOrder = useCallback(() => {
        if (selectedPage && pages.length > 0) {
            const orders = Object.values(pages).map(page => page.order);
            return Math.max(...orders);
        }

        // Default, may cause issues
        return 0;
    }, [selectedPage, pages]);

    const togglePlay = () => { setIsPlaying(!isPlaying); };
    return (
        <div className="playback-controls">
            <ButtonGroup aria-label="Playback Controls" title="Playback Controls" className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}></Tooltip>}
                >
                    <Button variant="secondary" title="First page"
                        value={lowestPageOrder()}
                        onClick={changeSelectedPageHandler}
                        disabled={selectedPage?.order === lowestPageOrder()}
                        ref={firstPageRef}
                    >
                        <FaFastBackward />
                    </Button>
                </OverlayTrigger>

                <Button variant="secondary" title="Previous page"
                    value={selectedPage ? selectedPage.order - 1 : -1}
                    onClick={changeSelectedPageHandler}
                    disabled={selectedPage?.order === lowestPageOrder()}
                    ref={previousPageRef}
                >
                    <FaStepBackward />
                </Button>
                <Button variant="secondary" onClick={togglePlay} title="Play or pause" disabled={playIsDisabled} ref={playPauseRef}>
                    {isPlaying ? <FaPause /> : <FaPlay />}
                </Button>
                <Button variant="secondary" title="Next page"
                    value={selectedPage ? selectedPage.order + 1 : +1}
                    onClick={changeSelectedPageHandler}
                    disabled={selectedPage?.order === hightestPageOrder()}
                    ref={nextPageRef}
                >
                    <FaStepForward />
                </Button>
                <Button variant="secondary" title="Last page"
                    value={hightestPageOrder()}
                    onClick={changeSelectedPageHandler}
                    disabled={selectedPage?.order === hightestPageOrder()}
                    ref={lastPageRef}
                >
                    <FaFastForward />
                </Button>
            </ButtonGroup>
        </div>
    );
}

export default PlaybackControls;
