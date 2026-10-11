/**
 * Every instrument model by id (docs/3d/instruments.md §3). Sections map
 * to ids in `catalog.ts`; `instrumentModel` builds the pieces at a detail
 * level. Pure: no three.js.
 */
import { batteryModel } from "./battery";
import { brassModel } from "./brass";
import { guardModel } from "./guard";
import type {
    BatteryModelId,
    BrassModelId,
    Detail,
    GuardModelId,
    InstrumentModel,
    ModelId,
    ModelOptions,
    WoodwindModelId,
} from "./model";
import { woodwindModel } from "./woodwinds";

export type { Detail, InstrumentModel, ModelId, ModelOptions } from "./model";

const BRASS: ReadonlySet<string> = new Set<BrassModelId>([
    "trumpet",
    "mellophone",
    "baritone",
    "euphonium",
    "trombone",
    "bassTrombone",
    "contra",
]);
const WOODWINDS: ReadonlySet<string> = new Set<WoodwindModelId>([
    "piccolo",
    "flute",
    "clarinet",
    "bassClarinet",
    "sopranoSax",
    "altoSax",
    "tenorSax",
    "bariSax",
]);
const BATTERY: ReadonlySet<string> = new Set<BatteryModelId>([
    "snare",
    "tenors",
    "bass",
    "cymbals",
]);
const GUARD: ReadonlySet<string> = new Set<GuardModelId>([
    "flag6",
    "swingFlag",
    "doubleSwingFlag",
    "rifle",
    "sabre",
]);

/** The model for `id`. A model that isn't built yet has no pieces and draws nothing. */
export function instrumentModel(
    id: ModelId,
    detail: Detail = "high",
    options: ModelOptions = {},
): InstrumentModel {
    if (BRASS.has(id)) return brassModel(id as BrassModelId, detail);
    if (WOODWINDS.has(id))
        return woodwindModel(id as WoodwindModelId, detail, options);
    if (BATTERY.has(id))
        return batteryModel(id as BatteryModelId, detail, options);
    if (GUARD.has(id)) return guardModel(id as GuardModelId, detail, options);
    return { id, pieces: [], leftGrip: [0, 0, 0], mouthpiece: [0, 0, 0] };
}
