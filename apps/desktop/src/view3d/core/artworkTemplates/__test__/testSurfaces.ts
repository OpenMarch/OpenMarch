import { catalogEntries } from "../../sizes/catalog";
import { lengthOf } from "../../sizes/units";
import {
    DPI_GUIDE,
    FLOOR_PRINT_MASTER_NOTE,
    silkShapeSurfaces,
    silkSurface,
    type TemplateSurface,
} from "../surfaces";

/**
 * Surfaces the writers still handle though only silks are made today
 * (fork #973): a floor, the largest floor and a sublimated panel, written
 * out here so the writers' floor and sublimation paths stay tested.
 */
const floor = (id: string, w: number, d: number): TemplateSurface => ({
    id,
    kind: "baseFloor",
    name: `Base floor, ${w} x ${d} ft`,
    width: lengthOf(w, "ft"),
    height: lengthOf(d, "ft"),
    unit: "in",
    dpi: DPI_GUIDE.floor,
    process: "floor",
    cut: "rectangle",
    orientation: "audienceBottom",
    notes: [FLOOR_PRINT_MASTER_NOTE],
});

export const FLOOR_60X90 = floor("base-floor-60x90ft", 90, 60);
export const FLOOR_78X106 = floor("base-floor-78x106ft", 106, 78);

/** A sublimated panel, 464 x 568 mm. */
export const PANEL: TemplateSurface = {
    id: "panel-front",
    kind: "uniformFront",
    name: "Panel, front",
    width: lengthOf(464, "mm"),
    height: lengthOf(568, "mm"),
    unit: "mm",
    dpi: DPI_GUIDE.standard,
    process: "sublimation",
    cut: "rectangle",
    orientation: "upTop",
    notes: [],
};

/** Every catalog silk's template, then every picker shape's. */
export const SILK_SURFACES: TemplateSurface[] = [
    ...catalogEntries("silk").map((entry) => silkSurface(entry)),
    ...silkShapeSurfaces(),
];

export const TEST_SURFACES: TemplateSurface[] = [
    ...SILK_SURFACES,
    FLOOR_60X90,
    FLOOR_78X106,
    PANEL,
];

/** A test surface by id: a catalog silk's, or one of the stand-ins. */
export function templateSurface(id: string): TemplateSurface | undefined {
    return TEST_SURFACES.find((s) => s.id === id);
}
