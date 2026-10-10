<!-- cspell:disable -->

# 09: First-time users try move, hold and a mix

2026-10-09, branch at 9343e614. The owner asked whether the UI makes sense to people who know
nothing about the app.

## Method

- **Participants:** four simulated first-time users. None had seen the code or the docs, and they
  operated the real app through a replay remote control (`~/om-capture/ux-run`), which takes a
  screenshot after every action. They used a starter show: 8 marchers in a line, pages 1–4, nobody
  moving.

  | Id     | Who                                      | Mode     | Runs |
  | ------ | ---------------------------------------- | -------- | ---- |
  | pat    | 66, retired teacher, iPad-level comfort  | timeline | 20   |
  | sam    | 17, drum major, clicks first             | timeline | 9    |
  | riley  | 44, director, thinks of sets as slides   | page     | 10   |
  | morgan | 32, motion designer, thinks in keyframes | timeline | 18   |

- **Goals:**
  - G1: march forward on set 2 and stay there.
  - G2: hold on sets 3–4.
  - G3: only the two end marchers step out on set 3.
  - G4: shorten the set-2 move, then check sets 3–4.
  - G5: explain the marks, popups and inspector text.
- **Where things are:**
  - Logs and screenshots: `~/ux-sim/<id>/`.
  - Brief: `~/ux-sim/PERSONA-BRIEF.md`.
  - Driver: `~/ux-sim/DRIVER.md`.

## Results

| Goal      | pat              | sam           | riley         | morgan                                                        |
| --------- | ---------------- | ------------- | ------------- | ------------------------------------------------------------- |
| G1 move   | yes (second try) | yes           | yes           | yes                                                           |
| G2 hold   | yes              | yes           | yes           | yes                                                           |
| G3 mix    | yes              | yes           | yes           | partly (OT8 drifted; the Ctrl+A bug)                          |
| G4 change | **surprised**    | **surprised** | **surprised** | as expected ("absolute keyframes"), but "a director wouldn't" |

**Everyone understood the core rule unprompted.** "Later sets keep them there", "like copied
slides", "a held keyframe". The inspector's **"Hold from Page 2 →"** was named the most useful thing
by all four.

## Findings

1. **G4 surprised every non-expert, and nothing warned them.**
   - After the set-2 move was shortened, the six marchers holding through set 3 followed. OT1 and
     OT8 have their own set-3 move, so they kept their absolute spot and now walk diagonally.
   - Three of four expected them to step out sideways "from wherever the line ended up". All four
     found it only by clicking through the sets ("I'd have shown my director a messed-up opener").
   - In page mode the toast still said "Pages 3–4 followed (they were copies)". **Only Page 2**
     then made the whole band march forward again during set 3.
2. **Nobody noticed the hold marks unprompted.**
   - When they found them, the diamond read as "a keyframe" or "I changed this set" (right), and
     the bars as "holding" (right). The dashed bar was guessed as "some hold".
   - The lines are too faint and the diamond too small.
   - The marks vanishing with no selection confused two of them.
   - Their `title` tooltips exist, but a headless capture can't show native tooltips, so these
     users never saw them. That is a test artifact, not evidence that the tooltips fail.
3. **"Hold from Page 0"** before any move: "there's no page 0". It should say the start.
4. **Popups mostly didn't appear,** as designed. The one moment that needed one was G4.
5. **A real bug, fixed in this branch (it was already in the base):** Ctrl+A and Ctrl+S also ran
   the A/S nudge shortcuts on Linux and Windows. That moved a marcher, gave a false "No marchers
   selected", and probably caused morgan's OT8 drift. The same fix is upstream (#1044).
6. **Problems already in the base** (backlog, not this branch):
   - Where you click in a page box decides how long the move is; the only hint is a small label.
   - The move bar's end can't be grabbed, because the playhead sits on it.
   - Right-clicking a page box shows only red delete items.
   - There is no Select all in the Select menu.
   - The inspector doesn't follow playback.
   - The X field won't take typing (typed digits hit shortcuts, then a page-shapes toast).
   - Undo jumps to another page.
   - `|<` goes back one set.

## Recommendation (lead)

1. **G4:** when an edit moves marchers who hold into a later page, and the same marchers have their
   own move on that page, say so and offer to carry the change into those moves too.
   - Example: "OT1 and OT8 have their own move on Page 3, so they kept their spot · Move them too".
   - "Move them too" shifts those later destinations by the same offset, in the same undo step.
   - It uses the toasts kept for surprises, and is the same in both modes.
   - It doesn't change the model: destinations stay absolute (D-5). This needs the owner.
2. **Page mode:** when only some marchers followed, the toast says so: "6 of 8 followed on Page 3".
3. **Marks:**
   - Make the bar 3px at a higher contrast, and double the diamond.
   - With nothing selected, show the marks for the whole band rather than nothing. Owner choice:
     the calm-timeline rule said nothing without a selection.
4. **Inspector:** "Hold from the start".

## Owner questions

1. Is G4's "Move them too" the right answer? The alternative, later moves that are relative to the
   page before, is a model change against D-5 and the confirmed live-link direction.
2. Should the marks show for the whole band when nothing is selected?
