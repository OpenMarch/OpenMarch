import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useQuery } from "@tanstack/react-query";
import {
    propPagesByPageQueryOptions,
    allPropsQueryOptions,
} from "@/hooks/queries";
import { useEffect, useRef } from "react";
import PropManager from "@/global/classes/canvasObjects/Prop";

export default function usePropRenderer({
    selectedPageId,
    canvas,
}: {
    selectedPageId: number;
    canvas: OpenMarchCanvas | null;
}) {
    const { data: props, isSuccess: propsLoaded } = useQuery(
        allPropsQueryOptions(),
    );
    const { data: propPagesOnSelectedPage, isSuccess: propPagesLoaded } =
        useQuery(propPagesByPageQueryOptions(selectedPageId));

    const propManagersByPropId = useRef<Record<number, PropManager>>({});

    useEffect(() => {
        if (propsLoaded && propPagesLoaded && canvas) {
            for (const propObj of props) {
                const currentPropManager =
                    propManagersByPropId.current[propObj.id];

                const propPageCurrent = propPagesOnSelectedPage?.find(
                    (propPage) => propPage.prop_id === propObj.id,
                );
                if (!propPageCurrent) {
                    console.warn(`prop page not found for prop ${propObj.id}`);
                    continue;
                }

                if (currentPropManager) {
                    if (
                        currentPropManager.propPageCurrent.page_id !==
                        selectedPageId
                    ) {
                        // The prop manager is on a different page, so we need to update it to the current page
                        currentPropManager.updatePropPageCurrent(
                            propPageCurrent,
                        );
                    }
                } else {
                    // The prop manager has not been created yet, so we need to create it
                    const propManager = new PropManager({
                        propObj,
                        propPageCurrent,
                        canvas,
                    });
                    propManagersByPropId.current[propObj.id] = propManager;
                }
            }
        }
    }, [
        propsLoaded,
        propPagesLoaded,
        props,
        propPagesOnSelectedPage,
        canvas,
        selectedPageId,
    ]);
}
