/* eslint-disable no-console -- a command-line check: it reports what it found */
// Which user guide pages a change may affect, from the files it changes.
//
//   node apps/website/scripts/docs-impact.mjs [--base origin/main] [--markdown]
//
// Compares HEAD (and uncommitted changes) with the merge base of --base, then lists:
// - pages whose `covers` names a changed file or folder,
// - pages that use a changed or removed label (<Ui k> or an `i18n:` cover),
// - pages that use a changed or removed shortcut (<Kbd action> or an `action:` cover),
// - whether the change touches what users see but no guide page or recorded media.
// Prints a report; exits 0 always (it advises, it doesn't block). --markdown prints the
// PR comment that CI posts.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const REPO = path.resolve(WEBSITE, "../..");
const DOCS = path.join(WEBSITE, "src/content/docs");
const args = process.argv.slice(2);
const base = args.includes("--base")
    ? args[args.indexOf("--base") + 1]
    : "origin/main";
const markdown = args.includes("--markdown");

const git = (...a) =>
    execFileSync("git", a, {
        cwd: REPO,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
const mergeBase = git("merge-base", base, "HEAD").trim();
const changed = [
    ...new Set(
        [
            git("diff", "--name-only", mergeBase),
            git("diff", "--name-only", "HEAD"),
        ]
            .join("\n")
            .split("\n")
            .filter(Boolean),
    ),
];

/** Files whose change can change what users see. Tests and stories don't count. */
const USER_VISIBLE = [
    /^apps\/desktop\/src\/(?!.*(__test__|\.test\.|\.spec\.|\.stories\.)).*\.(tsx?|css)$/,
    /^apps\/desktop\/electron\/main\/application-menu\.ts$/,
    /^apps\/desktop\/i18n\/en\.json$/,
    /^packages\/ui\/src\//,
];
const userVisible = changed.filter((f) => USER_VISIBLE.some((r) => r.test(f)));
const guideChanged = changed.filter(
    (f) =>
        f.startsWith("apps/website/src/content/docs/guides/") ||
        f.startsWith("apps/website/src/content/docs/troubleshooting/") ||
        f.startsWith("apps/website/public/docs/media/"),
);

/** Leaf keys of a nested object, as dotted paths. */
function leaves(obj, prefix = "", out = new Map()) {
    for (const [k, v] of Object.entries(obj ?? {})) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") leaves(v, p, out);
        else out.set(p, v);
    }
    return out;
}
function atBase(file) {
    try {
        return JSON.parse(git("show", `${mergeBase}:${file}`));
    } catch {
        return {};
    }
}
const readJson = (file) =>
    fs.existsSync(path.join(REPO, file))
        ? JSON.parse(fs.readFileSync(path.join(REPO, file), "utf8"))
        : {};

// Labels that changed or went away
const changedKeys = new Set();
if (changed.includes("apps/desktop/i18n/en.json")) {
    const before = leaves(atBase("apps/desktop/i18n/en.json"));
    const after = leaves(readJson("apps/desktop/i18n/en.json"));
    for (const [k, v] of before) if (after.get(k) !== v) changedKeys.add(k);
}
// Shortcuts and action labels that changed (generated from the app; CI keeps it current)
const ACTIONS = "apps/website/src/data/generated/actions.json";
const changedActions = new Set();
{
    const before = atBase(ACTIONS);
    const after = readJson(ACTIONS);
    // A base from before the file existed has nothing to compare with
    if (Object.keys(before).length)
        for (const id of new Set([
            ...Object.keys(before),
            ...Object.keys(after),
        ]))
            if (JSON.stringify(before[id]) !== JSON.stringify(after[id]))
                changedActions.add(id);
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : /\.mdx?$/.test(e.name) ? [p] : [];
    });
}
const pages = ["guides", "troubleshooting"].flatMap((d) =>
    walk(path.join(DOCS, d)),
);

const hits = [];
for (const page of pages) {
    const text = fs.readFileSync(page, "utf8");
    const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const covers = [...fm.matchAll(/^\s*-\s*(.+)$/gm)].map((m) => m[1].trim());
    const reasons = new Set();
    for (const c of covers) {
        if (c.startsWith("action:")) {
            if (changedActions.has(c.slice(7)))
                reasons.add(`shortcut \`${c.slice(7)}\``);
        } else if (c.startsWith("i18n:")) {
            const prefix = c.slice(5);
            for (const k of changedKeys)
                if (k === prefix || k.startsWith(`${prefix}.`))
                    reasons.add(`label \`${k}\``);
        } else {
            for (const f of userVisible)
                if (f === c || f.startsWith(`${c.replace(/\/$/, "")}/`))
                    reasons.add(`\`${f}\``);
        }
    }
    for (const m of text.matchAll(/<Ui\s+k="([^"]+)"/g))
        if (changedKeys.has(m[1])) reasons.add(`label \`${m[1]}\``);
    for (const m of text.matchAll(/<Kbd\s+action="([^"]+)"/g))
        if (changedActions.has(m[1])) reasons.add(`shortcut \`${m[1]}\``);
    if (reasons.size)
        hits.push({ page: path.relative(REPO, page), reasons: [...reasons] });
}

const lines = [];
if (!userVisible.length) {
    lines.push(
        "No changes to what users see, as far as file paths tell. Nothing to check in the user guide.",
    );
} else {
    if (hits.length) {
        lines.push(
            "These user guide pages describe what this change touches. Check their words and pictures:",
            "",
        );
        for (const h of hits)
            lines.push(
                `- \`${h.page}\`: ${h.reasons.slice(0, 6).join(", ")}${h.reasons.length > 6 ? ", …" : ""}`,
            );
    } else {
        lines.push(
            `This change touches ${userVisible.length} file(s) users may see, and no guide page lists them in \`covers\`. If it changes what users see or do, find the page by the feature's name and update it, or add the page's \`covers\`.`,
        );
    }
    lines.push(
        "",
        guideChanged.length
            ? `The guide is updated in this change (${guideChanged.length} file(s)).`
            : "**The guide isn't updated in this change.** If users will see a difference, update the pages and re-record the shots that show it (see `apps/website/AGENTS.md`). If not, say so in the pull request, or add the `no-docs-needed` label.",
    );
}
if (markdown) {
    console.log(
        ["<!-- docs-impact -->", "### User guide", "", ...lines].join("\n"),
    );
} else console.log(lines.join("\n"));
