# Writing the user guide

The user guide is the set of pages under `apps/website/src/content/docs/guides` and
`troubleshooting`, published at openmarch.com/guides. It describes the app as it is on `main`:
what every part of the window does and how to get things done with it. People read it to learn
the app, and agents read it to learn how the app is meant to behave.

How to add, move and check pages, and how screenshots and clips are made, is in
[apps/website/AGENTS.md](../../apps/website/AGENTS.md). This page is about what goes in them.

## Who it's for

Band directors, drill writers and staff. Most are comfortable with computers but aren't
software people. Some used OpenMarch 0.1.7 or Pyware; many are new to drill software. They read
the guide in two ways: start to finish when they're learning, and by search when they're stuck
on one task. Write every page so it works for the second reader, who lands on it cold.

## Pages and how they're organized

The sidebar follows the app. Each chapter is one area of the window or one stage of the work
(Marchers, Timeline, Shapes, Music, Field, 3D View and props, Files and export), and opens with a
short page that explains how that part of the app works. The task pages follow it. Reference and
Troubleshooting come last.

Every page is one of four kinds, set in its frontmatter as `type`:

| Type        | What it does                                          | Example                      |
| ----------- | ----------------------------------------------------- | ---------------------------- |
| `tutorial`  | Takes a newcomer through a whole piece of work        | Write your first show        |
| `how-to`    | Gets one task done                                    | Split a move at the playhead |
| `concept`   | Explains how something works, so the tasks make sense | How the timeline works       |
| `reference` | Lists facts to look up: every shortcut, every setting | Keyboard shortcuts           |

Keep the kinds apart. A how-to page doesn't stop to explain the model; it links to the concept
page. A concept page doesn't walk through clicks.

Name pages for what the reader wants: "Split a move", "Import a MusicXML score", "Place marchers
in a box". Concept pages are named for the thing: "How the timeline works", "Pages and moves".
Avoid "Introduction to", "Overview of" and "Understanding".

### Frontmatter

```yaml
---
title: Split a move
description: Cut one move into two at the playhead, so each half can change on its own.
type: how-to
# What the page describes in the app, for the agent that checks pages when the app changes:
# source folders, action ids (src/data/generated/actions.json) and i18n key prefixes.
covers:
  - apps/desktop/src/timeline/split
  - action:timelineSplitAtPlayhead
  - i18n:timeline.clipMenu
sidebar:
  order: 3
---
```

`description` is one plain sentence. It shows in search results and link previews.

### A how-to page

1. One or two sentences: what the task does and when you'd want it. No "In this guide".
2. **Before you start**, only when something has to be true first (marchers selected, Expert
   mode, a page after the one you're on).
3. Numbered steps. One action per step, in the order the reader does them. Name the control the
   reader uses, then what to do with it. If a step has a shortcut, give it after the mouse way.
4. What happens: one or two sentences, or a clip, so the reader knows it worked.
5. Optional sections for the common variations ("To split every selected move…").
6. **Related**: links to the next tasks and the concept page, each with a few words on why.

Steps that the reader does with the mouse get a short clip when the motion matters (dragging,
drawing, scrubbing). Steps that are just "select this, then that" don't need one.

### A concept page

Start with the one idea the reader needs, in a sentence or two, then build on it. Use a picture
early. Short sections with plain headings. Define each term the first time you use it, and use the
same term everywhere after. End with links to the tasks that use it.

## Voice

- Write to the reader as "you". Present tense, active voice: "The move gets longer", not "The
  move will be lengthened".
- Plain words. "Use", not "utilize"; "lets you", not "enables you to".
- Short paragraphs. A paragraph can be one sentence.
- Say what the app does, exactly. "Dragging a move's right edge changes how many counts it
  takes" teaches more than "You can easily adjust moves."
- Explain why only when the reader would otherwise get it wrong: "Hold from previous page keeps
  the marcher still on purpose, so later edits to the earlier page carry through."
- Be honest about limits. If something isn't possible yet, say so plainly and say what to do
  instead.

### What reads as generated, and never belongs in the guide

- Openers and closers: "In this guide, you'll learn", "OpenMarch makes it easy to", "Now you're
  ready to", "That's it!", "Happy marching". A summary at the end of a short page.
- Filler words: simply, just, easy, easily, seamless, powerful, intuitive, effortless, robust,
  leverage, unlock, streamline, comprehensive, "a wide range of".
- Emoji, decorative symbols, and exclamation marks.
- Bold anywhere but UI labels. Bolding the first words of every bullet.
- "Note:" or "Tip:" boxes for ordinary sentences. At most one aside per screen, and only for
  something the reader would regret missing (data loss, a setting that changes everything).
- A step that does nothing ("Now you're ready to…") or three things at once.
- Feature lists that don't help anyone finish anything.
- Made-up precision that breaks when the UI changes: "in three clicks", "in seconds".
- Rhetorical questions as headings ("What is a move?"). Use "Moves".

## Naming things in the app

- Use the app's own words, exactly as the app shows them, in the app's capitalization. Write UI
  labels with `<Ui k="...">` (it reads the app's strings and fails the build if the label is
  renamed). When the label is a button or menu item the reader acts on, it's bold; `<Ui>` makes it
  bold.
- Don't add the control's type unless it helps: "Select **Split page**", not "Click the **Split
  page** button". Name menus as paths: **File › Export › Coordinate sheets**.
- Verbs: _select_ for buttons, menu items, tabs and options (it works for mouse, touch and
  keyboard), _drag_, _press_ for keys, _enter_ or _type_ for text, _turn on_ and _turn off_ for
  switches, _choose_ for picking from a list. Never "click on", "hit" or "toggle" as a verb.
- Say where things are by name: "the inspector", "the timeline", "the toolbar". Don't use left,
  right, above or below, except for the field itself (its sides and front are part of drill).
- Shortcuts use `<Kbd>`: `<Kbd action="redo" />` for an app action (the reader sees their own
  system's keys), `<Kbd keys="Shift" gesture="drag" />` for a key held while dragging. Give the
  mouse way first and the shortcut after: "Select **Redo** (<Kbd action="redo" />)".
- Box sizes are "8 × 4" (with ×), never files and ranks.

### The guide's terms

Use these words, and only these, for these things. If the app's wording changes, change it here
and in the glossary page together.

| Term                       | Meaning                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| show                       | One `.dots` file: marchers, music, field and drill                               |
| marcher                    | Anyone on the field (performers in sections). Not "performer" or "dot"           |
| section                    | A group of marchers by instrument or role (Trumpet, Color guard)                 |
| field                      | The playing surface and its markings                                             |
| count                      | One beat of the show's music                                                     |
| page                       | A numbered stretch of counts that ends at a set the marchers reach               |
| move                       | A stretch of time on the timeline in which marchers go from one place to another |
| playhead                   | The line on the timeline that marks the count you're looking at                  |
| start flag                 | Where playback starts                                                            |
| Defined, Held, Not defined | A marcher's state on a page (the app's own words, from `timeline.terms`)         |
| keyframe                   | A position you set for a marcher at a count                                      |
| Basic, Expert              | The two editor modes                                                             |
| Editor, Preview            | The two ways to view the show: making changes, or watching it                    |

## Pictures and clips

Every screenshot and clip comes from the app itself, recorded by a script, never taken by hand,
so it can be recorded again when the app changes. See apps/website/AGENTS.md for how.

- Show only what the step is about. Crop to the panel or region; use the whole window only on
  overview pages. Hide what isn't relevant by choosing a calm state, not by blurring.
- One picture per idea. A page with a picture after every step is a slideshow; most steps don't
  need one.
- Clips are 3 to 8 seconds long, silent, and loop. They show one action from start to finish:
  the pointer moving to the control, the drag, the result, and a short hold on the result. The
  pointer, clicks and keys pressed are drawn into the clip, so say in the text what the reader
  should notice.
- Every picture has `alt` text that says what it shows, as if describing it to someone who can't
  see it: "The timeline with Move 2 selected and its right edge dragged two counts later." Not
  "screenshot of the timeline".
- Light and dark versions are recorded together and the page shows the reader's theme.
- Keep files small: a still stays under 150 KB and a clip under 1.5 MB. The User guide check fails
  when one is bigger; shorten the clip or crop tighter and record it again.
- No arrows, circles or text drawn into images. If something needs pointing out, say where it is
  in the caption or the text.

## Basic and Expert

Expert shows everything; Basic hides some tools to keep the window simple. A page about something
that only Expert has says so in its first line ("This needs Expert mode: …") and links to Basic
and Expert. Screenshots use Expert unless the page is about Basic.

## Desktop, web and touch

The desktop app, the web editor and tablets share one guide. Where they differ, say so in one
sentence at the point where it matters ("In the web editor, Save downloads the show"). Touch
steps go in their own short section when they differ from the mouse way, not mixed into every
step.

## What the guide doesn't cover

Only what ships in the app on `main`. Features hidden behind a setting for testing, parked work and
plans don't appear, and the guide never promises future features. Check
[docs/convergence/inventory.md](../convergence/inventory.md) when you're unsure whether something
ships.
