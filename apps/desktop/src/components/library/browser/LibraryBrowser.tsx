/**
 * The Library browser in the Assets sidebar tab (owner decision Q76): every
 * Library item as a thumbnail grid, grouped by what it's for, with a search
 * by name. After an import it highlights the new items for a few seconds
 * and scrolls the first into view.
 */
import { useEffect, useRef, useState } from "react";
import {
    CubeIcon,
    ImageIcon,
    MagnifyingGlassIcon,
    TShirtIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { Input } from "@openmarch/ui";
import clsx from "clsx";
import type { LibraryItemKind } from "@/view3d/library/protocol";
import {
    groupLibraryItems,
    type LibraryBrowserApi,
    type LibraryBrowserItem,
} from "./libraryItems";
import { useLibraryItems } from "./useLibraryItems";

/** How long new items keep their ring. */
export const HIGHLIGHT_MS = 4000;

export interface LibraryHighlight {
    itemIds: readonly string[];
    seq: number;
}

const KIND_ICONS: Record<LibraryItemKind, typeof CubeIcon> = {
    model: CubeIcon,
    artwork: ImageIcon,
    uniform: TShirtIcon,
};

export default function LibraryBrowser({
    api,
    highlight = null,
    onHighlightDone,
}: {
    api: LibraryBrowserApi;
    highlight?: LibraryHighlight | null;
    /** Called with the highlight's `seq` once its ring has faded. */
    onHighlightDone?: (seq: number) => void;
}) {
    const { t } = useTranslate();
    const [query, setQuery] = useState("");
    const { state, thumbnails } = useLibraryItems(api, highlight?.seq ?? null);
    const grid = useRef<HTMLDivElement>(null);
    const scrolledFor = useRef<number | null>(null);

    const items = state.status === "ready" ? state.items : [];
    const highlighted = new Set(highlight?.itemIds ?? []);
    const groups = groupLibraryItems(items, query);

    // Scroll the first new item into view once it's listed, then fade the
    // ring after a few seconds.
    const firstShown = highlight
        ? items.find((i) => highlighted.has(i.id))?.id
        : undefined;
    useEffect(() => {
        if (!highlight || !firstShown) return;
        if (scrolledFor.current !== highlight.seq) {
            scrolledFor.current = highlight.seq;
            setQuery(""); // a search could hide it
            requestAnimationFrame(() =>
                grid.current
                    ?.querySelector(`[data-item-id="${firstShown}"]`)
                    ?.scrollIntoView?.({
                        block: "nearest",
                        behavior: "smooth",
                    }),
            );
        }
        const timer = setTimeout(
            () => onHighlightDone?.(highlight.seq),
            HIGHLIGHT_MS,
        );
        return () => clearTimeout(timer);
    }, [highlight, firstShown, onHighlightDone]);

    return (
        <section
            className="flex min-h-0 flex-1 flex-col gap-12"
            data-testid="library-browser"
            aria-label={t("library.browser.title")}
        >
            <div className="flex items-center justify-between gap-12">
                <h5 className="text-sub text-text-subtitle font-mono uppercase">
                    <T keyName="library.browser.title" />
                </h5>
                <label className="relative flex items-center">
                    <MagnifyingGlassIcon
                        size={14}
                        className="text-text-subtitle pointer-events-none absolute left-8"
                    />
                    <Input
                        compact
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("library.browser.search")}
                        aria-label={t("library.browser.search")}
                        data-testid="library-search"
                        className="w-[12rem] pl-28"
                    />
                </label>
            </div>

            {state.status === "error" && (
                <p
                    className="text-sub text-red"
                    role="alert"
                    data-testid="library-error"
                >
                    <T
                        keyName="library.browser.loadFailed"
                        params={{ code: state.error.code }}
                    />
                </p>
            )}

            {state.status === "ready" && items.length === 0 && (
                <div
                    className="rounded-6 border-stroke text-text-subtitle flex flex-col gap-4 border border-dashed p-16 text-center"
                    data-testid="library-empty"
                >
                    <span className="text-body text-text">
                        <T keyName="library.browser.empty" />
                    </span>
                    <span className="text-sub">
                        <T keyName="library.browser.emptyHint" />
                    </span>
                </div>
            )}

            {state.status === "ready" &&
                items.length > 0 &&
                groups.length === 0 && (
                    <p
                        className="text-sub text-text-subtitle"
                        data-testid="library-no-matches"
                    >
                        <T
                            keyName="library.browser.noMatches"
                            params={{ query: query.trim() }}
                        />
                    </p>
                )}

            <div
                ref={grid}
                className="flex min-h-0 flex-1 flex-col gap-16 overflow-y-auto"
            >
                {groups.map(({ group, items: groupItems }) => (
                    <div
                        key={group}
                        className="flex flex-col gap-8"
                        data-testid={`library-group-${group}`}
                    >
                        <h6 className="text-body flex items-center gap-8">
                            <T keyName={`library.browser.groups.${group}`} />
                            <span className="text-sub text-text-subtitle font-mono">
                                {groupItems.length}
                            </span>
                        </h6>
                        <ul className="grid grid-cols-3 gap-8">
                            {groupItems.map((item) => (
                                <LibraryTile
                                    key={item.id}
                                    item={item}
                                    thumbnail={thumbnails[item.versionHash]}
                                    highlighted={highlighted.has(item.id)}
                                />
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}

function LibraryTile({
    item,
    thumbnail,
    highlighted,
}: {
    item: LibraryBrowserItem;
    thumbnail: string | undefined;
    highlighted: boolean;
}) {
    const Icon = KIND_ICONS[item.kind];
    return (
        <li
            className={clsx(
                "rounded-6 border-stroke bg-fg-2 flex min-w-0 flex-col gap-4 border p-4 transition-shadow duration-300",
                highlighted && "ring-accent ring-2",
            )}
            data-testid="library-item"
            data-item-id={item.id}
            data-highlighted={highlighted || undefined}
            title={item.name}
        >
            <div className="rounded-4 bg-bg-1 text-text-subtitle flex aspect-square items-center justify-center overflow-hidden">
                {thumbnail ? (
                    <img
                        src={thumbnail}
                        alt=""
                        className="size-full object-contain"
                        draggable={false}
                    />
                ) : (
                    <Icon size={28} />
                )}
            </div>
            <span className="text-sub truncate px-2">{item.name}</span>
        </li>
    );
}
