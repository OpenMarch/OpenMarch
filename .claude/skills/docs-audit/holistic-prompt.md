# Holistic reader prompt

Fill in `{CHECKOUT}`, `{LAST_LINE}` (the line before the first non-guide page in `dist/llms-full.txt`, today "Managing Your OTM Ensemble"), `{TILES}` and `{OUT}`, then give it to one Fable reader.

---

You are reading the whole OpenMarch user guide in one sitting and judging how the pages fit together. Do not edit any repo file. Write only your report.

OpenMarch is free drill-writing software for marching bands. The guide's whole text, in sidebar order with labels and shortcuts filled in, is {CHECKOUT}/apps/website/dist/llms-full.txt, lines 1 to `{LAST_LINE}`; what follows is old OTM and developer docs, out of scope. Sources are under apps/website/src/content/docs/guides and troubleshooting. Rendered pages, as 1280×1400 light-theme tiles, are in {TILES}, named `<path with / as _>.light.<n>.jpg`. Read docs/conventions/user-docs.md first (short): it sets the voice and picture rules; don't suggest what it forbids.

What to find: places where the same idea is explained over and over, sections that pile on detail where a sentence and a link to the page that owns the idea would do, pages that disagree, and places a reader would want a picture that isn't there. The per-chapter reviewers read the guide in pieces with a checklist and can't see any of this. Your job is the gut read across the whole thing.

Read it three ways:

1. A band director reading start to finish to learn the app. Notice where you get tired, skim, or think "I already read this".
2. The same person landing cold on one page from a search the night before rehearsal. Does the page give them enough to act, by naming an idea in a sentence and linking, without re-teaching it?
3. An AI agent that fetches one page's Markdown copy to answer a question. Does each page say its own thing consistently with the others, or would two pages give two different answers? Repetition does not help agents; copies drift. A one-sentence definition plus a link does.

Write {OUT} with:

## Verdict

5–8 bullets: how the guide reads as a whole, and the biggest structural fixes.

## Ideas explained in more than one place

A table: idea | pages that explain it (not just mention it) | which page should own it | what the others should keep (one sentence + link, or nothing). Cover every idea explained in 3+ places, and any explained twice at length. List every place two explanations disagree, with line numbers in llms-full.txt.

## Pages to slim, merge or split

Per page: current rough length, what to cut or move where, target length. Name sections that are reference detail sitting in a task page. Say if two pages should become one, or the order makes the reader meet something before its explanation.

## Where a picture is wanted

Only places a reader would actually want one when reading through: what the picture should show (state, crop; still or clip, and the action for a clip). Pictures are recorded from the app by script, so name a real app state. Also name pictures that repeat another page's picture or that a reader would skip.

## The reading path

Is the order right for a newcomer? Are the Glossary, Basic and Expert, and the chapter overview pages a home for the core ideas, or competing with the chapters?

Be concrete (page titles, headings, llms-full.txt line numbers). Don't pad, don't list things that are fine, don't write replacement prose longer than two sentences, never invent features. Check app source (apps/desktop/src, apps/desktop/i18n/en.json) only to settle a disagreement between pages, a few times at most.

Reply with the report path, the five changes you'd make first, and roughly how many words the guide could lose without losing anything a reader needs.
