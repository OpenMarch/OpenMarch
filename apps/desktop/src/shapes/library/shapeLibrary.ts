import tolgee from "@/global/singletons/Tolgee";
import {
    MODE_LABELS,
    storedDistribution,
    type DistributionMode,
    type Fraction,
} from "../distribute/distribution";
import { FRACTIONS, formatSteps } from "../editor/format";
import { RING_SLOTS, type RingShape } from "../tool/ringMachine";
import type { ShapeToolEntry } from "../tool/shapeTools";
import { toolId } from "../tool/toolKind";
import type { SavedShape } from "./savedShapes";

/** The most shapes that can be starred: one star puts a shape in the ring, which holds this many */
export const MAX_STARS = RING_SLOTS;

/**
 * A shape the library lists (#352, spec #344): a star, a picture, a name and a note. Basic rows are
 * the kinds that can be drawn; saved shapes (#353) join them as a Saved group.
 */
export interface ShapeLibraryRow extends RingShape {
    readonly group: "basic" | "saved";
    /** What sets it apart, such as "2 apart"; null for nothing to say */
    readonly note: string | null;
    /**
     * A saved shape's own record, and whether it's in the user's library or only in the open
     * show; absent for basic kinds
     */
    readonly saved?: {
        readonly shape: SavedShape;
        readonly inLibrary: boolean;
    };
}

/** How far apart the spots are, in steps: "2 apart", "2 × 4 apart"; null for no spacing */
export function intervalNote(steps: readonly number[]): string | null {
    if (steps.length === 0) return null;
    const shown = steps.map(formatSteps);
    const same = shown.every((s) => s === shown[0]);
    return tolgee.t("shapes.library.note.apart", "{spacing} apart", {
        spacing: same ? shown[0]! : shown.join(" × "),
    });
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** A stagger as words: "stagger ½", "stagger ⅓ left"; null for none */
function staggerNote([p, q]: Fraction): string | null {
    if (p === 0) return null;
    const d = gcd(Math.abs(p), q);
    const plain = `${Math.abs(p) / d}/${q / d}`;
    const fraction = FRACTIONS[plain] ?? plain;
    return p < 0
        ? tolgee.t(
              "shapes.library.note.staggerLeft",
              "stagger {fraction} left",
              {
                  fraction,
              },
          )
        : tolgee.t("shapes.library.note.stagger", "stagger {fraction}", {
              fraction,
          });
}

/**
 * How a shape is spaced and filled: the spacing, then a Files stagger ("2 apart, stagger ½"), or
 * the mode first for Outline and Spread ("Spread 2 apart"). `distribution` is a recipe's or a
 * saved shape's; none, or one this version doesn't read, is plain Files.
 */
export function spacingNote(
    steps: readonly number[],
    distribution?: { readonly mode: string } | null,
): string | null {
    const spacing = intervalNote(steps);
    const d = distribution
        ? storedDistribution({ distribution }, 1)
        : undefined;
    if (!d) return spacing;
    if (d.mode !== "files") {
        const mode = MODE_LABELS[d.mode as DistributionMode];
        return spacing
            ? tolgee.t("shapes.library.note.modeSpacing", "{mode} {spacing}", {
                  mode,
                  spacing,
              })
            : mode;
    }
    return [spacing, staggerNote(d.stagger)].filter(Boolean).join(", ") || null;
}

/** Every basic kind, in the Shapes tab's order, noted with its default spacing */
export function basicShapeRows(
    tools: readonly ShapeToolEntry[],
): ShapeLibraryRow[] {
    // Getters: the rows are made once, and the words follow the app's language
    return tools.map(({ kind }) => ({
        id: toolId(kind),
        group: "basic",
        get label() {
            return kind.shape.label;
        },
        kind,
        get note() {
            return intervalNote(
                kind.params.flatMap((p) =>
                    p.interval && p.default !== undefined ? [p.default] : [],
                ),
            );
        },
    }));
}

/** The starred shapes in the order they were starred, leaving out shapes that are gone */
export function starredRows(
    stars: readonly string[],
    rows: readonly ShapeLibraryRow[],
): ShapeLibraryRow[] {
    return stars.flatMap((id) => rows.find((r) => r.id === id) ?? []);
}

/**
 * Stars or unstars shape `id`. Starring when {@link MAX_STARS} shapes in `rows` are starred
 * changes nothing and says it's full, so the user unstars one first; stars on shapes that are gone
 * don't count.
 */
export function toggleStar(
    stars: readonly string[],
    id: string,
    rows: readonly ShapeLibraryRow[],
): { readonly stars: string[] } | { readonly full: true } {
    if (stars.includes(id)) return { stars: stars.filter((s) => s !== id) };
    if (starredRows(stars, rows).length >= MAX_STARS) return { full: true };
    return { stars: [...stars, id] };
}
