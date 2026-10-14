<!-- cspell:disable -->

# Basic and Expert modes (UI-19)

Started 2026-10-11 from the project owner's brief. Branch `timeline/basic-mode` (fork), off fork
main 30f2bf9c. Decisions marked _owner_ were answered by the project owner on 2026-10-11; the rest
are lead defaults and have V-rows in `../ownership/VALIDATION.md` (V-200 onward).

## The brief

Not every designer wants the full timeline. Make the page-box timeline a first-class **Basic**
mode, next to the full timeline (**Expert**), with:

1. **Holding across pages** (UI-18). Every kind of user asked for it.
2. **No moves across page flags, and no moves overlapping a marcher's other moves.**
3. **Positions in the middle of a page.** Editing at a count inside a page splits that marcher's
   move there: one move from the page's start to the count and one from the count to the page's
   end, so the page's end position is kept. Editing again splits again. Every move stays inside
   its page.
4. **Switching both ways.** Everything Basic makes shows up in Expert. Not everything Expert makes
   can be edited in Basic: it still plays and is still kept, but Basic can't change it. A show may
   need Expert for one passage only.
5. **A setting, Basic or Expert, with screenshots,** asked on first launch in a welcome flow
   before any show is created.

## Why Basic isn't the old timeline

The old page-box bar was **page mode**: its own data (`marcher_pages`, `pathways`, `midsets`),
write paths and drawing, untouched by the timeline work. Since #136 (timelines only) page mode is
gone: every show is a timeline file, and an old show is converted when it opens, after the person
confirms (with an untouched `.pre-conversion.dots` copy beside it).

So **Basic is not page mode.** Basic is a UI over timeline data, drawn and played by the resolver
like Expert. What changes is the bottom panel and which edits it can make. That gives Basic all the
rendering and holding work for free, and it makes switching modes free: no conversion, the same
file.

## The mode

- An **app setting**, not a file setting: electron-store key `editorMode`, `"basic" | "expert"`.
  Unset means the welcome flow hasn't run. It's in Settings → Timeline as two cards with screenshots.
- It can change while a show is open, with no reload and no file write. The file doesn't record
  it.
- Playwright/CI, and the web build without a choice, default to **Expert** so existing tests and
  lab tests keep their behaviour (lead default).

## Basic's panel

_Owner, 2026-10-12 (replacing the first build, which reused the page-mode bar's DOM):_ Basic's
panel is a **simplified version of the new timeline, inspired by the original bar**. It uses the
new timeline's drawing, zoom, playhead, scrubbing and transport, laid out as the original: one row
of page boxes sized by duration, with the music inside them.

- **One row of page boxes.** Each box has a header strip (its number at the right, as the
  original) and a body. The **waveform and the count ticks are inside the box body**, not in lanes
  under the counts as in Expert. No "Pages", "Audio" or "Counts" titles, and no separate counts
  row.
- _Owner:_ **dragging on the body (the audio or the counts) scrubs**, and a click there seeks.
  **Clicking the header selects the page**: the playhead goes to its flag, so edits land on the
  page, as the old page bar did.
- _Owner:_ **scrubs snap to every count** (Expert snaps to downbeats and page lines), since a
  mid-page edit happens at a count.
- _Owner:_ **without audio the boxes keep their height** and show only the count ticks, so nothing
  jumps when audio loads.
- **Transport:** Expert's transport bar. A simulated-user A/B preferred it 4 of 4 over the
  original's control block on the left (`~/ux-sim/basic-transport/`); that block went with page
  mode (#136), and its study switch with it.
- _Owner, 2026-10-12:_ **⏮ stays the previous page and ⏭ the next page** in Basic, as in Expert
  (UI-17, V-210). Since #178 the same buttons step a beat with Shift and go to the start or end
  of the show with Alt (as Q/E), and the tooltip lists all three. Basic testers had read ⏮ as "the
  start": one pressed ⏮ then Play to watch the whole show and saw one page
  (`~/ux-sim/basic-past-flag/rosa-after/r7/14-click.png`, LOG.md lines 50 to 52).
- On or in the boxes: the status chip, the Expert mark, mid-page ticks (right-click
  **Remove this count's position**), the page menu (delete, subset), and dragging a flag to
  change a page's length (UI-16).
- _Owner feedback, 2026-10-12:_ no notice when a show with Expert moves opens (the Expert marks
  say it); no grey box under home; no ring around the selected page's audio (the header shows the
  selection); measure numbers in the box bodies, above the waveform.
- **Keep chain wording and icons, both modes** (_owner, 2026-10-12_): the chain's tooltip says
  what is true now, then what a click does ("OT1 and OT2 hold where Page 2 left them / Changes to
  Page 2 carry onto Page 3. Click to keep them here instead"); icons LinkSimple and LinkBreak. A
  status chip replacing the hold marks was tried and dropped: the owner prefers the key at the
  flag and the bar along the bottom.
- **Keep chains on narrow boxes, both modes** (_owner, 2026-10-12_: the chains covered the page
  numbers and each other): the chain moved to the bottom left of the box, on the start of the
  hold bar, at 16 or 12 px, or a dot where it can't fit; a linked one only on the selected page,
  K's page and the hovered box (V-222 to V-224; simulated A/B of three looks in
  `~/ux-sim/keep-chain/`).
- Rehearsal marks show in Basic's measure row, as in Expert.
- **+ after the playhead** adds a page there, as in Expert. In Basic, adding a page (and the
  inspector's **Split page**) also splits each marcher's move at the new flag, keeping its
  position there, so no move crosses the new flag (otherwise every split would lock).
- _Owner, 2026-10-12:_ **past the last flag, + adds a page ending at the playhead**, in Basic as
  in Expert: the person moves the playhead to a later count to choose the length. **Adding a page
  never adds beats, measures or tempo** for now (eventually there will be unlimited beats and
  pages on top), so where the music ends on the last flag there is no **+** past it. This replaced
  a short-lived Basic default (a page of `defaultNewPageCounts` from the last flag, offered on
  the flag too, lengthening the show where it was too short). Page mode's add page, which does
  lengthen the show, is unchanged. The timeline keeps 32px after the show's last beat so **+**
  stays on screen with the playhead on the last count (both modes), and while the timeline shows
  in timeline mode toasts sit just above it, so one (such as "There's no page here yet. Add a page
  with +…") never covers **+**. A raised toast covers the field's zoom-in button while it shows.
- Not in Basic: clips (moves off flags), the start flag and pinning, the loop bar, isolation,
  clip resize, the measure row.
- Play, Space and Shift+Space use the timeline playback driver. Space plays on from the playhead;
  Shift+Space plays the selected page once (UI-17).
- The inspector hides the move card (path style, range, Delete move) and the Timeline section
  (timeline shapes, diagnostics): each makes moves Basic can't edit. **Open:** shapes in Basic
  (a shape move inside one page could count as simple), to decide with the shape-draw redesign.

## How Basic writes

Every Basic edit is "marcher m is at (x, y) at beat P" on the page box `[a, b)` holding P. It's a
new edit target, `{kind: "point", beat: P, box: [a, b)}`, alongside home/range/timeline. It's
chosen by `planCanvasEdit` in Basic, so canvas drags, the inspector, align/distribute, nudges and
set-to-previous/next all use it. Per marcher, with `R` = its moves inside `[a, b)` (all one-slot
shapeless moves on one layer, ordered, not overlapping; see "Simple"):

| Where P is                                                 | What's written                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| On a move's end (P = r.end, including the flag)            | r's destination is set (as today's page edit)                                      |
| Inside a move r (r.start < P < r.end)                      | r becomes `[r.start, P)` → (x, y) and `[P, r.end)` → r's old destination           |
| In a hold after the last move, before the flag (e < P < b) | `[e, P)` → (x, y) and `[P, b)` → the held position, so the flag keeps its position |
| On the flag (P = b) with no move ending there              | `[e, b)` → (x, y), with e = the last move's end, or a                              |
| Nothing changes for a marcher                              | nothing is written for it (UI-18)                                                  |

- The move after P always ends where it used to, so the page's end position and every later page
  are unchanged when editing mid-page (brief 3). An edit on the flag carries forward as in UI-18.
- New moves are written on the marcher's existing layer for the box (0 when it has none), never
  at `stealLayer`, so nothing overlaps.
- Dragging a marcher back onto the position it had at the previous point removes that point
  (the two moves merge), like UI-18's "back onto the start clears the move" (lead default).
- **Remove this count's position** merges `[s, P)` and `[P, e)` into `[s, e)` with the second
  move's destination.
- A merge that goes nowhere (its destination is where `s` is) is deleted instead, by both of
  those, with any moves right after it that go nowhere too (their only tick was its end): a
  single point set in a hold and removed again leaves the hold as it was, with no tick at the
  hold's end, and a page the marcher held through follows earlier pages again (V-220, lead
  default). A point set inside a move always writes both halves, even when the second goes
  nowhere: it is the user's point, with a tick Remove takes out.
- Kept spots: setting a point inside a kept move keeps the second half kept (it arrives where the
  kept spot did), and a merge with a kept spot in either move is written, kept (V-221, lead
  default).
- On a converted page, Basic's writes compact the page's shared transition when a marcher leaves
  it and delete it (and its timeline, when empty) when the last one does, so they make no vacant
  slot (D-VACANT). A last slot that was already vacant, or a transition sharing a marcher with an
  inheriting follow-the-leader one, keeps its vacancies. Basic's **Split page** writes the same
  way. _Known nit:_ undo or redo after a compaction
  selects the marcher that was moved into the vacated slot as well (left as is).
- Timelines stay one per range (C-12). Marchers split at different counts get different timelines.
  The page timeline `[a, b)` stays for marchers that don't split.

## Simple: what Basic can edit

A marcher is **simple on a page** `[a, b)` when every one of its moves overlapping the box:

- starts and ends inside the box (`a ≤ start`, `end ≤ b`);
- doesn't overlap another of its moves in time, whatever the layer;
- is a one-slot transition with no shape (`dest_shape_id` null) and a direct path.

A marcher with no move there (holding or kept) is simple. This is computed from the stored
assignments (not the resolver's spans), per marcher per page, in one pure function shared by the
panel, the canvas and the writer.

- _Owner:_ **per marcher, not per page.** A marcher that isn't simple on the selected page is
  **locked** in Basic on that page: it can't be selected for editing, and dragging it shows a toast
  "Marcher B3 uses Expert moves on page 4 · Switch to Expert". The other marchers stay editable.
  The page box shows an Expert mark (a small ◆E badge, lead default) when any marcher on it isn't
  simple, with a tooltip naming how many.
- The writer refuses a non-simple marcher too (defence in depth), so no Basic path can create an
  overlap or a move across a flag.
- Locked marchers still play, scrub and draw exactly as in Expert.
- Opening a show with Expert data in Basic shows one dismissible banner: "Pages 4–7 use Expert
  moves. You can view them here; switch to Expert to edit them."

## Welcome flow

_Owner:_ mode plus analytics. On first launch (`editorMode` unset), the launch page opens a modal
before anything else:

1. **Welcome to OpenMarch** (one line, Continue).
2. **How do you want to work?** Two cards with screenshots: **Basic** ("Pages, like a drill
   chart. Set each page; marchers hold until you move them again.") and **Expert** ("The full
   timeline: moves that cross pages, overlapping moves, loop and start flag."). Neither is
   preselected. "You can change this any time in Settings."
3. **Help improve OpenMarch** (the analytics opt-in, moved here from its own modal). Skipped when
   `optOutAnalytics` is already set.

Existing users who upgrade see it once too (their `editorMode` is unset). The web build has no
launch page; there the choice comes from the URL (`?mode=basic`) or defaults to Expert.

Screenshots: captured from the real app with the headless harness (`/validate`), stored as webp
in `apps/desktop/src/assets/editor-mode/`, and used by both the welcome flow and Settings.

## Alternative: one timeline, simple by default (study, 2026-10-12)

_Owner, 2026-10-12:_ "Should we have two different views, or make the advanced bar simple to
reason about? Implement both, test and simulate them with users." The two-view design is the rest
of this file. The alternative was built behind a temporary study flag (localStorage
`openmarch.simpleDefaults`), on the full timeline; the owner chose Basic and Expert, and the flag
was removed before merging (2026-10-14). What it did:

- **Mid-page edits split** while the start flag follows (unpinned): the point writer, as Basic.
  Marchers whose moves there already cross a flag or overlap get today's window edit over
  `[page start, playhead)` instead, in the same undo step (`others: "window"` on the point
  target), so nothing is ever locked.
- **Moves inside one page are ticks, not clips.** Clips are for moves that cross a flag or
  overlap. The field line says "Editing count 4 of page 2" as Basic.
- Expert gestures are unchanged: pin the start flag, Ctrl+drag a range, drag clips.
- No mode setting, no locks, no Expert marks.

Simulated comparison: `~/ux-sim/basic-vs-simple/` (Version 1 = this, Version 2 = Basic;
`FINDINGS.md` there). Four personas, 2026-10-12: one timeline 6, 6, 6, 8 (mean 6.5) against Basic
5, 7, 4, 7 (mean 5.75); three of four would hand the one timeline to a new colleague, for its move
card. Shared gaps in both: a move across a page line (0 of 4 found a way), the unlabelled **+**
(V-208), removing one marcher's mid-page point, undo leaving everyone selected, Play from a page.

## Work packages

| ID  | What                                                                                                      | Depends on |
| --- | --------------------------------------------------------------------------------------------------------- | ---------- |
| B1  | `editorMode` setting: store, hook, Settings row (no screenshots yet)                                      | none       |
| B2  | Simple predicate + the point writer + Remove position, with tests                                         | none       |
| B3  | Basic panel in timeline mode; `planCanvasEdit` returns the point target in Basic                          | B1, B2     |
| B4  | Locks: canvas lock, toast, page-box Expert mark, open banner                                              | B2, B3     |
| B5  | Welcome flow (mode + analytics), screenshots in welcome and Settings                                      | B1, B3     |
| B6  | Convert on open for everyone: done by #136 (timelines only; convert after confirming), not in this branch | —          |
