<!-- cspell:disable -->

# 08: Is the feedback text helpful? A persona study

2026-10-08, after PR #112. The owner read the screenshots and found the new text "not super helpful,
just kind of busy".

## Method

- **Material.** Five flows were captured in the real app at 3bf2ba8d, each twice: as shipped
  (TEXT), and with only the new feedback hidden (NOTEXT). NOTEXT hides the toasts and the inspector
  hold line with injected CSS. A pixel diff confirmed nothing else differed.
- **The flows:**
  - F1: edit page 2, then visit pages 3–4.
  - F2: a window across a page flag.
  - F3: the inspector line.
  - F4: page-mode carry-forward with Only Page 2.
  - F5: Delete page and its moves.
- **Where it is:** the material is in `~/ux-study` (not in the repo). The scenarios are
  `~/om-capture/scenarios/ux-*.mjs`.
- **Participants:** three persona agents, each given a neutral action log.
  - Dana: a first-year director with low technical comfort, on a 13-inch laptop.
  - Jo: a Pyware designer with 8 years' experience, who dismisses popups.
  - Kim: a corps designer writing 80–100 page shows, who uses Ableton and After Effects.
- **Order:** each persona wrote down what they thought happened from NOTEXT before seeing TEXT.

## What they understood without the text

| Flow | Dana                | Jo  | Kim                | Common finding                                                                                                              |
| ---- | ------------------- | --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| F1   | 3/5                 | 3/5 | 3/5                | Everyone worked out that pages 3–4 followed, but only by clicking through them. Nothing on screen said which pages changed. |
| F2   | 2/5                 | 3/5 | 4/5                | Page 3's set quietly became a mid-move spot; page 5 changed too. The thin clip bar was the only clue.                       |
| F3   | 3/5                 | 3/5 | 3/5                | Nobody could tell a held position from one placed on that page.                                                             |
| F4   | 3/5 (1/5 on intent) | 2/5 | 3/5 (1/5 on reach) | The scariest flow: page mode silently rewrote pages 3–4.                                                                    |
| F5   | 2/5                 | 2/5 | 3/5                | The view jumped to an empty Home field ("did I delete everyone?"). Page 1 silently grew to 32 counts.                       |

## Verdict on each text (all three agreed unless noted)

| Text                                                                                                                         | Read in real use?                                             | Effect                                                                                             | Verdict                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timeline toast "Also moves Pages 3–4"                                                                                        | Probably (it is short)                                        | Confirmed the guess and gave the range                                                             | **The information is needed, but a toast is the wrong place.** Kim: it spams nudges. Jo: it covers the later pages on the timeline. All three asked for a tint on the affected page boxes instead. |
| Inspector "Holding since Page 2" / "Moves here"                                                                              | **No.** Too small and pale; nobody saw that it was clickable. | Once found, it was the one text that fixed F3's confusion (Jo and Kim called it the best addition) | **Keep, but make it readable and visibly a link.** Jo: put it beside Step Size ("Hold from Pg 2 →").                                                                                               |
| Pass-through toast "OT1, OT2, OT3, OT4 and 4 others now move straight through Page 3. Also moves Page 5" + Start from Page 4 | Skimmed: three lines, and the button wraps into a column      | It was the only thing that explained page 3's in-between spot                                      | **Needed (a set they treat as a stop changed), but too long.** Drop the names. Say "Page 3 is no longer a stop". The button should say what happens: "Keep Page 3 as a stop".                      |
| Page-mode toast "Also moved on Pages 3–4" + Only Page 2                                                                      | Yes                                                           | **Corrected a wrong belief** for all three: it told them the copy-follow is on purpose             | **The most important text.** Keep it short. The button needs a clearer consequence (Dana didn't know what Only Page 2 would do).                                                                   |
| Delete toast "Deleted Page 2 and its moves · Pages 2–3 changed"                                                              | Yes (the empty field scared them)                             | Partly reassuring; "Pages 2–3" read as ambiguous (old or new numbers?)                             | **Reports the wrong thing.** Say where the counts went ("Page 1 is now 32 counts") and old→new numbers, and add **Undo**. Don't land on Home.                                                      |

## Bugs and state mismatches they hit (not text problems)

1. **F4:** after **Only Page 2**, an empty selection box stays where the dots were (frames 08–10).
2. **F2:** after **Start from Page 4**, the clip vanishes but the pinned window label still reads
   "Page 3 count 6 to page 4 count 16".
3. **F5:** after a delete with its moves, the view jumps to Home, which looks empty at that zoom.
4. **F1 (pre-existing, UI-12/V-36):** a scrub widens the "Editing …" label and the shading. All three
   read this as "watching changed what I'm editing". It was the most confusing thing in the study.
5. **Capture side finding:** the field-line flash (`TimelineIsolationBar` `fresh`) can stay stuck on.

## Recommendation (lead)

1. **Timeline carry-forward: replace the toast with a cue on the timeline.**
   - After an edit, tint the page boxes the edit carried into, until the next edit or until the
     user visits them.
   - No toast for ordinary edits or nudges.
2. **Keep toasts only for surprises, and shorten them:**
   - **Page-mode copy-follow:** "Pages 3–4 followed (they were copies) · Only Page 2". Tint pages 3–4
     too.
   - **Pass-through:** "Page 3 is no longer a stop · Keep Page 3 as a stop". No marcher names, and a
     button that doesn't wrap.
   - **Delete page and its moves:** "Deleted Page 2 · Page 1 is now 32 counts · old Pages 3–4 changed
     · Undo". Stay on the merged page.
3. **Inspector line:** normal text colour, next to Step Size, shaped like a link: "Hold from Page 2 →"
   / "Moves on this page".
4. **Fix bugs 1–3.** Bug 4 belongs to UI-12 (V-36) and is out of scope here; it is logged for the
   owner.

## Open owner choices

- **Page-mode copies:** should copies show a "linked" state before you drag (Jo), or should
  copy-follow be a preference? Today only the toast says so, after the fact.
- **Scope of the tint:** the last edit only, or a persistent "held from" view for the selected
  marchers (Kim's automation-lane hold bars)?
