// Rewrites llms-full.txt and llms-small.txt after the build, from the guide's own Markdown copies
// (src/pages/[...slug].md.ts), so both hold the user guide only and in sidebar order:
//
// - llms-full.txt: every guide and troubleshooting page, whole. The plugin's version also held
//   the On the Move and developer pages, which a band director's assistant never needs.
// - llms-small.txt: one short entry per page (title, link, description and its "In short:" line),
//   a few thousand words, so an assistant can find the right page, and often the answer, in one
//   fetch. The plugin's version was the same as llms-full.txt.
//
// The plugin still serves its own versions in `astro dev`; the built site is what's published.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A page's Markdown copy in the build, or null when the page has none. */
function markdownCopy(dist, id) {
    const file = fileURLToPath(new URL(`${id}.md`, dist));
    return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
}

/** Title, description and "In short:" line from the top of a Markdown copy. */
function summary(markdown) {
    const title = /^# (.+)$/m.exec(markdown)?.[1] ?? "";
    const description = /^> (.+)$/m.exec(markdown)?.[1] ?? "";
    const inShort = /^In short: (.+)$/m.exec(markdown)?.[1] ?? "";
    return { title, description, inShort };
}

/**
 * @param {{ site: string, intro: string, chapters: { label: string, pages: string[] }[] }} options
 *   `chapters` lists each chapter's page ids in sidebar order; `intro` is the text both files
 *   start with.
 */
export function llmsGuideFiles({ site, intro, chapters }) {
    return {
        name: "openmarch-llms-guide-files",
        hooks: {
            "astro:build:done": ({ dir, logger }) => {
                const full = [`# OpenMarch user guide`, "", intro];
                const small = [
                    `# OpenMarch user guide: every page in brief`,
                    "",
                    intro,
                    "",
                    "Each entry is one page of the guide: what it covers, and its answer in one line. Open the page's Markdown copy (its address plus .md) for the steps, pictures and clips.",
                ];
                let pages = 0;
                for (const chapter of chapters) {
                    small.push("", `## ${chapter.label}`);
                    for (const id of chapter.pages) {
                        const markdown = markdownCopy(dir, id);
                        if (!markdown) continue;
                        pages++;
                        full.push("", "---", "", markdown);
                        const { title, description, inShort } =
                            summary(markdown);
                        small.push(
                            "",
                            `### [${title}](${site}/${id}/)`,
                            ...(description ? [description] : []),
                            ...(inShort ? [`In short: ${inShort}`] : []),
                        );
                    }
                }
                if (pages === 0)
                    throw new Error(
                        "llms-guide-files: no Markdown copies found in the build",
                    );
                writeFileSync(
                    fileURLToPath(new URL("llms-full.txt", dir)),
                    `${full.join("\n")}\n`,
                );
                writeFileSync(
                    fileURLToPath(new URL("llms-small.txt", dir)),
                    `${small.join("\n")}\n`,
                );
                // llms.txt describes the two files; say what they are now
                const index = fileURLToPath(new URL("llms.txt", dir));
                writeFileSync(
                    index,
                    readFileSync(index, "utf8")
                        .replace(
                            /\[Abridged documentation\]\(([^)]+)\):[^\n]*/,
                            "[Every page in brief]($1): each guide page's title, link, description and one-line answer; start here to find the right page",
                        )
                        .replace(
                            /\[Complete documentation\]\(([^)]+)\):[^\n]*/,
                            "[Complete user guide]($1): every guide page in full, in one file (about 50,000 words); the chapter files below are smaller",
                        )
                        .replace(
                            "- The complete documentation includes all content from the official documentation\n",
                            "",
                        ),
                );
                logger.info(
                    `llms-full.txt and llms-small.txt: ${pages} guide pages`,
                );
            },
        },
    };
}
