import {
    FabricObject,
    FabricObjectProps,
    ObjectEvents,
    SerializedObjectProps,
    TPointerEvent,
} from "fabric";

export type EventFabricObject = FabricObject<
    Partial<FabricObjectProps>,
    SerializedObjectProps,
    ObjectEvents
>;

export type FabricEvent = TPointerEvent & {
    selected: EventFabricObject[];
    deselected: EventFabricObject[];
};
