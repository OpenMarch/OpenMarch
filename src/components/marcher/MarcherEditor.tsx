import { useCallback, useEffect, useRef, useState } from "react";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherPageStore } from "@/stores/marcherPage/useMarcherPageStore";
import { ReadableCoords } from "@/global/classes/ReadableCoords";

function MarcherEditor() {
    const { selectedMarchers } = useSelectedMarchers()!;
    const [rCoords, setRCoords] = useState<ReadableCoords>();
    const { marcherPages } = useMarcherPageStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { fieldProperties } = useFieldProperties()!;

    const coordsFormRef = useRef<HTMLFormElement>(null);
    const xInputRef = useRef<HTMLInputElement>(null);
    const xDescriptionRef = useRef<HTMLSelectElement>(null);
    const xCheckpointRef = useRef<HTMLSelectElement>(null);
    const fieldSideRef = useRef<HTMLSelectElement>(null);
    const yInputRef = useRef<HTMLInputElement>(null);
    const yDescriptionRef = useRef<HTMLSelectElement>(null);
    const yCheckpointRef = useRef<HTMLSelectElement>(null);
    const detailsFormRef = useRef<HTMLFormElement>(null);

    const handleCoordsSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // const form = event.currentTarget;
        // const xSteps = form[xInputId].value;
        // const xDescription = form[xDescriptionId].value;
        // const yardLine = form[yardLineId].value;
        // const fieldSide = form[fieldSideId].value;
    }

    useEffect(() => {
        setRCoords(undefined);
        if (!selectedMarchers || selectedMarchers.length !== 1) return;
        const marcherPage = marcherPages.find(marcherPage => marcherPage.marcher_id === selectedMarchers[0]?.id &&
            marcherPage.page_id === selectedPage?.id);
        if (marcherPage) {
            if (!fieldProperties) return;
            const newRcoords = ReadableCoords.fromMarcherPage(marcherPage);
            setRCoords(newRcoords);
        }
    }, [selectedMarchers, marcherPages, selectedPage, fieldProperties]);

    const resetForm = useCallback(() => {
        coordsFormRef.current?.reset();

        if (rCoords) {
            if (xInputRef.current) xInputRef.current.value = rCoords.xSteps.toString();
            if (xDescriptionRef.current) xDescriptionRef.current.value = rCoords.xDescription;
            if (xCheckpointRef.current) xCheckpointRef.current.value = rCoords.xCheckpoint.terseName || rCoords.xCheckpoint.name;
            if (fieldSideRef.current) fieldSideRef.current.value = rCoords.side.toString();
            if (yInputRef.current) yInputRef.current.value = rCoords.ySteps.toString();
            if (yDescriptionRef.current) yDescriptionRef.current.value = rCoords.yDescription;
            if (yCheckpointRef.current) yCheckpointRef.current.value = rCoords.yCheckpoint.terseName || rCoords.yCheckpoint.name;
        }

        detailsFormRef.current?.reset();
    }, [rCoords]);

    // Reset the form when the selected page changes so the values are correct
    useEffect(() => {
        resetForm();
    }, [selectedMarchers, rCoords, resetForm]);

    return (
        <>{selectedMarchers.length > 0 && (<div className="marcher-editor editor">

            {selectedMarchers.length > 1 ?
                // Multiple marchers selected
                <>
                    <h3 className="header">
                        <span>Marchers</span>
                        <span>{`(${selectedMarchers.length})`}</span>
                    </h3>
                    <h4>Selected</h4>
                    <p style={{ color: "white" }}>
                        {selectedMarchers.map(marcher => marcher.drill_number).join(', ')}
                    </p>
                </>
                :
                // One marcher selected
                <>
                    <h3 className="header">
                        <span>Marcher</span>
                        <span>{selectedMarchers[0].drill_number}</span>
                    </h3>
                    <h4>Coordinates</h4>
                    {!rCoords ? <p style={{ color: "white" }}>Error loading coordinates</p> :
                        <form className="coords-editor edit-group" ref={coordsFormRef} onSubmit={handleCoordsSubmit}>
                            <label htmlFor="xInput">X</label>
                            <div className="input-group">
                                {/* Maybe on change of all of the variables updating, but only when clicking off for the steps */}
                                <input disabled={true} type="number" defaultValue={rCoords?.xSteps} ref={xInputRef} />
                                <select disabled={true} defaultValue={rCoords.xDescription} ref={xDescriptionRef}>
                                    <option value="inside">in</option>
                                    <option value="outside">out</option>
                                    <option value="on">on</option>
                                </select>
                                <select disabled={true} ref={xCheckpointRef} defaultValue={rCoords.xCheckpoint.terseName || rCoords.xCheckpoint.name}>
                                    {fieldProperties!.xCheckpoints.map((xCheckpoint) => (
                                        <option value={xCheckpoint.terseName} key={xCheckpoint.stepsFromCenterFront}>{xCheckpoint.terseName}</option>
                                    ))}
                                </select>
                                <select disabled={true} ref={fieldSideRef} defaultValue={rCoords.side}>
                                    <option value="1">S1</option>
                                    <option value="2">S2</option>
                                </select>
                            </div>
                            <label htmlFor="yInput">Y</label>
                            <div className="input-group">
                                <input disabled={true} type="number" value={rCoords?.ySteps} ref={yInputRef} />
                                <select disabled={true} value={rCoords.yDescription} ref={yDescriptionRef}>
                                    <option value="in front of">front</option>
                                    <option value="behind">behind</option>
                                    <option value="on">on</option>
                                </select>
                                <select disabled={true} ref={yCheckpointRef} defaultValue={rCoords.yCheckpoint.terseName || rCoords.yCheckpoint.name}>
                                    {fieldProperties?.yCheckpoints.map((yCheckpoint) => (
                                        <option value={yCheckpoint.terseName || yCheckpoint.name} key={yCheckpoint.name}>
                                            {yCheckpoint.name}
                                        </option>
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
                    <form className="marcher-details-editor edit-group" ref={detailsFormRef}>
                        <div className="input-group">
                            <label htmlFor="name-input">Name</label>
                            <input type="text"
                                value={(selectedMarchers[0].name.length < 1 || selectedMarchers[0].name === " ") ? "-"
                                    : selectedMarchers[0].name} disabled={true} id="name-input" />
                        </div>
                        <div className="input-group">
                            <label htmlFor="section-input">Section</label>
                            <input type="text" value={selectedMarchers[0].section} disabled={true} id="section-input" />
                        </div>
                        <div className="input-group">
                            <label htmlFor="drill-number-input">Drill Number</label>
                            <input type="text" value={selectedMarchers[0].drill_number} disabled={true} id="drill-number-input" />
                        </div>
                        {/* This is here so the form submits when enter is pressed */}
                        <button type="submit" style={{ display: 'none' }}>
                            Submit
                        </button>
                    </form>
                </>}
        </div>)
        }</>
    );
}

export default MarcherEditor;
