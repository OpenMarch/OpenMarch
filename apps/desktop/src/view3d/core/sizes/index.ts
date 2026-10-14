/**
 * Real units and the size catalog (docs/3d/props-spec.md §3, ADR 0002 D-9 and
 * D-16): the one platform-free module every customization package uses for
 * sizes. Safe to import from the renderer and from main.
 */
export * from "./units";
export * from "./catalog";
export * from "./checks";
export * from "./presets";
export * from "./artwork";
export * from "./silkCuts";
export * from "./cutGeometry";
