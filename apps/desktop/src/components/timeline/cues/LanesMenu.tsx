/**
 * The timeline's lane controls (fork #992, owner's mockup of 2026-11-17): the **Lanes** row under
 * the lane names, last in the lanes area, and the right-click menu on a lane's name. Both open the
 * same list (`timeline/timelineLanes.ts`):
 *
 * - a search box that filters everything under it;
 * - **In this show:** the lanes this show uses, each with a check mark (shown or hidden) and, for
 *   a cue lane, a muted cue count;
 * - **Add a lane:** the other built cue lanes, a submenu per family (a flat list while searching).
 *   Ticking one adds it, empty, ready for cues. Hidden when there's nothing to add.
 *
 * Every tick runs the lane's own show/hide action, and the menu stays open so several can be
 * ticked in a row. On touch the timeline's long press sends the lane name a context menu event,
 * so a finger reaches the same menu (docs/conventions/tablet-parity.md).
 */
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    CaretRightIcon,
    CheckIcon,
    ListChecksIcon,
    MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import {
    KEEP_MENU_EVENTS,
    TIMELINE_MENU_CONTENT_CLASS,
} from "@/components/timeline/TimelineRangeMenu";
import {
    MENU_ITEM_CLASS,
    MENU_LABEL_CLASS,
    MENU_SEPARATOR_CLASS,
} from "@/components/ui/popupClasses";
import { runAction, isActionEnabled } from "@/shortcuts/registry";
import {
    hiddenLaneCount,
    lanesMenuModel,
    setLaneFolded,
    useLaneFolded,
    useLaneStates,
    TIMELINE_LANES,
    type LaneState,
    type TimelineLaneId,
} from "@/timeline/timelineLanes";

/** The Lanes row's height, last in the lanes area. */
export const LANES_ROW_HEIGHT = 28;

const CHECK_SLOT_CLASS = "flex w-[14px] shrink-0 justify-center";

/** One lane in the list: its tick, name and, for a cue lane, its muted cue count. */
function LaneItem({ state, family }: { state: LaneState; family?: string }) {
    const { t } = useTranslate();
    const { lane } = state;
    return (
        <DropdownMenu.CheckboxItem
            data-testid={`lanes-menu-${lane.id}`}
            checked={state.shown}
            disabled={!isActionEnabled(lane.toggleAction)}
            onSelect={(event) => {
                // Stays open, so several lanes can be ticked in a row
                event.preventDefault();
                runAction(lane.toggleAction);
            }}
            className={MENU_ITEM_CLASS}
        >
            <span className={CHECK_SLOT_CLASS}>
                <DropdownMenu.ItemIndicator className="flex">
                    <CheckIcon size={14} />
                </DropdownMenu.ItemIndicator>
            </span>
            {t(lane.labelKey)}
            {(family || state.cueCount !== null) && (
                <span className="text-text-subtitle text-sub ml-auto pl-16">
                    {family ??
                        t("cues.lane.cueCount", { count: state.cueCount ?? 0 })}
                </span>
            )}
        </DropdownMenu.CheckboxItem>
    );
}

/**
 * The list both menus show, with its own search box. `autoFocusSearch` puts the cursor in the
 * box when the menu opens (the Lanes row's menu; a submenu keeps the keyboard on its items).
 */
function LanesList({ autoFocusSearch }: { autoFocusSearch?: boolean }) {
    const { t } = useTranslate();
    const states = useLaneStates();
    const [query, setQuery] = useState("");
    const model = lanesMenuModel(states, query, (key) => t(key));
    const searching = query.trim() !== "";
    return (
        <>
            <div className="border-stroke bg-fg-2 rounded-6 mx-4 mt-2 mb-4 flex items-center gap-6 border px-8">
                <MagnifyingGlassIcon size={14} className="text-text-subtitle" />
                <input
                    data-testid="lanes-menu-search"
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- the menu opens to type in it
                    autoFocus={autoFocusSearch}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    // Typing stays in the box: the menu's own keys (type-ahead) would take it
                    onKeyDown={(e) => {
                        if (e.key !== "Escape" && e.key !== "ArrowDown")
                            e.stopPropagation();
                    }}
                    placeholder={t("cues.lane.find")}
                    aria-label={t("cues.lane.find")}
                    className="text-body h-26 w-full min-w-0 bg-transparent outline-hidden"
                />
            </div>
            {model.inShow.length > 0 && (
                <>
                    <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                        {t("cues.lane.inThisShow")}
                    </DropdownMenu.Label>
                    {model.inShow.map((state) => (
                        <LaneItem key={state.lane.id} state={state} />
                    ))}
                </>
            )}
            {model.add.length > 0 && (
                <>
                    {model.inShow.length > 0 && (
                        <DropdownMenu.Separator
                            className={MENU_SEPARATOR_CLASS}
                        />
                    )}
                    <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                        {t("cues.lane.addLane")}
                    </DropdownMenu.Label>
                    {searching
                        ? model.add.flatMap(({ familyKey, lanes }) =>
                              lanes.map((state) => (
                                  <LaneItem
                                      key={state.lane.id}
                                      state={state}
                                      family={t(familyKey)}
                                  />
                              )),
                          )
                        : model.add.map(({ familyKey, lanes }) => (
                              <DropdownMenu.Sub key={familyKey}>
                                  <DropdownMenu.SubTrigger
                                      data-testid={`lanes-menu-family-${familyKey}`}
                                      className={MENU_ITEM_CLASS}
                                  >
                                      <span className={CHECK_SLOT_CLASS} />
                                      {t(familyKey)}
                                      <CaretRightIcon
                                          size={12}
                                          className="ml-auto"
                                      />
                                  </DropdownMenu.SubTrigger>
                                  <DropdownMenu.Portal>
                                      <DropdownMenu.SubContent
                                          sideOffset={4}
                                          collisionPadding={8}
                                          {...KEEP_MENU_EVENTS}
                                          className={
                                              TIMELINE_MENU_CONTENT_CLASS
                                          }
                                      >
                                          {lanes.map((state) => (
                                              <LaneItem
                                                  key={state.lane.id}
                                                  state={state}
                                              />
                                          ))}
                                      </DropdownMenu.SubContent>
                                  </DropdownMenu.Portal>
                              </DropdownMenu.Sub>
                          ))}
                </>
            )}
            {model.inShow.length === 0 && model.add.length === 0 && (
                <div className="text-sub text-text-subtitle px-8 py-4">
                    {t("cues.lane.noMatch")}
                </div>
            )}
        </>
    );
}

/**
 * The **Lanes** row: last in the lanes area, at the visible left edge. It reads "Lanes", or
 * "Lanes · 2 hidden" while lanes in this show are hidden, and opens the lane list.
 */
export function LanesRow() {
    const { t } = useTranslate();
    const hidden = hiddenLaneCount(useLaneStates());
    const [open, setOpen] = useState(false);
    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    data-testid="timeline-lanes-row"
                    data-timeline-interactive=""
                    onPointerDown={(e) => e.stopPropagation()}
                    className={clsx(
                        "text-micro border-stroke bg-bg-1/80 hover:text-accent hover:border-accent touch:min-h-44 flex h-20 items-center gap-4 rounded-full border px-8 backdrop-blur-sm",
                        open ? "text-accent border-accent" : "text-text",
                    )}
                >
                    <ListChecksIcon size={12} />
                    <span className="font-medium">{t("cues.lane.lanes")}</span>
                    {hidden > 0 && (
                        <span className="text-text-subtitle">
                            {t("cues.lane.hiddenCount", { count: hidden })}
                        </span>
                    )}
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    data-testid="timeline-lanes-menu"
                    align="start"
                    side="top"
                    sideOffset={4}
                    collisionPadding={8}
                    {...KEEP_MENU_EVENTS}
                    className={`${TIMELINE_MENU_CONTENT_CLASS} min-w-240`}
                >
                    <LanesList autoFocusSearch />
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

/**
 * A lane name's right-click (or long-press) menu: "Hide <lane>", "Collapse rows" or "Expand rows"
 * where the lane folds into a summary, then "Lanes ›" with the same list. Spread `onContextMenu`
 * on the lane's name and render `menu` beside it.
 */
export function useLaneNameMenu(id: TimelineLaneId): {
    onContextMenu: (e: React.MouseEvent) => void;
    menu: ReactNode;
} {
    const [at, setAt] = useState<{ x: number; y: number } | null>(null);
    const opened = useRef(false);
    opened.current = at !== null;
    return {
        onContextMenu: (e) => {
            e.preventDefault();
            e.stopPropagation();
            setAt({ x: e.clientX, y: e.clientY });
        },
        menu: at ? (
            <LaneNameMenu id={id} at={at} onClose={() => setAt(null)} />
        ) : null,
    };
}

function LaneNameMenu({
    id,
    at,
    onClose,
}: {
    id: TimelineLaneId;
    at: { x: number; y: number };
    onClose: () => void;
}) {
    const { t } = useTranslate();
    const lane = TIMELINE_LANES.find((l) => l.id === id)!;
    const folded = useLaneFolded(id);
    // Lanes with a stacked summary (the cue lanes) can collapse their rows
    const folds = lane.cueType !== undefined;
    const name = t(lane.labelKey);
    return createPortal(
        <DropdownMenu.Root
            open
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DropdownMenu.Trigger asChild>
                <div
                    aria-hidden
                    className="pointer-events-none fixed h-0 w-0"
                    style={{ left: at.x, top: at.y }}
                />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    data-testid="lane-name-menu"
                    align="start"
                    collisionPadding={8}
                    {...KEEP_MENU_EVENTS}
                    className={TIMELINE_MENU_CONTENT_CLASS}
                >
                    <DropdownMenu.Item
                        data-testid="lane-name-menu-hide"
                        disabled={!isActionEnabled(lane.toggleAction)}
                        onSelect={() => runAction(lane.toggleAction)}
                        className={MENU_ITEM_CLASS}
                    >
                        {t("cues.lane.hideNamed", { lane: name })}
                    </DropdownMenu.Item>
                    {folds && (
                        <DropdownMenu.Item
                            data-testid="lane-name-menu-fold"
                            onSelect={() => setLaneFolded(id, !folded)}
                            className={MENU_ITEM_CLASS}
                        >
                            {t(
                                folded
                                    ? "cues.lane.expandRows"
                                    : "cues.lane.collapseRows",
                            )}
                        </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Separator className={MENU_SEPARATOR_CLASS} />
                    <DropdownMenu.Sub>
                        <DropdownMenu.SubTrigger
                            data-testid="lane-name-menu-lanes"
                            className={MENU_ITEM_CLASS}
                        >
                            {t("cues.lane.lanes")}
                            <CaretRightIcon size={12} className="ml-auto" />
                        </DropdownMenu.SubTrigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.SubContent
                                data-testid="lane-name-menu-lanes-content"
                                sideOffset={4}
                                collisionPadding={8}
                                {...KEEP_MENU_EVENTS}
                                className={`${TIMELINE_MENU_CONTENT_CLASS} min-w-240`}
                            >
                                <LanesList />
                            </DropdownMenu.SubContent>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Sub>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>,
        document.body,
    );
}
