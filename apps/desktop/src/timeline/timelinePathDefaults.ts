/**
 * Path defaults shared by the timeline's writes (`db-functions`) and its editors, with no imports,
 * so either can use them without depending on the other.
 */

/** The bulge a transition gets when it becomes an arc (the largest legal one is `MAX_ABS_BULGE`). */
export const DEFAULT_BULGE = 0.25;
