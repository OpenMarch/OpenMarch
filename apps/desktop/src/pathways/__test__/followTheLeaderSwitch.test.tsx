import { act, cleanup, render, screen } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import type { ActionId } from "@/shortcuts/definitions";
import {
    hasActionHandler,
    isActionEnabled,
    pressAction,
    registerActionHandler,
    runAction,
    subscribeToActionHandlers,
} from "@/shortcuts/registry";
import { getActionPaletteItems } from "@/shortcuts/palette/actionSource";
import { shortcutGroups } from "@/components/ShortcutsDialog";
import { ALL_SETTINGS_SECTIONS } from "@/settings/sections";
import FieldContextMenu from "@/field/three/FieldContextMenu";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { TRAIL_FIELD_MENU } from "../pathPenMode";
import { PathPenButton } from "../PathPenButton";
import PathsTab from "../PathsTab";
import {
    FOLLOW_THE_LEADER_ACTIONS,
    isFollowTheLeaderOn,
    setFollowTheLeader,
} from "../followTheLeader";

/**
 * The Follow-the-leader switch (pathways M2, #1095), off by default: its actions (Follow, the
 * Follow tool's Ends and Preview, Reverse leader, Show, Set, Reverse and Clear order) have no
 * handler while it's off, so no key, palette entry, menu item or toolbar button reaches them,
 * and the plain path commands stay. Switched on, they're back at once, without a reload.
 */

const FTL = [...FOLLOW_THE_LEADER_ACTIONS];
/** Plain path commands, which the switch never touches */
const PLAIN: readonly ActionId[] = [
    "pathPen",
    "editPath",
    "editLine",
    "removePath",
    "refitPath",
    "detachPath",
    "detachAllPath",
    "rejoinPath",
];

const offs: (() => void)[] = [];
/** A handler for each of `ids`, enabled, its runs counted */
function handleAll(ids: readonly ActionId[]) {
    const runs = new Map<ActionId, ReturnType<typeof vi.fn>>();
    for (const id of ids) {
        const run = vi.fn();
        runs.set(id, run);
        offs.push(registerActionHandler(id, { run, isEnabled: () => true }));
    }
    return runs;
}

const t = (key: string) => key;
const paletteIds = () =>
    new Set(getActionPaletteItems({ t }, {}).map((item) => item.id));
const shortcutLabels = () =>
    shortcutGroups(t, {}, false, false).flatMap((g) =>
        g.rows.map((r) => r.label),
    );

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    offs.splice(0).forEach((off) => off());
    act(() => setFollowTheLeader(false));
});

describe("Follow-the-leader switch (#1095)", () => {
    it("is off by default, kept with the UI settings", () => {
        expect(useUiSettingsStore.getState().uiSettings.followTheLeader).toBe(
            false,
        );
        expect(isFollowTheLeaderOn()).toBe(false);
        setFollowTheLeader(true);
        expect(
            JSON.parse(localStorage.getItem("openmarch:uiSettings")!)
                .followTheLeader,
        ).toBe(true);
    });

    it("off: Follow, Set order and the rest have no handler, so keys and commands don't run them; plain paths do", () => {
        const runs = handleAll([...FTL, ...PLAIN]);
        for (const id of FTL) {
            expect(hasActionHandler(id)).toBe(false);
            expect(isActionEnabled(id)).toBe(false);
            expect(runAction(id)).toBe(false);
            // A key press (Shift+L, Shift+O, Alt+L, Alt+O)
            expect(pressAction(id)).toBeNull();
            expect(runs.get(id)).not.toHaveBeenCalled();
        }
        for (const id of PLAIN) {
            expect(isActionEnabled(id)).toBe(true);
            expect(runAction(id)).toBe(true);
            expect(runs.get(id)).toHaveBeenCalledTimes(1);
        }
    });

    it("on: they run, and switching tells menus and the palette to read again", () => {
        const runs = handleAll(FTL);
        const changed = vi.fn();
        const unsubscribe = subscribeToActionHandlers(changed);
        setFollowTheLeader(true);
        expect(changed).toHaveBeenCalled();
        for (const id of FTL) {
            expect(isActionEnabled(id)).toBe(true);
            expect(runAction(id)).toBe(true);
            expect(runs.get(id)).toHaveBeenCalledTimes(1);
        }
        changed.mockClear();
        setFollowTheLeader(false);
        expect(changed).toHaveBeenCalled();
        unsubscribe();
    });

    it("the palette lists them only while it's on; the plain path commands always", () => {
        handleAll([...FTL, ...PLAIN]);
        const off = paletteIds();
        for (const id of FTL) expect(off.has(`action:${id}`)).toBe(false);
        for (const id of PLAIN) expect(off.has(`action:${id}`)).toBe(true);
        setFollowTheLeader(true);
        const on = paletteIds();
        for (const id of FTL) expect(on.has(`action:${id}`)).toBe(true);
        for (const id of PLAIN) expect(on.has(`action:${id}`)).toBe(true);
    });

    it("the shortcut lists (?, Settings search) leave out Follow, Reverse leader, Show and Set order while it's off", () => {
        const labels = [
            "actions.path.follow",
            "actions.path.reverse",
            "actions.path.showOrder",
            "actions.path.setOrder",
        ];
        const search = () =>
            ALL_SETTINGS_SECTIONS.find((s) => s.id === "shortcuts")!
                .searchLabels!(t);
        for (const label of labels) {
            expect(shortcutLabels()).not.toContain(label);
            expect(search()).not.toContain(label);
        }
        expect(shortcutLabels()).toContain("actions.path.pen");
        setFollowTheLeader(true);
        for (const label of labels) {
            expect(shortcutLabels()).toContain(label);
            expect(search()).toContain(label);
        }
    });

    it("lists the setting in Settings › Field, for its search and the guide", () => {
        expect(
            ALL_SETTINGS_SECTIONS.find((s) => s.id === "field")!.searchKeys,
        ).toContain("settings.field.followTheLeader");
    });
});

describe("Follow-the-leader switch: the field's menus (#1095)", () => {
    const openMenu = (actions: readonly ActionId[] | null = null) =>
        render(
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <FieldContextMenu
                    at={{ x: 120, y: 80 }}
                    actions={actions}
                    onClose={vi.fn()}
                    selectedCount={3}
                    timelineMode
                />
            </TolgeeProvider>,
        );
    const item = (id: ActionId) => screen.queryByTestId(`field-menu-${id}`);
    const ORDER = [
        "setMarcherOrder",
        "reverseMarcherOrder",
        "clearMarcherOrder",
    ] as const;

    it("off: no Set, Reverse or Clear order on the field's menu; on, they're back while it's open", () => {
        handleAll([...FTL, ...PLAIN, "alignHorizontally"]);
        openMenu();
        expect(item("alignHorizontally")).not.toBeNull();
        expect(item("editPath")).not.toBeNull();
        for (const id of ORDER) expect(item(id)).toBeNull();
        expect(item("reverseTrail")).toBeNull();
        act(() => setFollowTheLeader(true));
        for (const id of ORDER) expect(item(id)).not.toBeNull();
        expect(item("reverseTrail")).not.toBeNull();
    });

    it("a trail's right-click menu drops Reverse leader while it's off, keeping Edit path and Remove", () => {
        handleAll([...FTL, ...PLAIN]);
        openMenu(TRAIL_FIELD_MENU);
        expect(item("reverseTrail")).toBeNull();
        expect(item("editPath")).not.toBeNull();
        expect(item("removePath")).not.toBeNull();
        act(() => setFollowTheLeader(true));
        expect(item("reverseTrail")).not.toBeNull();
    });
});

describe("Follow-the-leader switch: the Paths tab (#1095)", () => {
    const renderTab = (node: React.ReactNode) =>
        render(
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                {node}
            </TolgeeProvider>,
        );

    it("off: the Path pen without Follow; on, Follow beside it, no reload", () => {
        handleAll(["pathPen", "followTrail"]);
        renderTab(<PathPenButton performers={3} />);
        expect(screen.getByTestId("toolbar-path-pen")).toBeInTheDocument();
        expect(screen.queryByTestId("toolbar-follow-trail")).toBeNull();
        act(() => setFollowTheLeader(true));
        expect(screen.getByTestId("toolbar-follow-trail")).toBeInTheDocument();
    });

    it("off: no Set order, Reverse or Clear order; on, they're back", () => {
        handleAll(["pathPen", ...FTL]);
        renderTab(<PathsTab />);
        expect(screen.getByTestId("toolbar-path-pen")).toBeInTheDocument();
        for (const id of [
            "toolbar-set-order",
            "toolbar-reverse-order",
            "toolbar-clear-order",
        ])
            expect(screen.queryByTestId(id)).toBeNull();
        act(() => setFollowTheLeader(true));
        expect(screen.getByTestId("toolbar-set-order")).toBeInTheDocument();
        expect(screen.getByTestId("toolbar-clear-order")).toBeInTheDocument();
    });
});
