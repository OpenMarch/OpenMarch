import type MarcherPage from "@/global/classes/MarcherPage";
import type {
    PropWithMarcher,
    DatabasePropPageGeometry,
} from "@/global/classes/Prop";

/** A prop joined to its marcher_page (position) and geometry on a single page. */
export interface ResolvedProp {
    prop: PropWithMarcher;
    marcherPage: MarcherPage;
    geometry: DatabasePropPageGeometry;
}

/**
 * Joins props to their per-page marcher_page and geometry.
 *
 * The join "for each prop, find its marcher_page on this page and the geometry
 * for that marcher_page" was rebuilt independently across the codebase; this is
 * the single source of truth. Props missing either a marcher_page or a geometry
 * are skipped. Visibility and other consumer-specific filtering is left to the
 * caller.
 *
 * @param marcherPages The marcher_pages for the target page, either as an array
 *   or as a record (keyed by any value — it is re-indexed by marcher_id here).
 */
export function resolvePropsForPage({
    props,
    geometries,
    marcherPages,
}: {
    props: PropWithMarcher[];
    geometries: DatabasePropPageGeometry[];
    marcherPages: MarcherPage[] | Record<number, MarcherPage>;
}): ResolvedProp[] {
    const marcherPageList = Array.isArray(marcherPages)
        ? marcherPages
        : Object.values(marcherPages);
    const marcherPageByMarcherId = new Map(
        marcherPageList.map((mp) => [mp.marcher_id, mp]),
    );
    const geometryByMarcherPageId = new Map(
        geometries.map((g) => [g.marcher_page_id, g]),
    );

    const resolved: ResolvedProp[] = [];
    for (const prop of props) {
        const marcherPage = marcherPageByMarcherId.get(prop.marcher_id);
        if (!marcherPage) continue;
        const geometry = geometryByMarcherPageId.get(marcherPage.id);
        if (!geometry) continue;
        resolved.push({ prop, marcherPage, geometry });
    }
    return resolved;
}
