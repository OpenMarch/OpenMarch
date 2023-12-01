import { useCallback, useEffect, useState } from "react";
import { HASHES, YARD_LINES } from "../../Constants";
import { useSelectedMarcher } from "../../context/SelectedMarcherContext";
import { ReadableCoords } from "../../Interfaces";
import { canvasCoordsToCollegeRCords, getTerseString } from "../../utilities/CoordsUtils";
import { useMarcherPageStore } from "../../stores/Store";
import { useSelectedPage } from "../../context/SelectedPageContext";

function MarcherEditor() {
    const { selectedMarcher } = useSelectedMarcher()!;
    const [rCoords, setRCoords] = useState<ReadableCoords>();
    const { marcherPages } = useMarcherPageStore()!;
    const { selectedPage } = useSelectedPage()!;

    const coordsFormId = "coords-form";
    const xInputId = "x-input";
    const xDescriptionId = "x-description";
    const yardLineId = "yard-line";
    const fieldSideId = "field-side";
    const yInputId = "y-input";
    const yDescriptionId = "y-description";
    const hashId = "hash";

    const detailsFormId = "details-form";


    const handleCoordsSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const xSteps = form[xInputId].value;
        const xDescription = form[xDescriptionId].value;
        const yardLine = form[yardLineId].value;
        const fieldSide = form[fieldSideId].value;

        console.log("MarcherEditor: handleSubmit", xSteps, xDescription, yardLine, fieldSide);
    }

    useEffect(() => {
        setRCoords(undefined);
        const marcherPage = marcherPages.find(marcherPage => marcherPage.marcher_id === selectedMarcher?.id &&
            marcherPage.page_id === selectedPage?.id);
        if (marcherPage) {
            setRCoords(canvasCoordsToCollegeRCords(marcherPage.x, marcherPage.y));
            console.log("MarcherEditor: useEffect", canvasCoordsToCollegeRCords(marcherPage.x, marcherPage.y));
        }
    }, [selectedMarcher, marcherPages, selectedPage]);

    const resetForm = useCallback(() => {
        const coordsForm = document.getElementById(coordsFormId) as HTMLFormElement;
        const detailsForm = document.getElementById(detailsFormId) as HTMLFormElement;
        if (coordsForm) {
            coordsForm.reset();
            if (rCoords) {
                coordsForm[xInputId].value = rCoords?.xSteps;
                coordsForm[xDescriptionId].value = rCoords?.xDescription;
                coordsForm[yardLineId].value = rCoords?.yardLine;
                coordsForm[fieldSideId].value = rCoords?.side;

                coordsForm[yInputId].value = rCoords?.ySteps;
                coordsForm[yDescriptionId].value = rCoords?.yDescription;
                coordsForm[hashId].value = rCoords?.hash;
            }
        }
        if (detailsForm)
            detailsForm.reset();
    }, [rCoords]);

    // Reset the form when the selected page changes so the values are correct
    useEffect(() => {
        resetForm();
    }, [selectedMarcher, rCoords, resetForm]);

    return (
        <>{selectedMarcher && (<div className="marcher-editor editor">
            <h3 className="header">
                <span>Marcher</span>
                <span>{selectedMarcher.drill_number}</span>
            </h3>
            <h4>Coordinates</h4>
            {!rCoords ? <p>Error loading coordinates</p> :
                <form className="coords-editor edit-group" id={coordsFormId} onSubmit={handleCoordsSubmit}>
                    <label htmlFor={xInputId}>X</label>
                    <div className="input-group">
                        {/* Maybe on change of all of the variables updating, but only when clicking off for the steps */}
                        <input disabled={true} type="number" defaultValue={rCoords?.xSteps} id={xInputId} />
                        <select disabled={true} defaultValue={rCoords.xDescription} id={xDescriptionId}>
                            <option value="inside">in</option>
                            <option value="outside">out</option>
                        </select>
                        <select disabled={true} id={yardLineId} defaultValue={rCoords.yardLine}>
                            {YARD_LINES.map((yardLine) => (
                                <option value={yardLine} key={yardLine}>{yardLine}</option>
                            ))}
                        </select>
                        <select disabled={true} id={fieldSideId} defaultValue={rCoords.side}>
                            <option value="1">S1</option>
                            <option value="2">S2</option>
                        </select>
                    </div>
                    <label htmlFor={yInputId}>Y</label>
                    <div className="input-group">
                        <input disabled={true} type="number" value={rCoords?.ySteps} id={yInputId} />
                        <select disabled={true} value={rCoords.yDescription} id={yDescriptionId}>
                            <option value="in front of">front</option>
                            <option value="behind">behind</option>
                        </select>
                        <select disabled={true} id={hashId}>
                            {HASHES.map((hash) => (
                                <option value={hash} key={hash}>{getTerseString(hash)}</option>
                            ))}
                        </select>
                    </div>
                    {/* This is here so the form submits when enter is pressed */}
                    <button type="submit" style={{ display: 'none' }}>
                        Submit
                    </button>
                </form>
            }
            <h4>Details</h4>
            <form className="marcher-details-editor edit-group" id={detailsFormId}>
                <div className="input-group">
                    <label htmlFor="name-input">Name</label>
                    <input type="text" value={selectedMarcher.name} disabled={true} id="name-input" />
                </div>
                <div className="input-group">
                    <label htmlFor="instrument-input">Section</label>
                    <input type="text" value={selectedMarcher.instrument} disabled={true} id="instrument-input" />
                </div>
                <div className="input-group">
                    <label htmlFor="drill-number-input">Drill Number</label>
                    <input type="text" value={selectedMarcher.drill_number} disabled={true} id="drill-number-input" />
                </div>
                {/* <label htmlFor="counts-input">Counts</label>
                <input type="number" value={selectedMarcher.counts} onChange={undefined} id="counts-input" /> */}
                {/* This is here so the form submits when enter is pressed */}
                <button type="submit" style={{ display: 'none' }}>
                    Submit
                </button>
            </form>
        </div>)
        }</>
    );
}

export default MarcherEditor;
