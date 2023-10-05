import { useEffect } from "react";
import { useSelectedMarcher } from "../../../context/SelectedMarcherContext";
import { useSelectedPage } from "../../../context/SelectedPageContext";
import { MarcherPageDetails } from "./MarcherPageDeatils";
import { MarcherPageList } from "./MarcherPageList";
import { useMarcherPageStore } from "../../../stores/Store";

function MarcherPageContainer() {
    const selectedPage = useSelectedPage()?.selectedPage || null;
    const selectedMarcher = useSelectedMarcher()?.selectedMarcher || null;
    const { fetchMarcherPages } = useMarcherPageStore()!;

    useEffect(() => {
        fetchMarcherPages();
        // Should I have some sort of loading thing?
    }, [fetchMarcherPages]);


    return (
        <>
            <h2>Details</h2>
            <div className="list-container">
                {/* // Load a single marcherPage when both a marcher and page are selected */}
                {selectedMarcher && selectedPage ?
                    <MarcherPageDetails />
                    // Load a list of marcherPages when only a marcher or page is selected
                    : selectedMarcher || selectedPage ?
                        <MarcherPageList />
                        : <p>no page or marcher selected</p>}
            </div>
        </>
    );
}

export default MarcherPageContainer;