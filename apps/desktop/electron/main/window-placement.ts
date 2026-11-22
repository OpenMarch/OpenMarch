// Pure, no electron imports, so Vitest can load it.
//
// Where the editor and the 3D View open: on the display chosen in Settings, or where each was
// left (its display, size, and whether it was maximized or full screen). Electron glue is in
// window-state.ts.
import type { Rectangle } from "./settings-window-bounds";
import {
    OPEN_ON_LAST,
    type DisplayListing,
} from "../../src/settings/windowPlacementSettings";

export interface DisplayArea {
    id: number;
    /** The display minus the taskbar, dock and menu bar */
    workArea: Rectangle;
}

/** What's saved when a window moves, resizes or closes */
export interface SavedWindowState {
    /** Its size and position when not maximized or full screen */
    bounds: Rectangle;
    maximized: boolean;
    fullScreen: boolean;
    /** The display it was on, which normal bounds alone can miss for a maximized window */
    displayId?: number;
}

export interface Placement {
    bounds: Rectangle;
    maximized: boolean;
    fullScreen: boolean;
}

export interface WindowDefaults {
    /** Size on a display it has never been on */
    size: (workArea: Rectangle) => { width: number; height: number };
    /** Whether it opens maximized the first time */
    maximized: boolean;
    min: { width: number; height: number };
}

/** Beyond any real desktop; a saved value past it is corrupt (X11 caps windows at 32767 px) */
const MAX_COORDINATE = 100_000;

const isNumber = (value: unknown): value is number =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_COORDINATE;

function isRectangle(value: unknown): value is Rectangle {
    if (!value || typeof value !== "object") return false;
    const r = value as Record<string, unknown>;
    return (
        isNumber(r.x) &&
        isNumber(r.y) &&
        isNumber(r.width) &&
        isNumber(r.height) &&
        r.width > 0 &&
        r.height > 0
    );
}

/** A saved state from the settings file, or undefined if it's missing or malformed */
export function parseSavedWindowState(
    value: unknown,
): SavedWindowState | undefined {
    if (!value || typeof value !== "object") return undefined;
    const v = value as Record<string, unknown>;
    if (!isRectangle(v.bounds)) return undefined;
    return {
        bounds: v.bounds,
        maximized: v.maximized === true,
        fullScreen: v.fullScreen === true,
        displayId: isNumber(v.displayId) ? v.displayId : undefined,
    };
}

function overlapArea(a: Rectangle, b: Rectangle) {
    const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const height =
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return width > 0 && height > 0 ? width * height : 0;
}

/** The display most of the bounds are on, if enough of them (a 100×40 grab area) is on one */
export function displayContaining(
    bounds: Rectangle,
    displays: DisplayArea[],
): DisplayArea | undefined {
    let best: DisplayArea | undefined;
    let bestArea = 100 * 40;
    for (const display of displays) {
        const area = overlapArea(bounds, display.workArea);
        if (area >= bestArea) {
            best = display;
            bestArea = area;
        }
    }
    return best;
}

/** A size that fits the work area, centered in it */
function centeredIn(
    workArea: Rectangle,
    size: { width: number; height: number },
    min: { width: number; height: number },
): Rectangle {
    const width = Math.min(Math.max(size.width, min.width), workArea.width);
    const height = Math.min(Math.max(size.height, min.height), workArea.height);
    return {
        x: Math.round(workArea.x + (workArea.width - width) / 2),
        y: Math.round(workArea.y + (workArea.height - height) / 2),
        width,
        height,
    };
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

/** The bounds, no bigger than the work area (nor smaller than the minimum) and moved inside it */
function keptWithin(
    workArea: Rectangle,
    bounds: Rectangle,
    min: { width: number; height: number },
): Rectangle {
    const width = Math.min(Math.max(bounds.width, min.width), workArea.width);
    const height = Math.min(
        Math.max(bounds.height, min.height),
        workArea.height,
    );
    return {
        x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - width),
        y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - height),
        width,
        height,
    };
}

/**
 * Where a window opens.
 *
 * - With a display chosen (`openOn` is its id) and connected, it opens there. If it was last on
 *   that display it comes back as it was (kept within the display); otherwise it keeps its size
 *   (shrunk to fit) and is centered there.
 * - Otherwise (`"last"`, or the chosen display isn't connected) it comes back where it was left,
 *   if that display is still connected.
 * - Failing that, it opens on the main display.
 *
 * It stays maximized or full screen if it was.
 */
export function resolvePlacement({
    saved,
    openOn,
    displays,
    primary,
    defaults,
}: {
    saved: SavedWindowState | undefined;
    openOn: unknown;
    displays: DisplayArea[];
    primary: DisplayArea;
    defaults: WindowDefaults;
}): Placement {
    const chosen =
        typeof openOn === "string" && openOn !== OPEN_ON_LAST
            ? displays.find((d) => String(d.id) === openOn)
            : undefined;

    const onBounds = saved && displayContaining(saved.bounds, displays);
    const onId =
        saved?.displayId !== undefined
            ? displays.find((d) => d.id === saved.displayId)
            : undefined;
    // The display it was last on, if that's still connected. Normal bounds say it, unless the
    // window was maximized or full screen, when they can be left on another display.
    const lastDisplay =
        saved?.maximized || saved?.fullScreen
            ? (onId ?? onBounds)
            : (onBounds ?? onId);

    const target = chosen ?? lastDisplay ?? primary;

    if (!saved) {
        return {
            bounds: centeredIn(
                target.workArea,
                defaults.size(target.workArea),
                defaults.min,
            ),
            maximized: defaults.maximized,
            fullScreen: false,
        };
    }

    // Back where it was left, as it was, but kept within that display: its resolution may have
    // dropped since, and a title bar above the screen couldn't be grabbed
    if (onBounds && onBounds.id === target.id) {
        return {
            bounds: keptWithin(onBounds.workArea, saved.bounds, defaults.min),
            maximized: saved.maximized,
            fullScreen: saved.fullScreen,
        };
    }

    // On another display: its size, centered there
    return {
        bounds: centeredIn(target.workArea, saved.bounds, defaults.min),
        maximized: saved.maximized,
        fullScreen: saved.fullScreen,
    };
}

/** Displays for the "Open on" menus, numbered left to right */
export function listDisplays(
    displays: {
        id: number;
        label?: string;
        bounds: Rectangle;
        scaleFactor?: number;
    }[],
    primaryId: number,
): DisplayListing[] {
    return [...displays]
        .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
        .map((d, index) => ({
            id: d.id,
            label: (d.label ?? "").trim(),
            width: Math.round(d.bounds.width * (d.scaleFactor ?? 1)),
            height: Math.round(d.bounds.height * (d.scaleFactor ?? 1)),
            primary: d.id === primaryId,
            number: index + 1,
        }));
}
