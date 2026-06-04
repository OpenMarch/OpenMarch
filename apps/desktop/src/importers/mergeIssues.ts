/**
 * Merge adapter-specific issues with shared validation issues,
 * deduplicating by code + setId so the same problem isn't shown twice.
 */

import type { AdapterParseResult, ImportIssue } from "./types";
import { validateManifest } from "./validate";

export function mergeIssues(parseResult: AdapterParseResult): ImportIssue[] {
    const sharedReport = validateManifest(parseResult.manifest);
    const adapterIssueKeys = new Set(
        parseResult.issues.map((i) => `${i.code}:${i.setId ?? ""}`),
    );
    return [
        ...parseResult.issues,
        ...sharedReport.issues.filter(
            (i) => !adapterIssueKeys.has(`${i.code}:${i.setId ?? ""}`),
        ),
    ];
}
