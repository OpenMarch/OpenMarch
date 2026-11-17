# Reviewer prompt

Fill in `{CHECKOUT}`, `{COMMIT}`, `{CHAPTERS}`, `{EXAMPLE}`, `{TILES}` and `{OUT}`, then give it to one Fable reviewer. For the Reference chapter, add: "Reference pages are lists to look things up in, so judge them as reference: how quickly a reader finds an entry, and whether anything is missing, not pictures for their own sake."

---

You are reviewing part of the OpenMarch user guide as a reader would, and reporting findings. Do not edit any file in the repo. Write only your findings file.

## Context

OpenMarch is free drill-writing software for marching bands. The guide lives in the repo at {CHECKOUT} (commit {COMMIT}), under apps/website/src/content/docs/. Read these first, they are short:

- docs/conventions/user-docs.md: who the guide is for, the page types, voice, banned phrasing, and the picture rules (one picture per idea, clips 3–8 s, no arrows drawn into images, crop to what the step is about). Judge against these rules. Don't suggest anything they forbid.
- apps/website/AGENTS.md, section "Screenshots and clips": how pictures are made. Every picture is a scripted "shot" recorded from the app, so a suggested picture must be something a script could record: a specific app state, crop, and for a clip a specific action.

## The reader

A band director who has never used drill software, reading a page cold the night before rehearsal because they're stuck on one task. A second reader learns the app start to finish.

## Your pages

Chapters: {CHAPTERS}.

For each page you have:

1. The source MDX. `<Media id="..." alt="...">` marks a picture or clip, `<Ui k>` a UI label, and `<Kbd>` a shortcut.
2. The page as rendered, light theme, cut into 1280×1400 tiles: {TILES}/<path with / as \_>.light.<n>.jpg. For example, {EXAMPLE}. Read every tile of every page. You need to see how dense, long or bare the page actually looks. If a tile doesn't match the source, say so and judge from the source.
3. The pictures themselves: apps/website/public/docs/media/<chapter>/<id>.light.webp. Clips also have a .light.webp poster frame. Open a picture when you need to judge whether it shows what the text says.

You may read app source (apps/desktop/src, apps/desktop/i18n/en.json) to check whether a step or claim is still true. Cap that at a few targeted checks per page. Don't explore broadly.

## What to look for, in priority order

1. Missing picture: a step or idea where a newcomer would be lost without seeing it, especially spatial actions (dragging, drawing, where something sits in the window) or a concept page with no picture early. Say what the shot should show (state, crop, still or clip, and for a clip the action), and why text alone fails there.
2. Missing context: a term used before it's defined, a prerequisite that isn't stated (mode, selection, which page you're on), a jump that assumes knowledge, or a "why" the reader needs to avoid a mistake. Say exactly what to add, in one or two sentences.
3. Picture problems: a picture that doesn't match its text or alt, is cropped too wide or too tight to see the point, is redundant (a slideshow), or sits far from the step it illustrates.
4. Possibly out of date: text that seems to contradict the app. Only flag this with evidence (file:line). Mark it unverified if you couldn't confirm.
5. Clarity and style: only notable violations of the conventions, not nitpicks.

Don't report things that are fine. Don't pad. A page with no findings gets one line saying so. Don't write replacement prose longer than two sentences, and never invent marketing copy or features.

## Output

Write {OUT}:

```
# Findings: <chapters>
## Summary
3–5 bullets: the biggest problems across these pages.
## <page path>
- [high|medium|low] [missing-picture|missing-context|picture-problem|out-of-date|clarity] Where: <heading or step>. What: <problem>. Suggest: <fix; for a picture: still|clip, state, crop, action>. Confidence: high|medium|low. Evidence: <file:line if any>
```

High means a newcomer would likely get stuck or be misled. Medium means it slows them down. Low means polish.

Finish by replying with: the path of your file, the number of findings by severity, the number of pages and tiles you read, and anything you couldn't check.
