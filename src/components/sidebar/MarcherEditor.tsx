import { useCallback, useEffect, useRef, useState } from "react";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import { SidebarCollapsible } from "@/components/sidebar/SidebarCollapsible";
import RegisteredActionButton from "../RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import { Button } from "../ui/Button";

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
                marcherPage.page_id === selectedPage?.id,
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
                        <SidebarCollapsible
                            defaultOpen
                            title={`Marchers (${selectedMarchers.length})`}
                            className="mt-12 flex flex-col gap-16"
                        >
                            <p className="w-full px-6">
                                {selectedMarchers
                                    .map((marcher) => marcher.drill_number)
                                    .join(", ")}
                            </p>
                            {selectedMarchers.length >= 3 && (
                                <RegisteredActionButton
                                    className="btn-secondary"
                                    registeredAction={
                                        RegisteredActionsObjects.alignmentEventLine
                                    }
                                >
                                    <Button size="compact" className="w-full">
                                        Create Line
                                    </Button>
                                </RegisteredActionButton>
                            )}
                        </SidebarCollapsible>
                    ) : (
                        // One marcher selected
                        <SidebarCollapsible
                            defaultOpen
                            title={`Marcher ${selectedMarchers[0].drill_number}`}
                            className="mt-12 flex flex-col gap-24"
                        >
                            {!rCoords ? (
                                <p className="text-body text-red">
                                    Error loading coordinates
                                </p>
                            ) : (
                                <form
                                    className="coords-editor edit-group flex flex-col gap-24"
                                    ref={coordsFormRef}
                                    onSubmit={handleCoordsSubmit}
                                >
                                    <div className="flex justify-between px-6">
                                        <label
                                            htmlFor="xInput"
                                            className="w-full text-body leading-none opacity-80"
                                        >
                                            X
                                        </label>
                                        <div className="flex w-full justify-end gap-4">
                                            {/* Maybe on change of all of the variables updating, but only when clicking off for the steps */}
                                            <p className="bg-transparent text-body leading-none">
                                                {rCoords?.xSteps}
                                            </p>
                                            <p className="bg-transparent text-body leading-none">
                                                {rCoords?.xDescription}
                                            </p>
                                            <p className="bg-transparent text-body leading-none">
                                                {rCoords.xCheckpoint
                                                    .terseName ||
                                                    rCoords.xCheckpoint.name}
                                            </p>
                                            <p className="bg-transparent text-body leading-none">
                                                S{rCoords.side}
                                            </p>
                                            {/*
                                                <input
                                                    className="bg-transparent text-body leading-none"
                                                    disabled={true}
                                                    type="number"
                                                    defaultValue={rCoords?.xSteps}
                                                    ref={xInputRef}
                                                />
                                                <select
                                                    className="bg-transparent text-body leading-none disabled:opacity-100"
                                                    disabled={true}
                                                    value={rCoords.xDescription}
                                                    ref={xDescriptionRef}
                                                >
                                                    {Object.values(
                                                        X_DESCRIPTION,
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
                                                    className="bg-transparent text-body leading-none disabled:opacity-100"
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
                                                        ),
                                                    )}
                                                </select>
                                                <select
                                                    disabled={true}
                                                    className="bg-transparent text-body leading-none disabled:opacity-100"
                                                    ref={fieldSideRef}
                                                    defaultValue={rCoords.side}
                                                >
                                                    <option value="1">S1</option>
                                                    <option value="2">S2</option>
                                                </select>
                                                */}
                                        </div>
                                    </div>
                                    <div className="flex justify-between px-6">
                                        <label
                                            htmlFor="yInput"
                                            className="text-body leading-none opacity-80"
                                        >
                                            Y
                                        </label>
                                        <div className="flex justify-end gap-4">
                                            <p className="bg-transparent text-body leading-none">
                                                {rCoords?.ySteps}
                                            </p>
                                            <p className="bg-transparent text-body leading-none">
                                                {rCoords?.yDescription}
                                            </p>
                                            <p className="bg-transparent text-body leading-none">
                                                {rCoords.yCheckpoint
                                                    .terseName ||
                                                    rCoords.yCheckpoint.name}
                                            </p>
                                            {/*
                                                <input
                                                    className="bg-transparent text-body leading-none disabled:opacity-100"
                                                    disabled={true}
                                                    type="number"
                                                    value={rCoords?.ySteps}
                                                    ref={yInputRef}
                                                />
                                                <select
                                                    className="bg-transparent text-body leading-none disabled:opacity-100"
                                                    disabled={true}
                                                    value={rCoords.yDescription}
                                                    ref={yDescriptionRef}
                                                >
                                                    {Object.values(
                                                        Y_DESCRIPTION,
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
                                                    className="bg-transparent text-body leading-none disabled:opacity-100"
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
                                                        ),
                                                    )}
                                                </select> */}
                                        </div>
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
                            <form
                                className="marcher-details-editor flex flex-col gap-24"
                                ref={detailsFormRef}
                            >
                                <div className="flex justify-between px-6">
                                    <label
                                        htmlFor="name-input"
                                        className="text-body leading-none opacity-80"
                                    >
                                        Name
                                    </label>

                                    <p className="bg-transparent text-body leading-none">
                                        {selectedMarchers[0].name === null ||
                                        selectedMarchers[0].name === " " ||
                                        selectedMarchers[0].name.length < 1
                                            ? "-"
                                            : selectedMarchers[0].name}
                                    </p>
                                    {/*
                                        <input
                                            className="text-inherit border-none bg-transparent text-right"
                                            type="text"
                                            value={
                                                selectedMarchers[0].name.length <
                                                    1 ||
                                                selectedMarchers[0].name === " "
                                                    ? "-"
                                                    : selectedMarchers[0].name
                                            }
                                            disabled={true}
                                            id="name-input"
                                        />
                                        */}
                                </div>
                                <div className="flex justify-between px-6">
                                    <label
                                        htmlFor="section-input"
                                        className="text-body leading-none opacity-80"
                                    >
                                        Section
                                    </label>
                                    <p className="bg-transparent text-body leading-none">
                                        {selectedMarchers[0].section}
                                    </p>
                                    {/*<input
                                        className="text-inherit border-none bg-transparent text-right"
                                        type="text"
                                        value={selectedMarchers[0].section}
                                        disabled={true}
                                        id="section-input"
                                    /> */}
                                </div>
                                <div className="flex justify-between px-6">
                                    <label
                                        htmlFor="drill-number-input"
                                        className="text-body leading-none opacity-80"
                                    >
                                        Drill Number
                                    </label>
                                    <p className="bg-transparent text-body leading-none">
                                        {selectedMarchers[0].drill_number}
                                    </p>
                                    {/*<input
                                        className="text-inherit border-none bg-transparent text-right"
                                        type="text"
                                        value={selectedMarchers[0].drill_number}
                                        disabled={true}
                                        id="drill-number-input"
                                    /> */}
                                </div>
                                {/* This is here so the form submits when enter is pressed */}
                                <button
                                    type="submit"
                                    style={{ display: "none" }}
                                >
                                    Submit
                                </button>
                            </form>
                        </SidebarCollapsible>
                    )}
                </div>
            )}
        </>
    );
}

export default MarcherEditor;
