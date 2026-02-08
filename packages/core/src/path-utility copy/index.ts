// Interfaces
export type {
    IPath,
    Point,
    SegmentJsonData,
    GlobalControlPoint,
    ControlPoint,
    ControlPointConfig,
} from "./interfaces";

// Classes
export { Path } from "./Path";
export { Line } from "./segments/Line";
export { Spline } from "./segments/Spline";
export { catmullrom } from "./segments/utils/CatmullRom";
