import React, { MouseEventHandler, useCallback } from "react";
import { ButtonGroup, Button } from "react-bootstrap";
import { FaFastBackward, FaBackward, FaPause, FaPlay, FaForward, FaFastForward } from "react-icons/fa";
import { useSelectedPage } from "../context/SelectedPageContext";
import { usePageStore } from "../stores/Store";
import { useIsPlaying } from "../context/IsPlayingContext";

function PlaybackControls() {
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { pages } = usePageStore()!;
    const { isPlaying, setIsPlaying } = useIsPlaying()!;

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
            <ButtonGroup aria-label="Basic example">
                <Button variant="secondary" title="First page"
                    value={lowestPageOrder()}
                    onClick={changeSelectedPageHandler}
                    disabled={selectedPage?.order === lowestPageOrder()}
                >
                    <FaFastBackward />
                </Button>
                <Button variant="secondary" title="Previous page"
                    value={selectedPage ? selectedPage.order - 1 : -1}
                    onClick={changeSelectedPageHandler}
                    disabled={selectedPage?.order === lowestPageOrder()}
                >
                    <FaBackward />
                </Button>
                <Button variant="secondary" onClick={togglePlay} title="Play or pause">
                    {isPlaying ? <FaPause /> : <FaPlay />}
                </Button>
                <Button variant="secondary" title="Next page"
                    value={selectedPage ? selectedPage.order + 1 : +1}
                    onClick={changeSelectedPageHandler}
                    disabled={selectedPage?.order === hightestPageOrder()}
                >
                    <FaForward />
                </Button>
                <Button variant="secondary" title="Last page"
                    value={hightestPageOrder()}
                    onClick={changeSelectedPageHandler}
                    disabled={selectedPage?.order === hightestPageOrder()}
                >
                    <FaFastForward />
                </Button>
            </ButtonGroup>
        </div>
    );
}

export default PlaybackControls;
