import { createContext } from "react";

/**
 * Whether the timeline's pane has a height of its own (the splitter set one, or is dragging), so
 * the surface may stretch to fill it. A fitted pane takes its height from the surface, so
 * stretching the surface to the pane's height would hold a stale, taller height forever.
 */
export const TimelinePaneStretchContext = createContext(false);
