import { schema } from "../database/db";
import { getSectionObjectByName } from "./Sections";

type Marcher = typeof schema.marchers.$inferSelect;
export default Marcher;

/**
 * Compares a marcher to another marcher based on their section and drill order.
 *
 * If the sections are different, the comparison is based on the section's compareTo method.
 * If the sections are the same, the comparison is based on the drill order.
 *
 * @param a - The first marcher to compare.
 * @param b - The second marcher to compare.
 * @returns The difference between the section and drill order of this marcher and the other marcher.
 */
export const compare = (a: Marcher, b: Marcher): number => {
    const aSectionObject = getSectionObjectByName(a.section);
    const bSectionObject = getSectionObjectByName(b.section);
    const sectionComparison = aSectionObject.compareTo(bSectionObject);
    if (sectionComparison !== 0)
        // If the sections are different, return the section comparison, ignoring the drill order
        return sectionComparison;
    // If the sections are the same, return the drill order comparison
    else return a.drill_order - b.drill_order;
};
