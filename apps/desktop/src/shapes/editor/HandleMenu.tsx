import { Fragment, useEffect, useId, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CheckIcon, TrashIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import {
    KEEP_MENU_EVENTS,
    MenuItemWithReason,
    TIMELINE_MENU_CONTENT_CLASS,
    TIMELINE_MENU_ITEM_CLASS,
    TimelineMenuClose,
} from "@/components/timeline/TimelineRangeMenu";
import type { ToolMenuItem, ToolMenuSection } from "../tool/toolKind";
import { closeHandleMenu, useHandleMenuStore } from "../field/handleMenu";

/** A tick in front of the answer the shape has now; room for one in front of the others */
const Tick = ({ item }: { item: ToolMenuItem }) =>
    item.checked === undefined ? null : (
        <span aria-hidden="true" className="inline-flex w-[14px] shrink-0">
            {item.checked && <CheckIcon size={14} />}
        </span>
    );

const ICONS = { trash: TrashIcon } as const;

/** Corner | Smooth side by side, as the app's segmented switches look (`SegmentedTextSwitch`) */
const SEGMENTS_CLASS =
    "bg-fg-1 border-stroke mx-4 flex gap-2 rounded-full border p-2 shadow-inner";
const SEGMENT_CLASS = clsx(
    "text-text-subtitle flex flex-1 cursor-default items-center justify-center rounded-full border border-transparent px-12 py-2 text-[12px] whitespace-nowrap outline-hidden select-none",
    "transition-colors duration-150 ease-out",
    "data-[highlighted]:text-accent data-[highlighted]:ring-accent data-[highlighted]:ring-1",
    "data-[state=checked]:bg-fg-2 data-[state=checked]:text-text data-[state=checked]:border-accent",
    "data-[disabled]:opacity-50",
);
/**
 * The answers greyed while the switch above follows the shape: the shape's answer marked softly,
 * each still picked to set it (#568)
 */
const FOLLOWED_SEGMENTS_CLASS = clsx(
    "opacity-60",
    "[&>[data-state=checked]]:bg-transparent [&>[data-state=checked]]:text-text-subtitle [&>[data-state=checked]]:border-dashed [&>[data-state=checked]]:border-text-subtitle/60",
);
/** A switch drawn in a menu row, as the app's `Switch` looks, smaller */
const TRACK_CLASS =
    "border-stroke bg-fg-2 relative ml-auto inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full border transition-colors duration-150 ease-out";
const THUMB_CLASS =
    "bg-text/80 block size-[13px] translate-x-[2px] rounded-full transition-transform duration-100";
/** A quiet line under a switch or an either/or */
const NOTE_CLASS = "text-text-subtitle px-8 text-[11px]";

/**
 * A shape handle's right-click menu (#569, look #568): a Line's point (its corner type as a
 * Corner | Smooth either/or with roundness under it, whether a marcher stands on it as the line's
 * setting or an override of it, delete, close or open the line there) or a segment's middle (add a
 * point, straight or curved). Opened by the shape modes (`openHandleMenu`), at the right-click, a
 * Mac's Ctrl-click or a long press; each entry is one change of the shape. The field's shape mode
 * changing closes it (`useShapeFieldModes`).
 */
export default function HandleMenu() {
    const menu = useHandleMenuStore((s) => s.menu);
    const labelId = useId();
    // The context-menu key and a Mac's Ctrl-click also fire the browser's own menu
    useEffect(() => {
        if (!menu) return;
        const block = (event: Event) => event.preventDefault();
        document.addEventListener("contextmenu", block, true);
        return () => document.removeEventListener("contextmenu", block, true);
    }, [menu]);
    if (!menu) return null;

    const entry = (item: ToolMenuItem) => {
        const testId = `shape-menu-${item.value}`;
        const Icon = item.icon ? ICONS[item.icon] : null;
        const words = (
            <>
                <Tick item={item} />
                {Icon && (
                    <span
                        aria-hidden="true"
                        className="inline-flex w-[14px] shrink-0"
                    >
                        <Icon size={14} />
                    </span>
                )}
                {item.label}
            </>
        );
        const className = clsx(
            TIMELINE_MENU_ITEM_CLASS,
            item.destructive && "data-[highlighted]:text-red",
        );
        if (item.disabled)
            return (
                <MenuItemWithReason
                    key={item.value}
                    testId={testId}
                    reason={item.disabled}
                    reasonTestId={`${testId}-reason`}
                    checked={item.checked}
                    className={className}
                    onSelect={() => {}}
                >
                    {words}
                </MenuItemWithReason>
            );
        return (
            <DropdownMenu.Item
                key={item.value}
                data-testid={testId}
                // An answer reads as one, with whether it's the shape's now
                {...(item.checked === undefined
                    ? {}
                    : {
                          role: "menuitemradio",
                          "aria-checked": item.checked,
                      })}
                onSelect={() => menu.pick(item.value)}
                className={className}
            >
                {words}
            </DropdownMenu.Item>
        );
    };

    /**
     * An either/or side by side, its answers a radio group the menu's keys reach; picking one
     * keeps the menu open, so the change shows. Its other entries list under the hint.
     */
    const segmented = (section: ToolMenuSection, id: string): ReactNode => {
        const answers = section.items.filter((i) => i.checked !== undefined);
        const others = section.items.filter((i) => i.checked === undefined);
        const hintId = `${id}-hint`;
        return (
            <>
                <DropdownMenu.RadioGroup
                    aria-labelledby={id}
                    aria-describedby={section.hint ? hintId : undefined}
                    value={answers.find((i) => i.checked)?.value}
                    className={SEGMENTS_CLASS}
                >
                    {answers.map((item) => (
                        <DropdownMenu.RadioItem
                            key={item.value}
                            value={item.value}
                            data-testid={`shape-menu-${item.value}`}
                            disabled={item.disabled !== undefined}
                            onSelect={(event) => {
                                event.preventDefault();
                                if (!item.checked) menu.pick(item.value);
                            }}
                            className={SEGMENT_CLASS}
                        >
                            {item.label}
                        </DropdownMenu.RadioItem>
                    ))}
                </DropdownMenu.RadioGroup>
                {section.hint && (
                    // Smaller than the section's name and tucked under its switch: it belongs to it
                    <p
                        id={hintId}
                        data-testid="shape-menu-hint"
                        className="text-text-subtitle -mt-2 mb-4 px-8 text-center text-[10px] opacity-80"
                    >
                        {section.hint}
                    </p>
                )}
                {others.map(entry)}
            </>
        );
    };

    /**
     * Follow the shape's answer as a switch, what the shape does under it, then its answers side by
     * side: greyed while following, though focusable and picked to set one over the shape's. Every
     * pick keeps the menu open, so the change shows.
     */
    const follow = (section: ToolMenuSection, id: string): ReactNode => {
        const toggle = section.items.find((i) => i.toggle);
        const answers = section.items.filter(
            (i) => !i.toggle && i.checked !== undefined,
        );
        const following = toggle?.checked === true;
        const captionId = `${id}-caption`;
        return (
            <>
                {toggle && (
                    <DropdownMenu.CheckboxItem
                        data-testid={`shape-menu-${toggle.value}`}
                        checked={toggle.checked === true}
                        disabled={toggle.disabled !== undefined}
                        aria-describedby={
                            section.caption ? captionId : undefined
                        }
                        onSelect={(event) => {
                            event.preventDefault();
                            menu.pick(toggle.value);
                        }}
                        className={clsx(TIMELINE_MENU_ITEM_CLASS, "group")}
                    >
                        {toggle.label}
                        <span
                            aria-hidden="true"
                            className={clsx(
                                TRACK_CLASS,
                                "group-data-[state=checked]:bg-accent group-data-[state=checked]:border-accent",
                            )}
                        >
                            <span
                                className={clsx(
                                    THUMB_CLASS,
                                    "group-data-[state=checked]:translate-x-[13px] group-data-[state=checked]:bg-white",
                                )}
                            />
                        </span>
                    </DropdownMenu.CheckboxItem>
                )}
                {section.caption && (
                    <p
                        id={captionId}
                        data-testid="shape-menu-caption"
                        className={clsx(NOTE_CLASS, "-mt-4")}
                    >
                        {section.caption}
                    </p>
                )}
                <DropdownMenu.RadioGroup
                    aria-label={section.label}
                    // Greyed while following, not off: the caption says the line's answer
                    aria-describedby={section.caption ? captionId : undefined}
                    value={answers.find((i) => i.checked)?.value ?? ""}
                    data-following={following || undefined}
                    className={clsx(
                        SEGMENTS_CLASS,
                        "mt-2",
                        following && FOLLOWED_SEGMENTS_CLASS,
                    )}
                >
                    {answers.map((item) => (
                        <DropdownMenu.RadioItem
                            key={item.value}
                            value={item.value}
                            data-testid={`shape-menu-${item.value}`}
                            disabled={item.disabled !== undefined}
                            onSelect={(event) => {
                                event.preventDefault();
                                if (following || !item.checked)
                                    menu.pick(item.value);
                            }}
                            className={SEGMENT_CLASS}
                        >
                            {item.label}
                        </DropdownMenu.RadioItem>
                    ))}
                </DropdownMenu.RadioGroup>
            </>
        );
    };

    return (
        <DropdownMenu.Root
            open
            onOpenChange={(next) => {
                if (!next) closeHandleMenu();
            }}
        >
            <DropdownMenu.Trigger asChild>
                <div
                    data-testid="shape-menu-anchor"
                    aria-hidden
                    className="pointer-events-none absolute h-0 w-0"
                    style={{ left: menu.at.x, top: menu.at.y }}
                />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    data-testid="shape-menu"
                    data-handle={menu.key}
                    align="start"
                    side="bottom"
                    collisionPadding={8}
                    // The anchor is a hidden div: focus falls to the page, and the field's keys
                    // still work
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    {...KEEP_MENU_EVENTS}
                    className={TIMELINE_MENU_CONTENT_CLASS}
                >
                    {/* An open reason tip gets Escape first: this closes the menu with it */}
                    <TimelineMenuClose.Provider value={closeHandleMenu}>
                        {menu.sections.map((section, i) => (
                            <Fragment key={section.items[0]?.value ?? i}>
                                {i > 0 && (
                                    <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
                                )}
                                {section.look === "follow" ? (
                                    <div className="flex min-w-[232px] flex-col gap-4 pb-4">
                                        {follow(section, `${labelId}-${i}`)}
                                    </div>
                                ) : section.look === "segmented" ? (
                                    <div className="flex flex-col gap-4">
                                        {section.label && (
                                            <DropdownMenu.Label
                                                id={`${labelId}-${i}`}
                                                className="text-text-subtitle px-8 pt-4 text-[11px]"
                                            >
                                                {section.label}
                                            </DropdownMenu.Label>
                                        )}
                                        {segmented(section, `${labelId}-${i}`)}
                                    </div>
                                ) : section.label ? (
                                    // A labelled section's answers are read as one set, by its name
                                    <DropdownMenu.Group
                                        aria-labelledby={`${labelId}-${i}`}
                                    >
                                        <DropdownMenu.Label
                                            id={`${labelId}-${i}`}
                                            className="text-text-subtitle px-8 pt-4 text-[11px]"
                                        >
                                            {section.label}
                                        </DropdownMenu.Label>
                                        {section.items.map(entry)}
                                    </DropdownMenu.Group>
                                ) : (
                                    section.items.map(entry)
                                )}
                            </Fragment>
                        ))}
                    </TimelineMenuClose.Provider>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
