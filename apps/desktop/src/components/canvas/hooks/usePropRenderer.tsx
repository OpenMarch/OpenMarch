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
    const { data: propPages, isSuccess: propPagesLoaded } = useQuery(
        propPagesByPageQueryOptions(selectedPageId),
    );
    const propManagersByPropId = useRef<Record<number, PropManager>>({});

    useEffect(() => {
        if (propsLoaded && propPagesLoaded && canvas) {
            for (const propObj of props) {
                const currentPropManager =
                    propManagersByPropId.current[propObj.id];
                if (currentPropManager) {
                    console.warn("prop manager updating not yet implemented ");
                } else {
                    const propPageCurrent = propPages?.find(
                        (propPage) => propPage.prop_id === propObj.id,
                    );
                    if (!propPageCurrent) {
                        console.warn(
                            `prop page not found for prop ${propObj.id}`,
                        );
                        continue;
                    }
                    const propManager = new PropManager({
                        propObj,
                        propPageCurrent,
                        canvas,
                    });
                    propManagersByPropId.current[propObj.id] = propManager;
                }
            }
        }
    }, [propsLoaded, propPagesLoaded, props, propPages, canvas]);
}
