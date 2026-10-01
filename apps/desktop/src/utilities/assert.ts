/**
 * Asserts that a condition is true. Meant to mimic assertions in other languages.
 *
 * @param condition The condition to assert.
 * @param message The message to display if the condition is false.
 */
export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
