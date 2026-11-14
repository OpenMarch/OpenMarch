import { Tabs, TabContent, TabItem, TabsList } from "@openmarch/ui";
import { useFieldLayerRef } from "@/components/canvas/fieldLayers";
import { FileTab } from "./tabs/FileTab";
import AlignmentTab from "./tabs/AlignmentTab";
import ShapesTab from "@/shapes/tool/ShapesTab";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import { T, useTranslate } from "@tolgee/react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import SelectTab from "./tabs/SelectTab";
import WorkspaceViewSwitch from "./WorkspaceViewSwitch";
import View3dButton from "./View3dButton";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { useToolbarTabsSlot } from "@/components/titlebar/toolbarSlot";
import {
    TOOLBAR_TABS,
    type ToolbarTab,
    useToolbarPanelStore,
} from "@/stores/ToolbarPanelStore";
import { usePanelInsets } from "./touchPanelInsets";

/**
 * Touch layout: each tab's controls wrap onto another line where the panel is too narrow for
 * them (iPad portrait, tablet plan 2.2), so none is cut off at its edge. The panel floats over
 * the field, so a taller panel moves nothing.
 */
const touchTabRowClassName = "[&>div]:flex-wrap [&>div>*]:max-w-full";

/**
 * The touch title bar row is a size container (`row`). Below 480 px all four tabs, the
 * chevron and the row's end don't fit side by side, so the tabs get shorter (Alignment → Align,
 * smaller text, less padding) and the chevron goes: tapping a tab opens the panel, and tapping
 * the open tab closes it. On the iPad web build (no window buttons) the row is about 400 px at
 * 744 px portrait and 467 px at 1024 px landscape, where the full tabs miss by a few pixels.
 */
// Written out in full in each class, so Tailwind finds them
const narrowTabsClassName =
    "@max-[480px]/row:[&>button]:px-6 @max-[480px]/row:[&>button]:text-sub";

const isToolbarTab = (value: string): value is ToolbarTab =>
    TOOLBAR_TABS.includes(value as ToolbarTab);

function ToolbarTabsList({
    tabProps,
    touch = false,
}: {
    tabProps?: (
        value: ToolbarTab,
    ) => Omit<React.ComponentProps<typeof TabItem>, "value" | "children">;
    /** In the touch title bar: shorter tabs when the row is narrow */
    touch?: boolean;
}) {
    const { t } = useTranslate();
    const props = (value: ToolbarTab) =>
        tabProps ? tabProps(value) : undefined;
    return (
        <TabsList
            className={clsx("gap-0 border-none", touch && narrowTabsClassName)}
        >
            <TabItem value="file" {...props("file")}>
                <T keyName="inspector.shape.fileTab" />
            </TabItem>
            {touch ? (
                // The short name only where the row is narrow; the tab keeps its full name
                <TabItem
                    value="alignment"
                    aria-label={t("inspector.shape.alignmentTab")}
                    {...props("alignment")}
                >
                    <span className="@max-[480px]/row:hidden">
                        <T keyName="inspector.shape.alignmentTab" />
                    </span>
                    <span className="hidden @max-[480px]/row:inline">
                        <T keyName="toolbar.alignmentTabShort" />
                    </span>
                </TabItem>
            ) : (
                <TabItem value="alignment" {...props("alignment")}>
                    <T keyName="inspector.shape.alignmentTab" />
                </TabItem>
            )}
            <TabItem
                value="shapes"
                data-testid="toolbar-shapes-tab"
                {...props("shapes")}
            >
                <T keyName="inspector.shape.shapesTab" />
            </TabItem>
            <TabItem value="select" {...props("select")}>
                <T keyName="inspector.shape.selectTab" />
            </TabItem>
        </TabsList>
    );
}

function ToolbarTabContents({ className }: { className?: string }) {
    return (
        <>
            <TabContent value="file" className={className}>
                <FileTab />
            </TabContent>

            <TabContent value="alignment" className={className}>
                <AlignmentTab />
            </TabContent>

            <TabContent value="shapes" className={className}>
                <ShapesTab />
            </TabContent>

            <TabContent value="select" className={className}>
                <SelectTab />
            </TabContent>
        </>
    );
}

/**
 * The 3D View button and the Editor/Preview switch, at the toolbar's right end. In the touch
 * title bar the 3D View button keeps its icon however narrow the row (tablet plan 2.2)
 */
function ToolbarEnd({
    className,
    touch = false,
}: {
    className?: string;
    touch?: boolean;
}) {
    return (
        <div className={className}>
            {/* Its words go first, then the whole button, so it never covers the tabs at the
                narrowest window (the shortcut and ⌘K still open the 3D View) */}
            <View3dButton
                className={touch ? undefined : "@max-[480px]:hidden"}
                labelClassName="@max-[600px]:sr-only"
            />
            <WorkspaceViewSwitch />
        </div>
    );
}

/** What the tablet layout's title bar row gets to lock it in tempo mode, as App locks the rest */
type TempoLock = {
    /** Tempo mode (Edit music) is on: nothing but the tempo lanes takes input */
    tempoMode?: boolean;
    /** App's class for what steps back in tempo mode */
    tempoModeClass?: string;
};

/** The touch toolbar's row in the title bar: a tablet's toolbar takes no room above the field */
function useTouchSlot() {
    const isTouch = useIsTouchMode();
    const slot = useToolbarTabsSlot();
    // Without the title bar slot (it isn't shown), the toolbar keeps the mouse layout
    return isTouch ? slot : null;
}

export default function Topbar(props: TempoLock) {
    const slot = useTouchSlot();
    if (slot) return <TouchToolbar tabsSlot={slot} {...props} />;
    return <MouseToolbar />;
}

/**
 * Preview's only controls: the workspace switch, to go back, and the 3D View. In the tablet
 * layout they take the title bar row as the editor's toolbar does, so switching between the
 * two never moves the field.
 */
export function PreviewToolbar() {
    const slot = useTouchSlot();
    if (slot)
        return (
            <>
                {/* Holds the editor toolbar's place in the column, so the field stays put */}
                <div className="h-0" />
                {createPortal(
                    <div
                        className="@container flex w-full min-w-0 items-center justify-end gap-8"
                        data-testid="touch-preview-toolbar"
                    >
                        <ToolbarEnd
                            touch
                            className="flex shrink-0 items-center gap-8"
                        />
                    </div>,
                    slot,
                )}
            </>
        );
    return (
        <div className="flex items-center justify-end gap-8">
            <View3dButton />
            <WorkspaceViewSwitch />
        </div>
    );
}

function MouseToolbar() {
    const [activeTab, setActiveTab] = useState("alignment");
    // The Collisions tab (CollisionsTab.tsx) is hidden for now, with collision detection
    // unmounted (TimelineResolverHost): the field never drew the markers it reviews.

    return (
        <div className="group @container relative">
            <ToolbarEnd className="absolute top-0 right-0 z-10 flex items-center gap-8" />
            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex flex-col gap-0 overflow-hidden"
            >
                <ToolbarTabsList />
                <ToolbarTabContents />
            </Tabs>
        </div>
    );
}

/**
 * Tablet layout (ported from upstream #1060): the tab row moves into the title bar, so the
 * top of the screen is one row, and the tab's controls are a panel over the top of the field.
 * Tap a tab to open its panel, tap the open tab or the chevron to close it. The panel takes
 * no layout space, so opening it never resizes the field, and it covers the field only,
 * short of the field display bar, so the sidebar and the display bar stay reachable. The
 * controls inside are the same as the mouse toolbar's and run the same actions.
 */
// eslint-disable-next-line max-lines-per-function
function TouchToolbar({
    tabsSlot,
    tempoMode = false,
    tempoModeClass,
}: { tabsSlot: HTMLElement } & TempoLock) {
    const { t } = useTranslate();
    const tab = useToolbarPanelStore((s) => s.tab);
    const open = useToolbarPanelStore((s) => s.open);
    const { setTab, setOpen, pressTab } = useToolbarPanelStore.getState();
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const insets = usePanelInsets(root, open);
    const panelLayerRef = useFieldLayerRef<HTMLDivElement>();

    // The tab list selects a tab as the press begins, so whether the tapped tab was already
    // open is read then, before the tap ends
    const pressedOpenTab = useRef<boolean | null>(null);
    const isOpenOn = (value: ToolbarTab) => {
        const state = useToolbarPanelStore.getState();
        return state.open && state.tab === value;
    };
    const tabProps = (value: ToolbarTab) => ({
        "aria-expanded": open && tab === value,
        onPointerDown: () => {
            pressedOpenTab.current = isOpenOn(value);
        },
        // A press the system takes over (a scroll of the tab row) is no tap
        onPointerCancel: () => {
            pressedOpenTab.current = null;
        },
        onClick: () => {
            // A keyboard click (Enter, Space) has no press before it
            pressTab(value, pressedOpenTab.current ?? isOpenOn(value));
            pressedOpenTab.current = null;
        },
    });

    // The tab row scrolls when the title bar is narrow: keep the selected tab in view
    const tabRow = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const selected = tabRow.current?.querySelector<HTMLElement>(
            '[role="tab"][data-state="active"]',
        );
        selected?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }, [tab]);

    return (
        // Takes no height: the panel floats over the field
        <div ref={setRoot} className="relative h-0" data-testid="touch-toolbar">
            <Tabs
                value={tab}
                onValueChange={(value) => {
                    if (isToolbarTab(value)) setTab(value);
                }}
                className="gap-0"
            >
                {createPortal(
                    // The whole toolbar row, as on the desktop: the tabs, then the 3D View button and
                    // the workspace switch at the end (the field's top right is its display bar's).
                    // When the row is short of room the tabs scroll sideways
                    <div
                        className={clsx(
                            "@container/row flex w-full min-w-0 items-center gap-8",
                            tempoModeClass,
                        )}
                        inert={tempoMode}
                        data-testid="touch-toolbar-row"
                    >
                        <div className="flex min-w-0 items-center">
                            <div
                                ref={tabRow}
                                className="min-w-0 overflow-x-auto [scrollbar-width:none]"
                            >
                                <ToolbarTabsList tabProps={tabProps} touch />
                            </div>
                            <button
                                type="button"
                                aria-expanded={open}
                                aria-controls="toolbar-panel"
                                aria-label={t(
                                    open
                                        ? "toolbar.hideControls"
                                        : "toolbar.showControls",
                                )}
                                onClick={() => setOpen(!open)}
                                data-testid="toolbar-panel-toggle"
                                className="hover:text-accent text-text focus-visible:text-accent flex size-44 shrink-0 cursor-pointer items-center justify-center rounded-full outline-hidden duration-150 ease-out @max-[480px]/row:hidden"
                            >
                                {open ? (
                                    <CaretUpIcon size={18} />
                                ) : (
                                    <CaretDownIcon size={18} />
                                )}
                            </button>
                        </div>
                        <ToolbarEnd
                            touch
                            className="ml-auto flex shrink-0 items-center gap-8"
                        />
                    </div>,
                    tabsSlot,
                )}
                <div
                    ref={panelLayerRef}
                    id="toolbar-panel"
                    data-testid="toolbar-panel"
                    // #927: the pill keeps off it, and the field's bars move down below it
                    data-field-layer="cover"
                    // Until it's measured, nothing: it would cover the sidebar for a frame
                    hidden={!open || !insets}
                    style={insets ?? undefined}
                    // Under an open sidebar panel, which sits over the field's left side
                    className="rounded-6 border-stroke bg-modal backdrop-blur-32 shadow-modal absolute top-0 z-40 border p-8"
                >
                    <ToolbarTabContents className={touchTabRowClassName} />
                </div>
            </Tabs>
        </div>
    );
}
