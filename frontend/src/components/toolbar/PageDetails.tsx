import { useSelectedPage } from "../../context/SelectedPageContext";

export function PageDetails() {
    const selectedPage = useSelectedPage()?.selectedPage || null;

    return (
        <>
            <h2>Details</h2>
            <div className="page-details">
                {!selectedPage ? <p>no page selected</p> :
                    <p>{selectedPage.id} Current page: {selectedPage.name}, {selectedPage.counts} counts</p>
                }
                {/* toolbar buttons */}
            </div>
        </>
    );
}
