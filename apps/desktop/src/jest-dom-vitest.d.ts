/**
 * jest-dom's matchers on this app's own `vitest` (4.x), for files that typecheck with them
 * (`Timeline.stories.tsx`). `@testing-library/jest-dom/vitest` adds them to whichever `vitest`
 * pnpm hoists to the repo root, and other workspace packages still use vitest 3.x, so which one
 * that is depends on the lockfile.
 */
import "vitest";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
    interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
    interface AsymmetricMatchersContaining
        extends TestingLibraryMatchers<any, any> {}
}
