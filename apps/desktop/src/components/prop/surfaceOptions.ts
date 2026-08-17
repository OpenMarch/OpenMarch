import type { SurfaceType } from "@/global/classes/Prop";

/**
 * Surface types offered in the prop forms, with their translation keys.
 *
 * These are the descriptive labels used when picking a surface ("Floor (can
 * march over)"). The short forms shown in the inspector live under
 * `inspector.prop.surfaceType.*`.
 */
export const SURFACE_OPTIONS: { value: SurfaceType; labelKey: string }[] = [
    { value: "floor", labelKey: "props.surfaceOption.floor" },
    { value: "platform", labelKey: "props.surfaceOption.platform" },
    { value: "obstacle", labelKey: "props.surfaceOption.obstacle" },
];
