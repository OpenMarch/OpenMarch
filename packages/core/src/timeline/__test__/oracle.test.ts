/**
 * Golden vectors G1-G13 and G8b (spec 12.4, ported from ref/golden.mjs),
 * QA-FL-01..06 (spec 12.3) and the section 8.9 diagnostics against the
 * reference oracle. The fixtures and checks are shared with the resolver
 * tests (`goldenSuite.ts`). The fuller suites (QA-DG, QA-REG, properties) are
 * separate work packages.
 */
import { createOracle } from "../oracle";
import { runGoldenSuite } from "./goldenSuite";

runGoldenSuite("oracle", createOracle);
