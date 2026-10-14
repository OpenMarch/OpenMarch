import type { SpanInfo } from "@openmarch/core";
import { keptStateOf, type KeptPageBox } from "./timelineKept";

/**
 * Keep later pages in timeline mode (docs/timeline/ui.md UI-18; defined-coordinates 10, owner
 * decision 2026-10-09): which page boxes the selected marchers follow into and where they were
 * kept, for the chains on the page boxes, the inspector line, the page box menu and **K**. Pure:
 * works over each marcher's resolver spans and the stored kept markers
 * (`readKeptAssignmentIds`); the commands are `keepMarchersOnPage` and `followAgainOnPage`.
 *
 * A marcher **follows** on a box where it has no move of its own (`KeptState` "follows"): an
 * edit of the page it last moved on carries into the box. Before its first move it holds from the
 * start, and follows that too, so it can be kept ahead of any move (wp19, after the final study:
 * a pre-emptive keep). It is **kept** where its only move over the box is a stored kept spot.
 */

/** A page with its flag and box (`pageFlags`), and its name as the app shows it. */
export interface KeepPage {
    readonly id: number;
    readonly name: string;
    /** The page's flag; 0 for home */
    readonly flag: number;
    /** The page's box; `null` for home */
    readonly range: KeptPageBox | null;
}

/** The selection's keep state on one page box. */
export interface PageKeepState {
    readonly pageId: number;
    readonly pageName: string;
    readonly box: KeptPageBox;
    /** The selected marchers that follow into the box (no move of their own there), ascending */
    readonly follows: number[];
    /** Those of `follows` that haven't moved yet: they hold from the start, ascending */
    readonly fromStart: number[];
    /** The selected marchers with a kept spot over the box, ascending */
    readonly kept: number[];
    /**
     * The pages those marchers follow (or would follow again) into the box: where each last moved
     * before it, in page order. Empty when they'd hold from the start.
     */
    readonly from: string[];
    /** How many marchers are selected */
    readonly selected: number;
}

type Row = { id: number; marcher: number; start: number; end: number };

/** A marcher's moves (its spans that aren't holds), as the rows `keptStateOf` reads. */
export function movesFromSpans(spans: readonly SpanInfo[]): Row[] {
    return spans.flatMap((s) =>
        s.kind === "hold" || s.assignmentId === null
            ? []
            : [
                  {
                      id: s.assignmentId,
                      marcher: s.marcherId,
                      start: s.start,
                      end: s.end,
                  },
              ],
    );
}

/** The page whose box holds `beat` (start, flag], by index into `pages`; -1 for none. */
const pageAt = (pages: readonly KeepPage[], beat: number): number =>
    pages.findIndex((p) => p.range && beat > p.range.start && beat <= p.flag);

/** The first index in ascending `values` above `target` (or at least it, `orEqual`). */
const firstAbove = (
    values: readonly number[],
    target: number,
    orEqual = false,
): number => {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        const value = values[mid]!;
        if (value < target || (!orEqual && value === target)) low = mid + 1;
        else high = mid;
    }
    return low;
};

/**
 * `pageAt` by binary search over the page boxes (which don't overlap): the same answers in
 * O(log pages) per lookup, for `pageKeepStates` over every box.
 */
const pageLookup = (pages: readonly KeepPage[]) => {
    const boxed = pages.flatMap((p, index) =>
        p.range ? [{ start: p.range.start, flag: p.flag, index }] : [],
    );
    boxed.sort((a, b) => a.start - b.start);
    const starts = boxed.map((b) => b.start);
    return (beat: number): number => {
        // The last box starting before `beat`
        const box = boxed[firstAbove(starts, beat, true) - 1];
        return box && beat <= box.flag ? box.index : -1;
    };
};

/**
 * One marcher's moves indexed by end, so each box finds the moves over it and the last move
 * before it by binary search (`pageKeepStates` over every box, pre-merge review): the same rows,
 * in the same order, as filtering every move per box.
 */
const indexMoves = (rows: readonly Row[]) => {
    // Stable: equal ends keep their order, so the first of them is the one `lastMoveBefore` keeps
    const byEnd = rows
        .map((row, order) => ({ row, order }))
        .sort((a, b) => a.row.end - b.row.end);
    const ends = byEnd.map((m) => m.row.end);
    // The smallest start from each index on, so the scan over a box can stop early
    const minStartFrom = new Array<number>(byEnd.length + 1).fill(Infinity);
    for (let i = byEnd.length - 1; i >= 0; i--)
        minStartFrom[i] = Math.min(byEnd[i]!.row.start, minStartFrom[i + 1]!);
    return {
        /** Its rows that cover any beat of `box`, in their original order */
        over: (box: KeptPageBox): Row[] => {
            const found: { row: Row; order: number }[] = [];
            for (
                let i = firstAbove(ends, box.start);
                i < byEnd.length && minStartFrom[i]! < box.end;
                i++
            )
                if (byEnd[i]!.row.start < box.end) found.push(byEnd[i]!);
            return found.sort((a, b) => a.order - b.order).map((m) => m.row);
        },
        /** `lastMoveBefore(rows, box)` */
        before: (box: KeptPageBox): Row | null => {
            let i = firstAbove(ends, box.start) - 1;
            if (i < 0) return null;
            while (i > 0 && ends[i - 1] === ends[i]) i--;
            return byEnd[i]!.row;
        },
    };
};

/**
 * The selection's keep state on every page box, in page order (home has none). Each marcher's
 * moves are indexed once, so it costs about O(boxes × marchers × log moves).
 *
 * @param spansOf a marcher's resolver spans (`resolverSpans`)
 * @param kept the kept assignments' ids
 */
export function pageKeepStates({
    pages,
    marcherIds,
    spansOf,
    kept,
}: {
    pages: readonly KeepPage[];
    marcherIds: readonly number[];
    spansOf: (marcherId: number) => readonly SpanInfo[];
    kept: ReadonlySet<number>;
}): PageKeepState[] {
    const ids = [...new Set(marcherIds)].sort((a, b) => a - b);
    const moves = new Map(
        ids.map((id) => [id, indexMoves(movesFromSpans(spansOf(id)))]),
    );
    const sourceOf = pageLookup(pages);
    const out: PageKeepState[] = [];
    for (const page of pages) {
        const box = page.range;
        if (!box) continue;
        const follows: number[] = [];
        const fromStart: number[] = [];
        const keptHere: number[] = [];
        const fromPages = new Set<number>();
        for (const id of ids) {
            const indexed = moves.get(id)!;
            const state = keptStateOf(indexed.over(box), box, kept);
            if (state !== "follows" && state !== "kept") continue;
            const before = indexed.before(box);
            (state === "follows" ? follows : keptHere).push(id);
            if (state === "follows" && !before) fromStart.push(id);
            const source = before ? sourceOf(before.end) : -1;
            if (source >= 0) fromPages.add(source);
        }
        out.push({
            pageId: page.id,
            pageName: page.name,
            box: { start: box.start, end: box.end },
            follows,
            fromStart,
            kept: keptHere,
            from: [...fromPages]
                .sort((a, b) => a - b)
                .map((i) => pages[i]!.name),
            selected: ids.length,
        });
    }
    return out;
}

/** A marcher's last move that ends by the start of `box`, or null before its first move. */
const lastMoveBefore = (rows: readonly Row[], box: KeptPageBox): Row | null =>
    rows
        .filter((r) => r.end <= box.start)
        .reduce<Row | null>(
            (last, r) => (last && last.end >= r.end ? last : r),
            null,
        );

/** A marcher kept on a page box, as the field marks it (`keptMarchersOnPage`). */
export interface KeptOnPage {
    readonly marcherId: number;
    /** The page it would follow again (where it last moved before the box); null for the start */
    readonly from: string | null;
}

/**
 * The marchers kept on the page `pageId` (a stored kept spot is their only move over its box),
 * whatever is selected, ascending by id, for the marks beside their dots on the field (UI-18 kept
 * marchers on the field, wp20). Empty for home, an unknown page, or no kept spots at all, which
 * skips reading anyone's spans.
 *
 * @param spansOf a marcher's resolver spans (`resolverSpans`)
 * @param kept the kept assignments' ids
 */
export function keptMarchersOnPage({
    pages,
    pageId,
    marcherIds,
    spansOf,
    kept,
}: {
    pages: readonly KeepPage[];
    pageId: number | null | undefined;
    marcherIds: readonly number[];
    spansOf: (marcherId: number) => readonly SpanInfo[];
    kept: ReadonlySet<number>;
}): KeptOnPage[] {
    if (kept.size === 0 || pageId == null) return [];
    const box = pages.find((p) => p.id === pageId)?.range;
    if (!box) return [];
    const out: KeptOnPage[] = [];
    for (const id of [...new Set(marcherIds)].sort((a, b) => a - b)) {
        const rows = movesFromSpans(spansOf(id));
        const over = rows.filter((r) => r.start < box.end && r.end > box.start);
        if (keptStateOf(over, box, kept) !== "kept") continue;
        const before = lastMoveBefore(rows, box);
        const source = before ? pageAt(pages, before.end) : -1;
        out.push({
            marcherId: id,
            from: source >= 0 ? pages[source]!.name : null,
        });
    }
    return out;
}

/**
 * A kept mark's tooltip on the field: "Kept on Page 3 · won't follow Page 2", or "won't follow
 * earlier pages" when it would hold from the start.
 */
export function keptMarkText(
    page: string,
    from: string | null,
    t: KeepTranslate = english,
): string {
    return from
        ? t(
              "timeline.keep.field.kept",
              "Kept on Page {page} · won't follow Page {from}",
              { page, from },
          )
        : t(
              "timeline.keep.field.keptEarlier",
              "Kept on Page {page} · won't follow earlier pages",
              { page },
          );
}

/** The index into `states` of the box after the page `pageId` (home's is the first box). */
const nextBoxIndex = (
    states: readonly PageKeepState[],
    pageId: number,
    homePageId: number | null,
): number => {
    const current = states.findIndex((s) => s.pageId === pageId);
    if (current >= 0) return current + 1;
    return pageId === homePageId ? 0 : -1;
};

/**
 * The later pages that follow the selection from the page `currentPageId` (an edit there carries
 * into them): for each marcher, the boxes right after it, in a row, that it follows into, in page
 * order. `all` says whether every selected marcher follows into every one of them. Null for none.
 * Marchers that haven't moved yet don't count (lead default, wp19): every later page follows
 * them, which says nothing on a fresh show.
 */
export function followingPages(
    states: readonly PageKeepState[],
    currentPageId: number,
    homePageId: number | null = null,
): { names: string[]; all: boolean } | null {
    const first = nextBoxIndex(states, currentPageId, homePageId);
    if (first < 0 || first >= states.length) return null;
    const selected = states[first]!.selected;
    const names: string[] = [];
    let all = true;
    const moved = (s: PageKeepState) => {
        const start = new Set(s.fromStart);
        return s.follows.filter((id) => !start.has(id));
    };
    let still = new Set(moved(states[first]!));
    for (let i = first; i < states.length && still.size > 0; i++) {
        const here = new Set(moved(states[i]!));
        still = new Set([...still].filter((id) => here.has(id)));
        if (still.size === 0) break;
        names.push(states[i]!.pageName);
        if (still.size !== selected) all = false;
    }
    return names.length === 0 ? null : { names, all };
}

/** "Page 3" or "Pages 3–4" (first to last of `names`, in page order). */
export function pagesText(names: readonly string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return `Page ${names[0]}`;
    return `Pages ${names[0]}–${names[names.length - 1]}`;
}

/** A translate function, as Tolgee's `t` with a default value. */
export type KeepTranslate = (
    key: string,
    defaultValue: string,
    params?: Record<string, string>,
) => string;

const english: KeepTranslate = (_key, defaultValue, params) =>
    defaultValue.replace(
        /\{(\w+)\}/g,
        (_, name: string) => params?.[name] ?? "",
    );

/** A marcher's name as the app shows it (its drill number), or undefined when unknown. */
export type MarcherNameOf = (marcherId: number) => string | undefined;

/** How many names the words list before they count the rest ("OT1, OT2 and 4 others"). */
export const NAMES_SHOWN = 3;

/** The marchers' names in drill order, or null when some aren't known. */
const namesOf = (
    ids: readonly number[],
    nameOf: MarcherNameOf | undefined,
): string[] | null => {
    if (!nameOf || ids.length === 0) return null;
    const names = ids.map(nameOf);
    if (names.some((n) => !n)) return null;
    return (names as string[]).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
    );
};

/**
 * The marchers by name for the keep words (wp19, after the final study): "OT1", "OT1 and OT8",
 * "OT1, OT2 and OT3", then "OT1, OT2 and 4 others". Null when a name isn't known, so the words
 * fall back to a count.
 */
export function marcherNamesText(
    ids: readonly number[],
    nameOf: MarcherNameOf | undefined,
    t: KeepTranslate = english,
): string | null {
    const names = namesOf(ids, nameOf);
    if (!names) return null;
    const [first, second, third] = names;
    if (names.length === 1) return first!;
    if (names.length === 2)
        return t("timeline.keep.names.two", "{first} and {second}", {
            first: first!,
            second: second!,
        });
    if (names.length === NAMES_SHOWN)
        return t("timeline.keep.names.three", "{first}, {second} and {third}", {
            first: first!,
            second: second!,
            third: third!,
        });
    return t(
        "timeline.keep.names.many",
        "{first}, {second} and {count} others",
        {
            first: first!,
            second: second!,
            count: String(names.length - 2),
        },
    );
}

/** The names as a list for after a count ("OT1, OT8"); past three, as `marcherNamesText`. */
const namesList = (
    ids: readonly number[],
    nameOf: MarcherNameOf | undefined,
    t: KeepTranslate,
): string | null => {
    const names = namesOf(ids, nameOf);
    if (!names) return null;
    return names.length <= NAMES_SHOWN
        ? names.join(", ")
        : marcherNamesText(ids, nameOf, t);
};

/** What a chain on a page box shows. */
export type PageChainKind = "follows" | "kept" | "mixed";

/** A page box's chain: how it looks, its words, and whom a click changes. */
export interface PageChainWords {
    readonly kind: PageChainKind;
    readonly label: string;
    readonly hint: string;
    /**
     * The label for a box too narrow for its chain, whose words send you to the page's menu (a
     * click on the box selects it): it names whom the menu changes, as `keepHereMenu` keeps every
     * selected marcher that follows, not-yet-moved ones too (so does **K**). The same as `label`
     * when they have all moved.
     */
    readonly menuLabel: string;
    /** The hint for that box: what the page's menu does, for the marchers `menuLabel` names */
    readonly menuHint: string;
    /** A click keeps these marchers (follows, mixed) or lets them follow again (kept) */
    readonly action: "keep" | "follow";
    readonly marcherIds: readonly number[];
    /** How many are kept, for a mixed chain's badge */
    readonly keptCount: number;
}

/** A chain's words for one set of marchers */
type ChainText = Pick<PageChainWords, "label" | "hint" | "menuHint">;

/**
 * A linked chain's words: what is true now (they hold where a page left them, so changes to that
 * page carry here), then what a click does (keeps them here). Owner, 2026-10-12: say what happens
 * now first, not only what a click would do.
 */
const followsWords = (
    follows: readonly number[],
    page: string,
    fromPage: string | null,
    t: KeepTranslate,
    nameOf: MarcherNameOf | undefined,
): ChainText => {
    const one = follows.length === 1;
    const names = marcherNamesText(follows, nameOf, t);
    const where = fromPage
        ? t("timeline.keep.chain.wherePage", "where Page {from} left", {
              from: fromPage,
          })
        : t("timeline.keep.chain.whereEarlier", "where earlier pages left");
    const label = names
        ? one
            ? t(
                  "timeline.keep.chain.followsNamedOne",
                  "{names} holds {where} it",
                  { names, where },
              )
            : t(
                  "timeline.keep.chain.followsNamed",
                  "{names} hold {where} them",
                  { names, where },
              )
        : one
          ? t("timeline.keep.chain.followsOne", "1 marcher holds {where} it", {
                where,
            })
          : t(
                "timeline.keep.chain.follows",
                "{count} marchers hold {where} them",
                { count: String(follows.length), where },
            );
    const changes = fromPage
        ? t("timeline.keep.chain.changesPage", "Changes to Page {from}", {
              from: fromPage,
          })
        : t("timeline.keep.chain.changesEarlier", "Changes to earlier pages");
    return {
        label,
        hint: one
            ? t(
                  "timeline.keep.chain.followsHintOne",
                  "{changes} carry onto Page {page}. Click to keep it here instead",
                  { changes, page },
              )
            : t(
                  "timeline.keep.chain.followsHint",
                  "{changes} carry onto Page {page}. Click to keep them here instead",
                  { changes, page },
              ),
        menuHint: one
            ? t(
                  "timeline.keep.chain.followsMenuHintOne",
                  "{changes} carry onto Page {page}. Right-click the page to keep it here instead",
                  { changes, page },
              )
            : t(
                  "timeline.keep.chain.followsMenuHint",
                  "{changes} carry onto Page {page}. Right-click the page to keep them here instead",
                  { changes, page },
              ),
    };
};

/** A kept chain's words: who is kept (now), then that a click lets them follow again. */
const keptWords = (
    kept: readonly number[],
    page: string,
    fromPage: string | null,
    t: KeepTranslate,
    nameOf: MarcherNameOf | undefined,
): ChainText => {
    const names = marcherNamesText(kept, nameOf, t);
    return {
        label: names
            ? t(
                  "timeline.keep.chain.keptNamed",
                  "{names} kept on Page {page}",
                  {
                      names,
                      page,
                  },
              )
            : kept.length === 1
              ? t(
                    "timeline.keep.chain.keptOne",
                    "1 marcher kept on Page {page}",
                    { page },
                )
              : t(
                    "timeline.keep.chain.kept",
                    "{count} marchers kept on Page {page}",
                    { page, count: String(kept.length) },
                ),
        hint: fromPage
            ? t(
                  "timeline.keep.chain.keptHint",
                  "Changes to Page {from} stop here. Click to follow Page {from} again",
                  { from: fromPage },
              )
            : t(
                  "timeline.keep.chain.keptHintEarlier",
                  "Changes to earlier pages stop here. Click to follow them again",
              ),
        menuHint: fromPage
            ? t(
                  "timeline.keep.chain.keptMenuHint",
                  "Changes to Page {from} stop here. Right-click the page to follow Page {from} again",
                  { from: fromPage },
              )
            : t(
                  "timeline.keep.chain.keptMenuHintEarlier",
                  "Changes to earlier pages stop here. Right-click the page to follow them again",
              ),
    };
};

/**
 * A mixed chain's words: how many of the selection are kept, by name, and that the rest follow;
 * then what a click does (keeps the rest). Counts the selected marchers only.
 */
const mixedWords = (
    follows: readonly number[],
    kept: readonly number[],
    page: string,
    t: KeepTranslate,
    nameOf: MarcherNameOf | undefined,
): ChainText => {
    const counts = {
        page,
        kept: String(kept.length),
        total: String(kept.length + follows.length),
    };
    const one = kept.length === 1;
    const names = namesList(kept, nameOf, t);
    const label = names
        ? one
            ? t(
                  "timeline.keep.chain.mixedNamedOne",
                  "1 of the {total} selected is kept on Page {page} ({names})",
                  { ...counts, names },
              )
            : t(
                  "timeline.keep.chain.mixedNamed",
                  "{kept} of the {total} selected are kept on Page {page} ({names})",
                  { ...counts, names },
              )
        : one
          ? t(
                "timeline.keep.chain.mixedOne",
                "1 of the {total} selected is kept on Page {page}",
                counts,
            )
          : t(
                "timeline.keep.chain.mixed",
                "{kept} of the {total} selected are kept on Page {page}",
                counts,
            );
    return {
        label,
        hint:
            follows.length === 1
                ? t(
                      "timeline.keep.chain.mixedRestHintOne",
                      "The other one follows earlier pages. Click to keep it here too",
                  )
                : t(
                      "timeline.keep.chain.mixedRestHint",
                      "The other {count} follow earlier pages. Click to keep them here too",
                      { count: String(follows.length) },
                  ),
        menuHint:
            follows.length === 1
                ? t(
                      "timeline.keep.chain.mixedRestMenuHintOne",
                      "The other one follows earlier pages. Right-click the page to keep it here too",
                  )
                : t(
                      "timeline.keep.chain.mixedRestMenuHint",
                      "The other {count} follow earlier pages. Right-click the page to keep them here too",
                      { count: String(follows.length) },
                  ),
    };
};

/**
 * A page box's chain for the selection, or null where none follows into it after a move or was
 * kept there:
 * linked where they follow (a click keeps them), broken where they were kept (a click lets them
 * follow again), and for a mix the count kept (a click keeps the rest). The words name whom a
 * click changes (by name up to three, `marcherNamesText`), so a click on a group's chain never
 * surprises (the study's selection trap).
 */
export function pageChainWords(
    state: PageKeepState,
    t: KeepTranslate = english,
    nameOf?: MarcherNameOf,
): PageChainWords | null {
    const { kept, pageName: page, from } = state;
    // Marchers that haven't moved yet get no chain (lead, wp19): every box would show one. They
    // keep the other ways in (the inspector, the menu, K), and a kept one still shows kept
    const start = new Set(state.fromStart);
    const follows = state.follows.filter((id) => !start.has(id));
    if (follows.length === 0 && kept.length === 0) return null;
    const fromPage = from.length === 1 ? from[0]! : null;
    // The page's menu keeps the not-yet-moved ones too, so a narrow box's words count them (and
    // name no one page: those hold from the start)
    const all = state.follows;
    const menuToo = all.length > follows.length;
    if (kept.length === 0)
        return {
            kind: "follows",
            ...withMenu(
                followsWords(follows, page, fromPage, t, nameOf),
                menuToo && followsWords(all, page, null, t, nameOf),
            ),
            action: "keep",
            marcherIds: follows,
            keptCount: 0,
        };
    // The menu's Follow lets go exactly the kept ones, as the kept chain does
    if (follows.length === 0)
        return {
            kind: "kept",
            ...withMenu(keptWords(kept, page, fromPage, t, nameOf), false),
            action: "follow",
            marcherIds: kept,
            keptCount: kept.length,
        };
    return {
        kind: "mixed",
        ...withMenu(
            mixedWords(follows, kept, page, t, nameOf),
            menuToo && mixedWords(all, kept, page, t, nameOf),
        ),
        action: "keep",
        marcherIds: follows,
        keptCount: kept.length,
    };
}

/** A chain's words, with a narrow box's from `menu`'s marchers where they differ (`menuLabel`). */
const withMenu = (
    words: ChainText,
    menu: ChainText | false,
): Pick<PageChainWords, "label" | "hint" | "menuLabel" | "menuHint"> => ({
    label: words.label,
    hint: words.hint,
    menuLabel: (menu || words).label,
    menuHint: (menu || words).menuHint,
});

/** What **K** does: keep or let follow again these marchers on this page box. */
export interface KeepToggle {
    readonly action: "keep" | "follow";
    readonly pageId: number;
    readonly box: KeptPageBox;
    readonly marcherIds: number[];
}

/** On one box: keep the ones that follow, or, when none does, let the kept ones follow again. */
const toggleOn = (state: PageKeepState | undefined): KeepToggle | null => {
    if (!state) return null;
    const { pageId, box } = state;
    if (state.follows.length > 0)
        return { action: "keep", pageId, box, marcherIds: state.follows };
    if (state.kept.length > 0)
        return { action: "follow", pageId, box, marcherIds: state.kept };
    return null;
};

/**
 * What **K** does from the page `currentPageId` (wp19, after the final study: K on page 3 kept
 * page 4). Where some selected marchers hold on the current page (they follow, or were kept
 * there), it toggles keep there, for those; where they all move on it (an own move ending there)
 * it toggles keep on the next page. Toggling keeps the ones that follow, or, when none does, lets
 * the kept ones follow again. Null when neither page has anything to toggle.
 */
export function keepToggle(
    states: readonly PageKeepState[],
    currentPageId: number,
    homePageId: number | null,
): KeepToggle | null {
    const here = toggleOn(states.find((s) => s.pageId === currentPageId));
    if (here) return here;
    return toggleOn(states[nextBoxIndex(states, currentPageId, homePageId)]);
}
