---
name: user-docs
description: Update, write or check the OpenMarch user guide (openmarch.com/guides) and its recorded screenshots and clips. Use before pushing any change that alters what users see or do in the app, when asked to document a feature, or to check the guide against the app.
---

# User guide

A change that alters what users see or do isn't done until the guide matches it. Do this before pushing, in the same change.

1. Read `docs/conventions/user-docs.md` (what to write, which words) and `apps/website/AGENTS.md` (pages, shots, checks). Read them every time; they're short.
2. Run `pnpm --dir apps/website docs:impact` for the pages your change may affect. Also search the guide for the feature's name and its old label text.
3. Learn the new behavior from the code you changed and its tests, not from memory or the old page. The guide describes how features are meant to behave; to read a chapter as plain text, build the site and read `apps/website/dist/_llms-txt/<chapter>.txt`.
4. Update every affected page: fix what's no longer true, add what's new. `<Ui k>` for labels, `<Kbd>` for shortcuts, one paragraph per line.
5. Re-record the shots that show the change, and add shots for anything new (`node scripts/docs-media/capture.mjs <shot>` from `apps/desktop`; `scripts/media-kit/in-docker.sh` on a headless machine).
6. If actions, shortcuts, hold terms, menu items or settings changed: `pnpm --dir apps/desktop docs:reference`.
7. Check: `pnpm --dir apps/website check:guide`, then `pnpm --dir apps/website run build`. Read a changed page in `dist/llms-full.txt` too: a label, shortcut or picture should read as text there.
8. Review as a reader, and don't skip it:
   - Open every new or re-recorded picture with the Read tool; for clips, read a frame sheet.
   - Screenshot each changed page, `node apps/website/scripts/page-shots.mjs /guides/<page>/`, and read both themes.
   - Walk through the steps against the code: is each one still true and in the right order?
9. Fill in the pull request's User guide section, and in your report say which pages and shots you changed and anything you couldn't confirm.

If the guide can't be updated in this change, list the pages that need it in the pull request's User guide section instead. Never leave it silent.
