import { useCallback, useEffect, useRef, useState } from "react";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import { SidebarCollapsible } from "@/components/sidebar/SidebarCollapsible";
import RegisteredActionButton from "../RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import { Button, Input } from "@openmarch/ui";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerCompact,
} from "@openmarch/ui";
import { useShapePageStore } from "@/stores/ShapePageStore";
import type { ShapePageMarcher } from "electron/database/tables/ShapePageMarcherTable";
import { MinMaxStepSizes, StepSize } from "@/global/classes/StepSize";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";

function RotationHandle({
    value,
    onChange,
    onDragStart,
    onDragEnd,
}: {
    value: number;
    onChange: (value: number) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}) {
    const handleRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startY, setStartY] = useState(0);
    const [startValue, setStartValue] = useState(0);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            setIsDragging(true);
            setStartY(e.clientY);
            setStartValue(value);
            onDragStart?.();

            // Add global mouse event listeners
            const handleMouseMove = (e: MouseEvent) => {
                if (!isDragging) return;

                const deltaY = startY - e.clientY;
                // Convert pixel movement to degrees (adjust sensitivity as needed)
                const degreesPerPixel = 0.5;
                const newValue = startValue + deltaY * degreesPerPixel;

                // Normalize to -180 to 180 degrees
                const normalizedValue =
                    ((((newValue + 180) % 360) + 360) % 360) - 180;

                // Update the value and trigger rotation
                onChange(normalizedValue);

                // Force a re-render of the handle's rotation
                if (handleRef.current) {
                    handleRef.current.style.transform = `rotate(${normalizedValue}deg)`;
                }
            };

            const handleMouseUp = () => {
                setIsDragging(false);
                onDragEnd?.();
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        },
        [
            isDragging,
            startY,
            startValue,
            value,
            onChange,
            onDragStart,
            onDragEnd,
        ],
    );

    // Update the handle's rotation when value changes
    useEffect(() => {
        if (handleRef.current) {
            handleRef.current.style.transform = `rotate(${value}deg)`;
        }
    }, [value]);

    return (
        <div
            ref={handleRef}
            className={`flex h-8 w-8 cursor-grab items-center justify-center rounded-full active:cursor-grabbing ${isDragging ? "bg-primary/10" : "hover:bg-primary/5"}`}
            onMouseDown={handleMouseDown}
        >
            <ArrowsClockwiseIcon
                className="text-text/80 h-4 w-4"
                weight="regular"
            />
        </div>
    );
}

function MarcherEditor() {
    const { selectedMarchers } = useSelectedMarchers()!;
    const [rCoords, setRCoords] = useState<ReadableCoords>();
    const [stepSize, setStepSize] = useState<StepSize>();
    const [minMaxStepSize, setMinMaxStepSize] = useState<MinMaxStepSizes>();
    const { marcherPages } = useMarcherPageStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { fieldProperties } = useFieldProperties()!;
    const { shapePages } = useShapePageStore()!;
    const [spmsForThisPage, setSpmsForThisPage] = useState<ShapePageMarcher[]>(
        [],
    );
    const [rotationAngle, setRotationAngle] = useState<number>(0);
    const [isRotating, setIsRotating] = useState(false);

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
        const shapePageIds = new Set<number>();
        for (const shapePage of shapePages) {
            if (shapePage.page_id === selectedPage?.id) {
                shapePageIds.add(shapePage.id);
            }
        }

        window.electron.getShapePageMarchers().then((response) => {
            if (response.success) {
                const spmsForThisPage = response.data.filter((spm) =>
                    shapePageIds.has(spm.shape_page_id),
                );
                setSpmsForThisPage(spmsForThisPage);
            } else {
                console.error(response.error);
            }
        });
    }, [selectedPage, shapePages]);

    const createLineIsVisible = useCallback(() => {
        const marcherIdsWithShapes = new Set<number>(
            spmsForThisPage.map((spm) => spm.marcher_id),
        );
        const selectedMarcherIds = selectedMarchers.map(
            (marcher) => marcher.id,
        );

        return !selectedMarcherIds.some((marcherId) =>
            marcherIdsWithShapes.has(marcherId),
        );
    }, [selectedMarchers, spmsForThisPage]);

    useEffect(() => {
        setRCoords(undefined);
        setStepSize(undefined);
        setMinMaxStepSize(undefined);
        if (!selectedMarchers || !selectedMarchers.length || !fieldProperties)
            return;

        if (selectedMarchers.length > 1) {
            if (selectedPage) {
                setMinMaxStepSize(
                    StepSize.getMinAndMaxStepSizesForMarchers({
                        marchers: selectedMarchers,
                        marcherPages,
                        page: selectedPage,
                        fieldProperties,
                    }),
                );
            }

            return;
        }

        const selectedMarcherPages = marcherPages.filter(
            (marcherPage) => marcherPage.marcher_id === selectedMarchers[0]?.id,
        );
        const selectedMarcherPage = selectedMarcherPages.find(
            (marcherPage) =>
                marcherPage.marcher_id === selectedMarchers[0]?.id &&
                marcherPage.page_id === selectedPage?.id,
        );
        if (selectedMarcherPage) {
            const newRcoords =
                ReadableCoords.fromMarcherPage(selectedMarcherPage);
            setRCoords(newRcoords);

            if (selectedPage) {
                const previousMarcherPage = selectedMarcherPages.find(
                    (previousMarcherPage) =>
                        previousMarcherPage.marcher_id ===
                            selectedMarcherPage.marcher_id &&
                        previousMarcherPage.page_id ===
                            selectedPage?.previousPageId,
                );
                setStepSize(
                    StepSize.createStepSizeForMarcher({
                        startingPage: previousMarcherPage,
                        endingPage: selectedMarcherPage,
                        page: selectedPage,
                        fieldProperties,
                    }),
                );
            }
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
                fieldSideRef.current.value = rCoords.sideDescription;

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

    const handleRotation = useCallback(() => {
        // TODO: Implement rotation logic
        // This will need to:
        // 1. Get the center point of the selected marchers
        // 2. Convert marcherPages to IdPoint format
        // 3. Call the rotate function
        // 4. Update the marcherPages with the new coordinates
        console.log("Rotating to:", rotationAngle.toFixed(1), "degrees");
    }, [selectedMarchers, marcherPages, selectedPage, rotationAngle]);

    const handleRotationStart = useCallback(() => {
        setIsRotating(true);
    }, []);

    const handleRotationEnd = useCallback(() => {
        setIsRotating(false);
    }, []);

    const handleRotationChange = useCallback(
        (newAngle: number) => {
            setRotationAngle(newAngle);
            // Fire rotation immediately for visual feedback
            handleRotation();
        },
        [handleRotation],
    );

    return (
        <>
            {selectedMarchers.length > 0 && fieldProperties && (
                <div>
                    {selectedMarchers.length > 1 ? (
                        // Multiple marchers selected
                        <SidebarCollapsible
                            defaultOpen
                            title={`${selectedMarchers.length} Marchers`}
                            className="mt-12 flex flex-col gap-16"
                        >
                            <p className="text-sub text-text/80 w-full px-6 font-mono">
                                {selectedMarchers
                                    .map((marcher) => marcher.drill_number)
                                    .join(", ")}
                            </p>
                            {minMaxStepSize &&
                                minMaxStepSize.min &&
                                minMaxStepSize.max && (
                                    <div className="w-full px-6">
                                        <div className="">
                                            <p className="w-full leading-none opacity-80">
                                                Smallest step size
                                            </p>
                                        </div>
                                        <div className="mt-6 flex justify-between">
                                            <label className="text-body leading-none opacity-80">
                                                {
                                                    selectedMarchers.find(
                                                        (marcher) =>
                                                            marcher.id ===
                                                            minMaxStepSize.min
                                                                ?.marcher_id,
                                                    )?.drill_number
                                                }
                                            </label>
                                            <p className="text-body leading-none">
                                                {minMaxStepSize.min.displayString()}
                                            </p>
                                        </div>
                                        <div className="mt-12">
                                            <p className="w-full leading-none opacity-80">
                                                Largest step size
                                            </p>
                                        </div>
                                        <div className="flex justify-between pt-6">
                                            <label className="text-body leading-none opacity-80">
                                                {
                                                    selectedMarchers.find(
                                                        (marcher) =>
                                                            marcher.id ===
                                                            minMaxStepSize.max
                                                                ?.marcher_id,
                                                    )?.drill_number
                                                }
                                            </label>
                                            <p className="text-body leading-none">
                                                {minMaxStepSize.max.displayString()}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            {selectedMarchers.length === 2 && (
                                <RegisteredActionButton
                                    registeredAction={
                                        RegisteredActionsObjects.swapMarchers
                                    }
                                >
                                    <Button
                                        size="compact"
                                        className="w-full"
                                        variant="secondary"
                                    >
                                        Swap marchers
                                    </Button>
                                </RegisteredActionButton>
                            )}
                            {selectedMarchers.length >= 3 &&
                                createLineIsVisible() && (
                                    <RegisteredActionButton
                                        className="btn-secondary"
                                        registeredAction={
                                            RegisteredActionsObjects.alignmentEventLine
                                        }
                                    >
                                        <Button
                                            size="compact"
                                            className="w-full"
                                        >
                                            Create Line
                                        </Button>
                                    </RegisteredActionButton>
                                )}
                            {/* Add rotation controls */}
                            <div className="w-full px-6">
                                <div className="flex flex-col gap-8">
                                    <label className="text-body leading-none opacity-80">
                                        Rotation
                                    </label>
                                    <div className="flex items-center gap-4">
                                        <RotationHandle
                                            value={rotationAngle}
                                            onChange={handleRotationChange}
                                            onDragStart={handleRotationStart}
                                            onDragEnd={handleRotationEnd}
                                        />
                                        <Input
                                            type="number"
                                            value={rotationAngle.toFixed(1)}
                                            onChange={(e) =>
                                                handleRotationChange(
                                                    Number(e.target.value),
                                                )
                                            }
                                            className="w-64"
                                            placeholder="0"
                                        />
                                        <span className="text-body">
                                            degrees
                                        </span>
                                        <Button
                                            size="compact"
                                            onClick={handleRotation}
                                            className="ml-auto"
                                            disabled={isRotating}
                                        >
                                            Apply
                                        </Button>
                                    </div>
                                </div>
                            </div>
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
                                    <div className="flex flex-col gap-8">
                                        <label
                                            htmlFor="xInput"
                                            className="text-body mx-6 w-full leading-none opacity-80"
                                        >
                                            X
                                        </label>
                                        <div className="flex w-full flex-wrap gap-4">
                                            {/* Maybe on change of all of the variables updating, but only when clicking off for the steps */}
                                            <span className="w-[4.2rem]">
                                                <Input
                                                    compact
                                                    disabled
                                                    type="number"
                                                    value={rCoords?.xSteps}
                                                    className="disabled:placeholder-text w-full disabled:cursor-auto disabled:opacity-100"
                                                />
                                            </span>
                                            <Select
                                                disabled
                                                value={rCoords.xDescription}
                                            >
                                                <SelectTriggerCompact
                                                    label={rCoords.xDescription}
                                                    className="disabled:cursor-auto disabled:opacity-100"
                                                />
                                                <SelectContent>
                                                    <SelectItem
                                                        value={
                                                            rCoords.xDescription
                                                        }
                                                    >
                                                        {rCoords.xDescription}
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Select
                                                disabled
                                                value={
                                                    rCoords.xCheckpoint
                                                        .terseName ||
                                                    rCoords.xCheckpoint.name
                                                }
                                            >
                                                <SelectTriggerCompact
                                                    label={
                                                        rCoords.xCheckpoint
                                                            .terseName ||
                                                        rCoords.xCheckpoint.name
                                                    }
                                                    className="disabled:cursor-auto disabled:opacity-100"
                                                />
                                                <SelectContent>
                                                    <SelectItem
                                                        value={
                                                            rCoords.xCheckpoint
                                                                .terseName ||
                                                            rCoords.xCheckpoint
                                                                .name
                                                        }
                                                    >
                                                        {rCoords.xCheckpoint
                                                            .terseName ||
                                                            rCoords.xCheckpoint
                                                                .name}
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Select
                                                disabled
                                                value={rCoords.sideDescription}
                                            >
                                                <SelectTriggerCompact
                                                    className="disabled:cursor-auto disabled:opacity-100"
                                                    label={
                                                        rCoords.sideDescription
                                                    }
                                                />
                                                <SelectContent>
                                                    <SelectItem
                                                        value={
                                                            fieldProperties
                                                                .sideDescriptions
                                                                .terseLeft
                                                        }
                                                        key={1}
                                                    >
                                                        {
                                                            fieldProperties
                                                                .sideDescriptions
                                                                .terseLeft
                                                        }
                                                    </SelectItem>
                                                    <SelectItem
                                                        value={
                                                            fieldProperties
                                                                .sideDescriptions
                                                                .terseRight
                                                        }
                                                        key={2}
                                                    >
                                                        {
                                                            fieldProperties
                                                                .sideDescriptions
                                                                .terseRight
                                                        }
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-8">
                                        <label
                                            htmlFor="yInput"
                                            className="text-body mx-6 w-full leading-none opacity-80"
                                        >
                                            Y
                                        </label>
                                        <div className="flex w-full flex-wrap gap-4">
                                            <span className="w-[4.2rem]">
                                                <Input
                                                    compact
                                                    disabled
                                                    type="number"
                                                    value={rCoords?.ySteps}
                                                    className="disabled:placeholder-text w-full disabled:cursor-auto disabled:opacity-100"
                                                />
                                            </span>
                                            <Select
                                                disabled
                                                value={rCoords.yDescription}
                                            >
                                                <SelectTriggerCompact
                                                    label={rCoords.yDescription}
                                                    className="disabled:cursor-auto disabled:opacity-100"
                                                />
                                                <SelectContent>
                                                    <SelectItem
                                                        value={
                                                            rCoords.yDescription
                                                        }
                                                    >
                                                        {rCoords.yDescription}
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Select
                                                disabled
                                                value={
                                                    rCoords.yCheckpoint
                                                        .terseName ||
                                                    rCoords.yCheckpoint.name
                                                }
                                            >
                                                <SelectTriggerCompact
                                                    label={
                                                        rCoords.yCheckpoint
                                                            .terseName ||
                                                        rCoords.yCheckpoint.name
                                                    }
                                                    className="disabled:cursor-auto disabled:opacity-100"
                                                />
                                                <SelectContent>
                                                    <SelectItem
                                                        value={
                                                            rCoords.yCheckpoint
                                                                .terseName ||
                                                            rCoords.yCheckpoint
                                                                .name
                                                        }
                                                    >
                                                        {rCoords.yCheckpoint
                                                            .terseName ||
                                                            rCoords.yCheckpoint
                                                                .name}
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    {stepSize !== undefined && (
                                        <div className="flex justify-between px-6">
                                            <label className="text-body leading-none opacity-80">
                                                Step Size
                                            </label>

                                            <p className="text-body bg-transparent leading-none">
                                                {stepSize.displayString()}
                                            </p>
                                        </div>
                                    )}
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
                                <div className="flex items-center justify-between px-6">
                                    <label
                                        htmlFor="name-input"
                                        className="text-body leading-none opacity-80"
                                    >
                                        Name
                                    </label>

                                    <span className="w-[7rem]">
                                        <Input
                                            compact
                                            disabled
                                            value={
                                                selectedMarchers[0].name ===
                                                    null ||
                                                selectedMarchers[0].name ===
                                                    " " ||
                                                selectedMarchers[0].name
                                                    .length < 1
                                                    ? "-"
                                                    : selectedMarchers[0].name
                                            }
                                            className="disabled:placeholder-text w-full disabled:cursor-auto disabled:opacity-100"
                                        />
                                    </span>
                                </div>
                                <div className="flex items-center justify-between px-6">
                                    <label
                                        htmlFor="section-input"
                                        className="text-body leading-none opacity-80"
                                    >
                                        Section
                                    </label>
                                    <span className="w-[7rem]">
                                        <Input
                                            compact
                                            disabled
                                            value={selectedMarchers[0].section}
                                            className="disabled:placeholder-text w-full disabled:cursor-auto disabled:opacity-100"
                                        />
                                    </span>
                                </div>
                                <div className="flex items-center justify-between px-6">
                                    <label
                                        htmlFor="drill-number-input"
                                        className="text-body leading-none opacity-80"
                                    >
                                        Drill Number
                                    </label>
                                    <span className="w-[7rem]">
                                        <Input
                                            compact
                                            disabled
                                            value={
                                                selectedMarchers[0].drill_number
                                            }
                                            className="disabled:placeholder-text w-full disabled:cursor-auto disabled:opacity-100"
                                        />
                                    </span>
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
