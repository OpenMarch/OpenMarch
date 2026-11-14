import { create } from "zustand";

/**
 * The touch toolbar (tablet plan 2.1, ported from upstream #1060): in the tablet layout the
 * toolbar's tabs sit in the title bar and the selected tab's controls are a panel over the
 * top of the field. Tapping a tab opens its panel, tapping the open tab (or the chevron)
 * closes it. The panel starts closed, and the tab and whether it's open are remembered.
 *
 * The mouse layout doesn't use this: its toolbar always shows and opens on Alignment.
 */
export const TOOLBAR_TABS = ["file", "alignment", "shapes", "select"] as const;
export type ToolbarTab = (typeof TOOLBAR_TABS)[number];

export const TOOLBAR_PANEL_STORAGE_KEY = "openmarch:toolbarPanel";

export interface ToolbarPanelState {
    tab: ToolbarTab;
    open: boolean;
}

export const DEFAULT_TOOLBAR_PANEL: ToolbarPanelState = {
    tab: "alignment",
    open: false,
};

const isToolbarTab = (value: unknown): value is ToolbarTab =>
    TOOLBAR_TABS.includes(value as ToolbarTab);

/** Reads the remembered panel; anything unreadable is the default (closed, on Alignment). */
export function parseToolbarPanel(raw: string | null): ToolbarPanelState {
    if (raw === null) return DEFAULT_TOOLBAR_PANEL;
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== "object" || value === null) {
            return DEFAULT_TOOLBAR_PANEL;
        }
        const { tab, open } = value as Record<string, unknown>;
        return {
            tab: isToolbarTab(tab) ? tab : DEFAULT_TOOLBAR_PANEL.tab,
            open: open === true,
        };
    } catch {
        return DEFAULT_TOOLBAR_PANEL;
    }
}

/**
 * A tab was tapped. `wasOpenOnIt` is whether that tab's panel was already open when the
 * press began (the tab list selects a tab on press, before the tap ends): tapping the open
 * tab closes the panel, tapping any other tab, or a closed one, opens it on that tab.
 */
export function pressToolbarTab(
    tab: ToolbarTab,
    wasOpenOnIt: boolean,
): ToolbarPanelState {
    return { tab, open: !wasOpenOnIt };
}

const load = (): ToolbarPanelState => {
    try {
        return parseToolbarPanel(
            localStorage.getItem(TOOLBAR_PANEL_STORAGE_KEY),
        );
    } catch {
        return DEFAULT_TOOLBAR_PANEL;
    }
};

const save = (state: ToolbarPanelState) => {
    try {
        localStorage.setItem(
            TOOLBAR_PANEL_STORAGE_KEY,
            JSON.stringify({ tab: state.tab, open: state.open }),
        );
    } catch {
        // Remembering it is a convenience only (private window)
    }
};

interface ToolbarPanelStore extends ToolbarPanelState {
    /** Shows a tab without opening or closing the panel (keyboard focus on the tab list) */
    setTab: (tab: ToolbarTab) => void;
    setOpen: (open: boolean) => void;
    pressTab: (tab: ToolbarTab, wasOpenOnIt: boolean) => void;
}

export const useToolbarPanelStore = create<ToolbarPanelStore>((set, get) => {
    const update = (next: ToolbarPanelState) => {
        set(next);
        save(next);
    };
    return {
        ...load(),
        setTab: (tab) => update({ tab, open: get().open }),
        setOpen: (open) => update({ tab: get().tab, open }),
        pressTab: (tab, wasOpenOnIt) =>
            update(pressToolbarTab(tab, wasOpenOnIt)),
    };
});
