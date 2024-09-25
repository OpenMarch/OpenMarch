import { useCallback, useEffect, useRef, useState } from "react";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import {
    ReadableCoords,
    X_DESCRIPTION,
    Y_DESCRIPTION,
} from "@/global/classes/ReadableCoords";
import RegisteredActionButton from "../RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";

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
    };

    useEffect(() => {
        setRCoords(undefined);
        if (!selectedMarchers || selectedMarchers.length !== 1) return;
        const marcherPage = marcherPages.find(
            (marcherPage) =>
                marcherPage.marcher_id === selectedMarchers[0]?.id &&
                marcherPage.page_id === selectedPage?.id
        );
        if (marcherPage) {
            if (!fieldProperties) return;
            const newRcoords = ReadableCoords.fromMarcherPage(marcherPage);
            setRCoords(newRcoords);
        }
    }, [selectedMarchers, marcherPages, selectedPage, fieldProperties]);

    const resetForm = useCallback(() => {
        coordsFormRef.current?.reset();

        if (rCoords) {
            if (xInputRef.current)
                xInputRef.current.value = rCoords.xSteps.toString();
            if (xDescriptionRef.current)
                xDescriptionRef.current.value = rCoords.xDescription;
            if (xCheckpointRef.current)
                xCheckpointRef.current.value =
                    rCoords.xCheckpoint.terseName || rCoords.xCheckpoint.name;
            if (fieldSideRef.current)
                fieldSideRef.current.value = rCoords.side.toString();
            if (yInputRef.current)
                yInputRef.current.value = rCoords.ySteps.toString();
            if (yDescriptionRef.current)
                yDescriptionRef.current.value = rCoords.yDescription;
            if (yCheckpointRef.current)
                yCheckpointRef.current.value =
                    rCoords.yCheckpoint.terseName || rCoords.yCheckpoint.name;
        }

        detailsFormRef.current?.reset();
    }, [rCoords]);

    // Reset the form when the selected page changes so the values are correct
    useEffect(() => {
        resetForm();
    }, [selectedMarchers, rCoords, resetForm]);

    return (
        <>
            {selectedMarchers.length > 0 && (
                <div>
                    {selectedMarchers.length > 1 ? (
                        // Multiple marchers selected
                        <div>
                            <h3 className="pl-4 py-2 text-xl border-0 border-solid border-y-2 border-y-gray-500 bg-gray-700 mt-0">
                                Marchers {`(${selectedMarchers.length})`}
                            </h3>
                            <div className="ml-2">
                                <h4>Selected</h4>
                                <p>
                                    {selectedMarchers
                                        .map((marcher) => marcher.drill_number)
                                        .join(", ")}
                                </p>
                                {selectedMarchers.length >= 3 && (
                                    <RegisteredActionButton
                                        className="btn-secondary"
                                        registeredAction={
                                            RegisteredActionsObjects.cursorModeLine
                                        }
                                    >
                                        Create Line
                                    </RegisteredActionButton>
                                )}
                            </div>
                        </div>
                    ) : (
                        // One marcher selected
                        <div>
                            <h3 className="pl-4 py-2 text-xl border-0 border-solid border-y-2 border-y-gray-500 bg-gray-700 mt-0">
                                Marcher {selectedMarchers[0].drill_number}
                            </h3>
                            <div className="ml-2">
                                <h4>Coordinates</h4>
                                {!rCoords ? (
                                    <p>Error loading coordinates</p>
                                ) : (
                                    <form
                                        className="coords-editor edit-group"
                                        ref={coordsFormRef}
                                        onSubmit={handleCoordsSubmit}
                                    >
                                        <label htmlFor="xInput">X</label>
                                        <div className="input-group">
                                            {/* Maybe on change of all of the variables updating, but only when clicking off for the steps */}
                                            <input
                                                className="bg-transparent text-inherit w-12 border-none"
                                                disabled={true}
                                                type="number"
                                                defaultValue={rCoords?.xSteps}
                                                ref={xInputRef}
                                            />
                                            <select
                                                className="bg-transparent text-inherit border-none"
                                                disabled={true}
                                                value={rCoords.xDescription}
                                                ref={xDescriptionRef}
                                            >
                                                {Object.values(
                                                    X_DESCRIPTION
                                                ).map((xDescription) => (
                                                    <option
                                                        value={xDescription}
                                                        key={xDescription}
                                                    >
                                                        {xDescription}
                                                    </option>
                                                ))}
                                            </select>
                                            <select
                                                className="bg-transparent text-inherit border-none"
                                                disabled={true}
                                                ref={xCheckpointRef}
                                                defaultValue={
                                                    rCoords.xCheckpoint
                                                        .terseName ||
                                                    rCoords.xCheckpoint.name
                                                }
                                            >
                                                {fieldProperties!.xCheckpoints.map(
                                                    (xCheckpoint) => (
                                                        <option
                                                            value={
                                                                xCheckpoint.terseName
                                                            }
                                                            key={
                                                                xCheckpoint.stepsFromCenterFront
                                                            }
                                                        >
                                                            {
                                                                xCheckpoint.terseName
                                                            }
                                                        </option>
                                                    )
                                                )}
                                            </select>
                                            <select
                                                disabled={true}
                                                className="bg-transparent text-inherit border-none"
                                                ref={fieldSideRef}
                                                defaultValue={rCoords.side}
                                            >
                                                <option value="1">S1</option>
                                                <option value="2">S2</option>
                                            </select>
                                        </div>
                                        <label htmlFor="yInput">Y</label>
                                        <div className="input-group">
                                            <input
                                                className="bg-transparent text-inherit border-none w-12"
                                                disabled={true}
                                                type="number"
                                                value={rCoords?.ySteps}
                                                ref={yInputRef}
                                            />
                                            <select
                                                className="bg-transparent text-inherit border-none"
                                                disabled={true}
                                                value={rCoords.yDescription}
                                                ref={yDescriptionRef}
                                            >
                                                {Object.values(
                                                    Y_DESCRIPTION
                                                ).map((yDescription) => (
                                                    <option
                                                        value={yDescription}
                                                        key={yDescription}
                                                    >
                                                        {yDescription}
                                                    </option>
                                                ))}
                                            </select>
                                            <select
                                                className="bg-transparent text-inherit border-none"
                                                disabled={true}
                                                ref={yCheckpointRef}
                                                defaultValue={
                                                    rCoords.yCheckpoint
                                                        .terseName ||
                                                    rCoords.yCheckpoint.name
                                                }
                                            >
                                                {fieldProperties?.yCheckpoints.map(
                                                    (yCheckpoint) => (
                                                        <option
                                                            value={
                                                                yCheckpoint.terseName
                                                            }
                                                            key={
                                                                yCheckpoint.stepsFromCenterFront
                                                            }
                                                        >
                                                            {
                                                                yCheckpoint.terseName
                                                            }
                                                        </option>
                                                    )
                                                )}
                                            </select>
                                        </div>
                                        {/* This is here so the form submits when enter is pressed */}
                                        <button
                                            type="submit"
                                            style={{ display: "none" }}
                                        >
                                            Submit
                                        </button>
                                    </form>
                                )}
                                <h4>Details</h4>
                                <form
                                    className="marcher-details-editor edit-group"
                                    ref={detailsFormRef}
                                >
                                    <div className="input-group">
                                        <label htmlFor="name-input">Name</label>
                                        <input
                                            className="bg-transparent text-inherit border-none text-right"
                                            type="text"
                                            value={
                                                selectedMarchers[0].name
                                                    .length < 1 ||
                                                selectedMarchers[0].name === " "
                                                    ? "-"
                                                    : selectedMarchers[0].name
                                            }
                                            disabled={true}
                                            id="name-input"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label htmlFor="section-input">
                                            Section
                                        </label>
                                        <input
                                            className="bg-transparent text-inherit border-none text-right"
                                            type="text"
                                            value={selectedMarchers[0].section}
                                            disabled={true}
                                            id="section-input"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label htmlFor="drill-number-input">
                                            Drill Number
                                        </label>
                                        <input
                                            className="bg-transparent text-inherit border-none text-right"
                                            type="text"
                                            value={
                                                selectedMarchers[0].drill_number
                                            }
                                            disabled={true}
                                            id="drill-number-input"
                                        />
                                    </div>
                                    {/* This is here so the form submits when enter is pressed */}
                                    <button
                                        type="submit"
                                        style={{ display: "none" }}
                                    >
                                        Submit
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

export default MarcherEditor;
