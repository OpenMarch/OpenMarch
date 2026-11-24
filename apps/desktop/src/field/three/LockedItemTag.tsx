import { LockSimpleIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import { useLockedItemTagStore } from "@/items/lockedItemTag";
import { fieldToElement, useFieldViewStore } from "./fieldView";

/** Where the tag stands from the click, in CSS px: up and to the right, clear of the pointer */
const OFFSET = { x: 14, y: -34 };

/**
 * The "Locked" tag a click on a locked item shows beside the click (props epic step 2): the item
 * carries no padlock on the field, so the click says why nothing was selected. Clicking the tag
 * opens the item's Unlock and Edit menu there, as a right-click on the item does (`onOpen`, with
 * the click's field point and the tag's place on screen). It stands off the pointer, so clicking
 * the item again only shows it again.
 */
export default function LockedItemTag({
    onOpen,
}: {
    onOpen: (
        id: number,
        field: { x: number; y: number },
        screen: { x: number; y: number },
    ) => void;
}) {
    const { t } = useTranslate();
    const tag = useLockedItemTagStore((s) => s.tag);
    const view = useFieldViewStore();
    if (!tag) return null;
    const at = fieldToElement(view, tag.at.x, tag.at.y);
    const left = at.x + OFFSET.x;
    const top = at.y + OFFSET.y;
    return (
        <button
            type="button"
            data-testid="field-locked-tag"
            title={t("field.lockedItem.open")}
            aria-label={t("field.lockedItem.open")}
            className="border-stroke bg-modal text-text shadow-modal text-sub hover:bg-fg-2 absolute z-40 inline-flex items-center gap-4 rounded-full border px-8 py-2 whitespace-nowrap"
            style={{ left, top }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.stopPropagation();
                onOpen(tag.id, tag.at, { x: left, y: top });
            }}
        >
            <LockSimpleIcon size={12} aria-hidden />
            {t("field.lockedItem.tag")}
        </button>
    );
}
