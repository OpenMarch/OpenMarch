/**
 * QA-REG-6, the CI-sized version: deep chains resolve cold, with no recursion
 * in pull-compile or the dirty walk. Vitest workers don't take
 * `--stack-size`, so this runs the full 20,000-link chains on the default
 * stack. A recursive pull-compile or dirty walk overflowed at about 5,000 links
 * there (spec Appendix E), so this still catches recursion coming back. The
 * run on `node --stack-size=300` is `pnpm --dir packages/core run test:deep`
 * (scripts/deep-chains.mjs).
 *
 * The recursive oracle is not used here: it overflows on deep chains by
 * design (spec 9.3).
 */
import { describe, expect, it } from "vitest";
import { runDeepChains } from "../../../scripts/deep-chains.mjs";
import { createResolver } from "..";

describe("deep chains (QA-REG-6, CI size)", () => {
    // This checks for recursion, not speed. It takes about 3.5 s alone in CI
    // and twice that while the desktop tests share the runner, past Vitest's
    // 5 s default, so it gets room.
    it(
        "20,000 direct, the same after editing the first shape, and 5,000 FTL",
        { timeout: 30_000 },
        () => {
            const results = runDeepChains(createResolver, 20000);
            expect(results).toHaveLength(3);
            for (const r of results) expect(r.ok, r.message).toBe(true);
        },
    );
});
