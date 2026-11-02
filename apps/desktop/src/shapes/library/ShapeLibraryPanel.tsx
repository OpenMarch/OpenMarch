import clsx from "clsx";
import { useEffect } from "react";
import tolgee from "@/global/singletons/Tolgee";
import {
    DownloadSimpleIcon,
    ShapesIcon,
    StarIcon,
    TrashIcon,
    XIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import ShapePreviewIcon from "../preview/ShapePreviewIcon";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { MAX_STARS, type ShapeLibraryRow } from "./shapeLibrary";
import {
    useNewerSavedShapeCount,
    useShapeLibraryRows,
    useShapeStarsStore,
} from "./shapeStars";
import { kindPickGate, pickShapeKind } from "../tool/pickKind";
import { useShapeShown } from "../tool/shapeToolStore";
import { addSavedShapeToLibrary, deleteSavedShape } from "./saveShape";
import { Tip } from "@/components/ui/Tip";

export const SHAPE_LIBRARY_CONTENT_ID = "shapes";

/** The left sidebar's Shapes entry (#352, spec #344): the shape library */
export default function ShapeLibraryModal() {
    return (
        <SidebarModalLauncher
            contents={<ShapeLibraryContents />}
            newContentId={SHAPE_LIBRARY_CONTENT_ID}
            buttonLabel={<ShapesIcon size={24} />}
            ariaLabel={tolgee.t("shapes.library.title", "Shapes")}
            testId="shape-library-tab"
        />
    );
}

/** Opens the sidebar on the shape library, as the Shapes tab's Library button does */
export function showShapeLibrary() {
    const sidebar = useSidebarModalStore.getState();
    if (sidebar.contentId !== SHAPE_LIBRARY_CONTENT_ID)
        sidebar.setContent(<ShapeLibraryContents />, SHAPE_LIBRARY_CONTENT_ID);
    sidebar.setOpen(true);
}

/**
 * The shape library: every shape by group, each with a star, an icon, a name and a note. One star
 * puts a shape in both the ring and the Shapes tab; with all {@link MAX_STARS} taken, starring
 * another asks to unstar one first. Clicking a shape picks it, as the Shapes tab does. Saved
 * shapes (#353) come as a Saved group after Basic, each with a delete button and its description
 * (#393); one only the open show has can be added to the user's library.
 */
export function ShapeLibraryContents({
    rows: rowsProp,
}: {
    /** Tests pass their own; every shape the library lists by default */
    rows?: readonly ShapeLibraryRow[];
}) {
    const { setOpen } = useSidebarModalStore();
    const libraryRows = useShapeLibraryRows();
    const rows = rowsProp ?? libraryRows;
    const newer = useNewerSavedShapeCount();
    const stars = useShapeStarsStore((s) => s.stars);
    const asking = useShapeStarsStore((s) => s.asking);
    const toggle = useShapeStarsStore((s) => s.toggle);
    const dismissAsk = useShapeStarsStore((s) => s.dismissAsk);
    const asked = rows.find((r) => r.id === asking);
    const queryClient = useQueryClient();
    const selected = useSelectedMarchers()?.selectedMarchers ?? [];
    const pick = kindPickGate(useShapeShown(), selected);
    // The question is about this visit to the library
    useEffect(() => dismissAsk, [dismissAsk]);

    const groups = [
        {
            id: "basic",
            title: tolgee.t("shapes.library.group.basic", "Basic"),
        },
        {
            id: "saved",
            title: tolgee.t("shapes.library.group.saved", "Saved"),
        },
    ] as const;

    return (
        <div
            className="animate-scale-in text-text flex h-full w-[22rem] flex-col gap-16"
            data-testid="shape-library"
        >
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    {tolgee.t("shapes.library.title", "Shapes")}
                </h4>
                <button
                    onClick={() => setOpen(false)}
                    className="hover:text-red duration-150 ease-out"
                    aria-label={tolgee.t("shapes.library.close", "Close")}
                >
                    <XIcon size={24} />
                </button>
            </header>
            <p className="text-sub text-text-subtitle">
                {tolgee.t(
                    "shapes.library.intro",
                    "Star a shape to keep it in the Shapes tab and the shape ring, up to {max}.",
                    { max: MAX_STARS },
                )}
            </p>
            {asked && (
                <div
                    role="alert"
                    className="rounded-6 border-stroke bg-fg-2 text-body flex items-start justify-between gap-8 border p-8"
                    data-testid="shape-library-full"
                >
                    <span>
                        {tolgee.t(
                            "shapes.library.full",
                            "{max} shapes are starred, as many as the ring holds. Unstar one first to star {name}.",
                            { max: MAX_STARS, name: asked.label },
                        )}
                    </span>
                    <button
                        onClick={dismissAsk}
                        className="hover:text-red duration-150 ease-out"
                        aria-label={tolgee.t(
                            "shapes.library.dismiss",
                            "Dismiss",
                        )}
                    >
                        <XIcon size={16} />
                    </button>
                </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col gap-16 overflow-y-auto">
                {groups.map(({ id, title }) => {
                    const inGroup = rows.filter((r) => r.group === id);
                    if (inGroup.length === 0 && id !== "saved") return null;
                    return (
                        <section
                            key={id}
                            className="flex flex-col gap-8"
                            data-testid={`shape-library-${id}`}
                        >
                            <h5 className="text-sub text-text-subtitle font-mono uppercase">
                                {title}
                            </h5>
                            {inGroup.length === 0 && (
                                <p
                                    className="text-sub text-text-subtitle"
                                    data-testid="shape-library-saved-empty"
                                >
                                    {tolgee.t(
                                        "shapes.library.savedEmpty",
                                        "Save a shape from its ⋯ row or the inspector to keep it here, for every show.",
                                    )}
                                </p>
                            )}
                            {id === "saved" && newer > 0 && (
                                <p
                                    className="text-sub text-text-subtitle"
                                    data-testid="shape-library-saved-newer"
                                >
                                    {tolgee.t(
                                        "shapes.library.savedNewer",
                                        "{count, plural, one {# saved shape needs} other {# saved shapes need}} a newer version of OpenMarch.",
                                        { count: newer },
                                    )}
                                </p>
                            )}
                            <ul className="flex flex-col gap-4">
                                {inGroup.map((row) => (
                                    <LibraryRow
                                        key={row.id}
                                        row={row}
                                        starred={stars.includes(row.id)}
                                        onStar={() => toggle(row.id, rows)}
                                        canPick={pick}
                                        onPick={() =>
                                            pickShapeKind(row.kind, selected)
                                        }
                                        onDelete={
                                            row.saved
                                                ? () =>
                                                      void deleteSavedShape(
                                                          row.saved!.shape,
                                                          queryClient,
                                                      )
                                                : undefined
                                        }
                                        onAddToLibrary={
                                            row.saved && !row.saved.inLibrary
                                                ? () =>
                                                      addSavedShapeToLibrary(
                                                          row.saved!.shape,
                                                      )
                                                : undefined
                                        }
                                    />
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

function LibraryRow({
    row,
    starred,
    onStar,
    canPick,
    onPick,
    onDelete,
    onAddToLibrary,
}: {
    row: ShapeLibraryRow;
    starred: boolean;
    onStar: () => void;
    /** Whether clicking the shape picks it now, and why not */
    canPick: ReturnType<typeof kindPickGate>;
    onPick: () => void;
    /** Deletes a saved shape; absent for basic kinds */
    onDelete?: () => void;
    /** Adds a saved shape only the open show has to the user's library */
    onAddToLibrary?: () => void;
}) {
    const description = row.saved?.shape.description;
    return (
        <li
            className="rounded-6 hover:bg-fg-2 group flex items-center gap-8 px-4 py-4"
            data-testid={`shape-library-row-${row.id}`}
        >
            <Tip
                label={
                    starred
                        ? tolgee.t("shapes.library.unstar", "Unstar")
                        : tolgee.t("shapes.library.star", "Star")
                }
            >
                <button
                    type="button"
                    onClick={onStar}
                    aria-pressed={starred}
                    aria-label={
                        starred
                            ? tolgee.t(
                                  "shapes.library.unstarNamed",
                                  "Unstar {name}",
                                  {
                                      name: row.label,
                                  },
                              )
                            : tolgee.t(
                                  "shapes.library.starNamed",
                                  "Star {name}",
                                  {
                                      name: row.label,
                                  },
                              )
                    }
                    className={clsx(
                        "hover:text-accent duration-150 ease-out",
                        starred ? "text-accent" : "text-text-subtitle",
                    )}
                    data-testid={`shape-library-star-${row.id}`}
                >
                    <StarIcon size={18} weight={starred ? "fill" : "regular"} />
                </button>
            </Tip>
            <Tip
                label={
                    canPick.ok
                        ? tolgee.t("shapes.library.draw", "Draw a {name}", {
                              name: row.label,
                          })
                        : canPick.reason
                }
                hint={description}
            >
                <button
                    type="button"
                    onClick={() => {
                        if (canPick.ok) onPick();
                    }}
                    // aria-disabled, not disabled: the tooltip says why it can't be drawn
                    aria-disabled={!canPick.ok || undefined}
                    className="flex min-w-0 flex-1 items-center gap-8 text-left aria-disabled:opacity-60"
                    data-testid={`shape-library-pick-${row.id}`}
                >
                    <ShapePreviewIcon
                        kind={row.kind}
                        size={22}
                        className="shrink-0"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-center gap-8">
                            <span className="text-body truncate">
                                {row.label}
                            </span>
                            {row.note && (
                                <span className="text-sub text-text-subtitle truncate">
                                    {row.note}
                                </span>
                            )}
                        </span>
                        {description && (
                            // One line here; the whole of it in the row's tooltip
                            <span
                                className="text-sub text-text-subtitle truncate"
                                data-testid={`shape-library-description-${row.id}`}
                            >
                                {description}
                            </span>
                        )}
                    </span>
                </button>
            </Tip>
            {onAddToLibrary && (
                <Tip
                    label={tolgee.t(
                        "shapes.library.addTip",
                        "Add to my Library, for every show",
                    )}
                >
                    <button
                        type="button"
                        onClick={onAddToLibrary}
                        aria-label={tolgee.t(
                            "shapes.library.addNamed",
                            "Add {name} to my Library",
                            { name: row.label },
                        )}
                        className="text-text-subtitle hover:text-accent duration-150 ease-out"
                        data-testid={`shape-library-add-${row.id}`}
                    >
                        <DownloadSimpleIcon size={16} />
                    </button>
                </Tip>
            )}
            {onDelete && (
                <Tip
                    label={tolgee.t(
                        "shapes.library.deleteTip",
                        "Delete this saved shape",
                    )}
                >
                    <button
                        type="button"
                        onClick={onDelete}
                        aria-label={tolgee.t(
                            "shapes.library.deleteNamed",
                            "Delete {name}",
                            { name: row.label },
                        )}
                        className="text-text-subtitle hover:text-red duration-150 ease-out"
                        data-testid={`shape-library-delete-${row.id}`}
                    >
                        <TrashIcon size={16} />
                    </button>
                </Tip>
            )}
        </li>
    );
}
