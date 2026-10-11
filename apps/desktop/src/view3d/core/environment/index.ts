/**
 * Shared 3D View environment (P2.2). Framework-free: three.js only, no React,
 * R3F, drei, Electron or database imports (ADR 0002 D-1). Meters (D-2).
 *
 * Exports, for the kit builders (P2.3 to P2.5) and the scene (P3.1):
 *
 * - `createEnvironment({ quality, focus })` -> `Environment`: the sky dome,
 *   hemisphere light, shadow-casting sun and fog. The scene adds `env.root`,
 *   sets `scene.fog = env.fog` and, after `env.setLighting(preset, focus)`,
 *   `renderer.toneMappingExposure = env.exposure`. The camera's far plane must
 *   exceed `SKY_RADIUS` (1524 m).
 * - `lightingValues(preset)` -> `LightingValues`: every preset's numbers.
 *   `values.kit` holds what kits drive themselves: `lampsOn` and `lampScale`
 *   for poles, `barEmissive`, `roofSpotIntensity` and `roofOpen` for the pro
 *   roof, `panelEmissive`, `overheadIntensity` and `showSpotIntensity` for the
 *   gym. A kit's `setLighting(preset)` reads these.
 * - `createSharedMaterials()` -> `SharedMaterials`: `unitBox`, `concrete`,
 *   `bench`, `metal`, `seat`, `glass` and `std(color, params)`. Make one per
 *   kit build and dispose it in the kit's `dispose()`.
 * - `lightPole(height, lookAt, shared)` -> `{ object, setOn(on, k), dispose }`.
 *   Place `object` at the pole's base; `lookAt` is relative to the base.
 * - `videoBoard(w, h, legHeight, title, sub, shared)` -> `{ object, setTexture,
 *   dispose }`, facing +Z.
 * - `buildCrowd(seatRows, { density, palette, aisleEvery, quality })` ->
 *   `{ mesh, count, clearAround(point, radius), reset(), visibleCount(),
 *   dispose }`: one `InstancedMesh`. `defaultCrowdPalette(params)` builds
 *   the palette from `VenueParams` colors. Point and radius share the frame
 *   of the seat rows (kit-root space).
 * - Textures: `boardTexture`, `ribbonTexture(text)`, `paintCanvasTexture`.
 *   Tests call `setTexturePainting(false)` because jsdom has no 2D context.
 * - `ft()` and `FT`, and `createRng(seed)`.
 */
export * from "./units";
export * from "./random";
export * from "./lighting";
export * from "./sky";
export * from "./envMap";
export * from "./rig";
export * from "./materials";
export * from "./textures";
export * from "./lightPole";
export * from "./videoBoard";
export * from "./crowd";
