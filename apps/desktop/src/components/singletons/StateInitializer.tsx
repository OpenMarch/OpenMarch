import { useEffect } from "react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useTimingObjects } from "@/hooks";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { pageAtPlayhead } from "@/timeline/timelinePlayhead";

/**
 * A component that initializes the state of the application.
 * @returns <> </>
 */
function StateInitializer() {
    const { pages } = useTimingObjects();
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    const setSelectedPage = selectedPageContext?.setSelectedPage ?? (() => {});
    const selectedAudioFileContext = useSelectedAudioFile();
    const selectedAudioFile =
        selectedAudioFileContext?.selectedAudioFile ?? null;
    const setSelectedAudioFile =
        selectedAudioFileContext?.setSelectedAudioFile ?? (() => {});

    /*******************************************************************/

    // Select the page at the paused playhead when none is selected (e.g. app load / refresh), or
    // page 0 (first page in show order). When the selected page is deleted, this is the page that
    // took its box, rather than home, which would move the playhead there (defined-coordinates 08)
    useEffect(() => {
        if (selectedPage == null && pages.length > 0) {
            const atPlayhead = pageAtPlayhead(
                pages,
                useTimelineSelectionStore.getState().playheadBeat,
            );
            setSelectedPage(atPlayhead ?? pages[0]);
        }
    }, [pages, selectedPage, setSelectedPage]);

    // UI-9: opening a show selects home, with the playhead at beat 0
    useEffect(() => {
        useTimelineSelectionStore.getState().selectHome();
    }, []);

    // Select the currently selected audio file
    useEffect(() => {
        if (!selectedAudioFile) {
            AudioFile.getSelectedAudioFile().then((audioFile) => {
                setSelectedAudioFile({ ...audioFile, data: undefined });
            });
        }
    }, [selectedAudioFile, setSelectedAudioFile]);

    return <></>; // Empty fragment
}

export default StateInitializer;
