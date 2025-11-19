import React, { useMemo } from "react";
import { InspectorCollapsible } from "./InspectorCollapsible";
import { T } from "@tolgee/react";
import { CircleIcon } from "@phosphor-icons/react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import RegisteredActionButton from "../RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import { marcherPagesByPageQueryOptions } from "@/hooks/queries/useMarcherPages";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useQuery } from "@tanstack/react-query";

function ShapeSelector() {
    const { selectedMarchers } = useSelectedMarchers()!;
    const selectedMarcherIds = useMemo(
        () => new Set(selectedMarchers.map((marcher) => marcher.id)),
        [selectedMarchers],
    );
    const { selectedPage } = useSelectedPage()!;
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const editingDisabled = useMemo(() => {
        return (
            !marcherPagesLoaded ||
            Object.values(marcherPages).some(
                (marcherPage) =>
                    marcherPage.isLocked &&
                    selectedMarcherIds.has(marcherPage.marcher_id),
            )
        );
    }, [marcherPagesLoaded, marcherPages, selectedMarcherIds]);

    if (!selectedMarchers.length) return <></>;

    return (
        <InspectorCollapsible
            defaultOpen
            translatableTitle={{
                keyName: "inspector.shapes.title",
                parameters: {},
            }}
            className="mt-12"
        >
            <div className="bg-fg-2 rounded-6 gap-16] flex max-h-[12rem] w-full flex-col overflow-y-auto px-8 py-4">
                <div className="input-group">
                    <label className="text-body text-text/80 mb-8">
                        <T keyName="inspector.shapes.selectShape" />
                    </label>
                    <div className="grid grid-cols-4 gap-8">
                        <RegisteredActionButton
                            className="aspect-square justify-center"
                            disabled={editingDisabled}
                            registeredAction={
                                RegisteredActionsObjects.createCircle
                            }
                        >
                            <CircleIcon size={32} weight="regular" />
                        </RegisteredActionButton>
                    </div>
                    <div className="text-text-subtitle text-xs">
                        <T keyName="inspector.shapes.moreShapesComingSoon" />
                    </div>
                </div>
            </div>
        </InspectorCollapsible>
    );
}

export default ShapeSelector;
