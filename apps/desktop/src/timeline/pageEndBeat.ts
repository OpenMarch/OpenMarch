/**
 * Page and beat mapping shared by the renderer and the page converter. Pure, with no renderer or
 * store imports, so the converter can run outside the renderer (main process, P9.3).
 */

/**
 * The resolver beat at which a page's marcher_pages positions sit: the end of the page.
 *
 * A page covers the beats from its start beat up to the next page's start beat (`Page.beats`, from
 * `fromDatabasePages`), and its marcher_pages row is where marchers are when those beats are done
 * (the page-mode keyframe is at `(page.timestamp + page.duration) * 1000`). In resolver beats,
 * page N's move spans `[first.index, last.index + 1)`, so its end beat is `last.index + 1`: the
 * start beat of the next page, or the end of the show for the last page. The first page holds only
 * the fixed zero-length beat 0, so its end beat is 1, which is show time 0. A page with no beats
 * (not produced by `fromDatabasePages`) maps to beat 0.
 */
export function pageEndBeat(page: {
    readonly beats: readonly { readonly index: number }[];
}): number {
    const last = page.beats[page.beats.length - 1];
    return last ? last.index + 1 : 0;
}
