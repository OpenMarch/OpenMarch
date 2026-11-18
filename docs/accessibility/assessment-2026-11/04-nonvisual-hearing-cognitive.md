# Seat 4: non-visual, Deaf/hard-of-hearing and cognitive access

Scope: blind and low-vision screen reader users, Deaf and hard-of-hearing users, and users with
cognitive, learning or neurodivergent needs (ADHD, dyslexia, autism, anxiety, beginners).

Code read: fork main at e1792b9b0 (`D` below is
`apps/desktop`). Prior findings: the v0.1.7 audit notes (`field.md`, kept outside the repo) and
`understandable-robust.md` (0.1.7). Nothing in the repo was changed.

How this was checked: two read-only code surveys, with the load-bearing claims spot-checked by me
(ReadableCoords, the coordinate sheet table, the disabled inspector inputs, the Space handling in
the dispatcher, no aria on the field, no tagged-PDF option). Nothing was run in the app and no
screen reader was heard. The MuseScore, Reaper/OSARA, VS Code and Logic notes are from my own
knowledge, not checked against current releases. Section 8 lists what is unverified.

## 1. The short version

1. **Do not build a separate "accessible editor".** Build three shared things instead: text twins
   of the visual surfaces, a result sentence for every command, and one accessibility settings
   store with presets on top.
2. **The first win for blind users is reading, not writing.** A student's own dot sheet is
   already a real HTML table in the code. Making it reach a screen reader (tagged PDF, an HTML
   export, coordinates in words) is days of work.
3. **Non-visual authoring is the typed command line plus shapes with parameters.** A blind
   director thinks "trumpets in an arc on the front hash", not "drag 12 dots". The command bar
   and shape recipes are most of the way to that. Dragging dots by keyboard is the wrong target.
4. **The only information the app gives by sound alone is the metronome.** A visual beat and a
   large count readout close most of the Deaf/HoH gap.
5. **The cognitive gaps are about reassurance and control:** undo that names what it undid, a
   message log, text size, a motion switch, and one word per thing.

## 2. Where things stand today

| Area                            | Exists                                                                                                                                                                          | Missing                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Field for a screen reader       | Nothing. `D/src/field/three/ThreeField.tsx` has no role, name, tabindex or fallback content                                                                                     | Everything                                                                                                                    |
| Picking one marcher by keyboard | Select all (Mod+A) only                                                                                                                                                         | Cycle, pick by name, pick by range                                                                                            |
| Coordinates in band words       | `D/src/global/classes/ReadableCoords.ts`: verbose ("3 steps inside 35 yard line", "5 steps behind front hash") and terse ("9 FR BH"), sentence frames localized in 11 languages | Checkpoint names are English strings stored in the show; not used by the collisions list                                      |
| Typing coordinates              | Inspector fields are all `disabled`; `handleCoordsSubmit` is a stub (`MarcherEditor.tsx:525`). Page counts are plain text                                                       | Both                                                                                                                          |
| Dot sheets                      | `MarcherCoordinateSheet.tsx` renders a real `<table>` with `<th>`; printed with `printToPDF`                                                                                    | PDF is untagged, so the table is lost to a screen reader. No HTML, CSV or text export. Drill-chart PDFs (pdfkit) are untagged |
| Timeline for a screen reader    | Good bones: playhead, pages, clips, start flag and rehearsal marks have spoken labels; go-to (G) takes "Page, m23 or C"; some drags have live readouts                          | Page changes, selection and play/stop are not announced                                                                       |
| Commands                        | About 139 registered actions, palette, a command bar with typed steps ("box 4x2 3")                                                                                             | No marcher or page source in the palette; no select-by-name                                                                   |
| Space on a focused button       | Still plays the show, except inside the shape tool (`ShortcutDispatcher.tsx:68-76`)                                                                                             | A general rule. This is a blocker for keyboard and screen reader users                                                        |
| Collisions                      | `CollisionStore`, a toolbar popover list                                                                                                                                        | Raw x/y numbers, plain divs, current page only. Show issues (ADR 0009) not started                                            |
| Formation text                  | Recipes store kind and parameters; each parameter has a spoken label                                                                                                            | No sentence for a shape or a page                                                                                             |
| Visual time                     | Readout "Pg 2 · ct 7/16 · m4 beat 4", clock, playhead, measure numbers, rehearsal marks, waveform, 3D View readout, video export overlay; timeline works with no audio          | No visual metronome; no count on the field; BPM only in Tempo mode                                                            |
| Sounds                          | Music and metronome only. No UI sounds                                                                                                                                          | Good: keep it that way                                                                                                        |
| Simplicity                      | Basic/Expert, Preview mode, welcome flow, example shows, new-show wizard, isolation dimming, compact timeline, refusal reasons on buttons                                       | No focus option while editing; inspector can't be hidden with a mouse                                                         |
| Undo                            | 500 steps, stored in the file                                                                                                                                                   | No names, no history list; the "Undone" toast shows for touch only                                                            |
| Saving                          | Desktop writes every edit straight to the file                                                                                                                                  | No "saved" sign, no versions or backups on desktop (web has 20 versions)                                                      |
| Motion                          | OS `prefers-reduced-motion` respected by timeline, field and 3D glides                                                                                                          | No in-app switch; the Tailwind `animate-*` classes (about 50 uses) and most CSS transitions ignore it                         |
| Text                            | DM Sans, sizes in rem: body 14 px, sub 11 px, micro 10 px                                                                                                                       | No text-size, UI-scale or font setting; Electron zoom is not saved                                                            |
| Messages                        | sonner toasts, polite live region                                                                                                                                               | No close button, no log, auto-dismiss; some carry needed information                                                          |
| Theme                           | Light, Dark                                                                                                                                                                     | No "follow system", no high contrast                                                                                          |
| Automated checks                | A few jsx-a11y rules through `react-app`                                                                                                                                        | No axe in any e2e suite                                                                                                       |

## 3. Screen readers

### 3.1 What the precedents teach

- **Reaper + OSARA.** Reaper's arrange view is as visual as a drill field. OSARA makes no attempt
  to describe the picture. It works because every Reaper feature is an action with a key, and
  OSARA makes each action speak its result ("track 3 selected", "bar 12 beat 1"). It adds
  on-demand questions: where is the cursor, what is selected. Lesson: **the command system is the
  accessibility interface.** OpenMarch's "every feature is a command" rule is the same base.
- **MuseScore 4.** The score is a canvas. A cursor walks a linear order of elements, and each
  stop builds a sentence from the element's properties (pitch, duration, measure, beat, staff)
  and plays the note. Note entry is fully typed. It also exports braille. Lessons: a cursor over
  a sensible order, sentences built from data, hearing the thing itself, and an alternative
  output format for reading.
- **VS Code.** Three ideas worth copying exactly: a screen-reader-optimized setting that is
  `auto / on / off` and detected from the OS; an **Accessible View** that shows any rich surface
  as a plain text buffer; and **accessibility signals**, where each event has a sound and an
  announcement that can be set one by one.
- **Logic Pro.** Every graphic editor has a list twin (the Event List). Sighted power users use
  it too. That is the model for a marcher table.
- **Chess.** Blind players play a spatial game through coordinates and move notation. Band
  coordinates ("4 outside the 35, 8 behind the front hash") are already that notation, and
  marchers already speak it.

### 3.2 Three users, three jobs

| User                                  | Job                         | What they need                                                                | Order                             |
| ------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| Blind or low-vision student marcher   | Read my own dots            | Accessible dot sheet; later, an accessible performer app                      | First                             |
| Blind or low-vision director or staff | Review a show someone wrote | Marcher table, "describe" commands, issue list, playback announcements        | Second                            |
| Blind drill writer                    | Author a show               | Typed shape commands, select by name, typed coordinates, verification by text | Third, and only with real testers |

Blind marchers do march (the Ohio State School for the Blind band is the known example), and
blind band directors exist. The student case is far more common and far cheaper to serve.

### 3.3 Ideas evaluated

**A. Accessible dot sheets (consume). Do first.**

- Turn on tagged PDF for the coordinate sheets. Electron's `printToPDF` has a
  `generateTaggedPDF` option; the sheet is already a real table, so structure should carry
  through. Check the result with a PDF checker and VoiceOver.
- Add "Export as web page" (one HTML file per show or per performer) and CSV. HTML is the most
  reliable format for screen readers, braille displays and phone magnifiers.
- Speak the verbose form. "9 FR BH" is meaningless in speech; the verbose strings exist.
- Add a large-print option (18 pt or more) for low vision.
- Feasibility: high. Days. Risk: tagged output from Chromium is usable but not perfect.

**B. A "route sheet": the dot sheet as instructions. New, and useful to every marcher.**
A coordinate tells you where to stand. A marcher who can't see the form also needs how to get
there and who is around them. Per set, add:

- direction of travel in body terms ("forward and to the left", or toward side 1 / the back),
- distance and step size in band terms ("12 steps, 8-to-5"), counts, or "hold",
- neighbors on arrival ("T2 two steps to your left, M1 four steps in front").

All of it can be computed from data the app has. Sighted students ask "who do I guide to?"
all the time, so this is not a niche feature. Feasibility: medium (about a week for the math
and layout). The wording needs band directors to check it.

**C. Marcher table (review and edit). The core in-app twin.**
A real grid for the current page: one row per marcher; columns for side-to-side, front-to-back,
the move into this page (counts, distance, step size, direction) and nearest neighbors. Sort and
filter by section. Selection is shared with the field. Cells accept typed coordinates.

- This is Logic's Event List for drill. Sighted users get exact entry and bulk checks.
- It gives braille display users real text, which speech-only announcements don't.
- It needs the inspector's coordinate write path finished first (the stub at
  `MarcherEditor.tsx:525`).
- Feasibility: medium. One to two weeks with a virtualized grid and proper grid keys.

**D. Every command says what it did. The keystone.**
Give each action an outcome sentence: "Moved 12 marchers 2 steps toward side 1", "Page 5 of 23,
16 counts", "Nothing to undo". One string serves four readers:

1. the screen reader announcer (a pair of live regions),
2. the undo name and history list (section 5),
3. the toast and message log,
4. agents and the parked command API (#357), which need a result text anyway.

Feasibility: medium, incremental. About 139 actions; start with navigation, selection, undo and
playback. A check can require an outcome for new actions.

**E. Question commands (OSARA style).**
Registered actions with shortcuts, all in the palette:

- "Where is the selection?": coordinates in words, or the bounding area for many.
- "Who is near?": nearest neighbors with distance and direction.
- "Describe this page" and "Describe this move".
- "Read issues": collisions and step-size problems in words, with go-to.

Output goes to the announcer and to a text panel (VS Code's Accessible View) so it can be
re-read line by line. Feasibility: high once D exists. Collisions need ReadableCoords and
whole-show scope, which is ADR 0009's job.

**F. Marcher-to-marcher navigation on the field.**
Make the field focusable. Arrow keys jump to the nearest marcher in that direction; another key
steps through a section in drill order. Each stop announces name, section and coordinates.
Type-to-select by name or range ("T1-T6", already in the taste doc) goes in the palette.

- Also fixes single-marcher selection for sighted keyboard users (a VPAT blocker).
- Feasibility: medium. The selection logic is in the renderer-free editor, which is testable.

**G. Free field cursor that announces what is near. Lower value.**
A cursor that moves by steps and says "crossing the 40" or "3 marchers within 4 steps". It
helps when placing something in empty space, but for review it is slower than the table and
the questions. Build it only as part of typed placement, if testers ask.

**H. Formation descriptions. Two tiers, be honest about the second.**

- From recipes (exact): "Box 8 × 4, 2-step spacing, centered on the 50, 12 steps behind the
  front hash. 32 marchers: trumpets and mellophones." The parameters and their labels exist.
- For hand-placed pages (computed facts, not recognition): extent ("side 1 30 to side 2 30,
  front hash to 8 behind the back hash"), mirror symmetry about the 50, one line per section
  (center and spread).
- Do not promise "the app recognizes a company front". General shape recognition is heuristic
  and will be wrong sometimes; a wrong description is worse than none. If an AI description is
  ever added, label it as a guess.
- Feasibility: recipes tier high; facts tier medium.

**I. Sonification. Prototype only.**

- _Field sweep:_ a line sweeps the field from side 1 to side 2 in about 3 seconds. Each marcher
  clicks as it passes, panned left to right, pitched by depth. A line across is one pitch, a
  diagonal rises, an arc curves, a block is a chord. Precedent: Desmos audio trace and chart
  sonification. About 200 lines of Web Audio.
- _Collision sound during playback:_ cheap.
- Whether the sweep is useful is unknown. It may give a quick overall impression that no text
  can, or it may be a toy. Build it as a throwaway and put it in front of blind musicians
  before deciding.

**J. Counts as speech.** During playback, announce page changes and rehearsal marks ("Page 5,
16 counts"). Do not speak every count through the screen reader: speech lags and won't stay in
time. The metronome's accented beat already carries the pulse.

**K. Tactile drill chart. Speculative.**
The app already makes SVG drill charts. A print variant for swell paper or an embosser (thick
lines, few yard lines, large or braille labels, one section at a time) would let a blind
director feel a form. Low cost once the SVG path is understood; value unproven. Ask testers.

### 3.4 Authoring without sight

The honest route is not "make dragging accessible". It is:

1. select by typing (name, range, section),
2. place with a shape and typed parameters, including a typed position ("s1 35 +4, fh -8"),
3. fine-tune in the table,
4. verify with Describe, Read issues and playback announcements.

The command bar already runs "box 4x2 3". What I did not verify is where a typed shape lands
and whether a position can be typed; that is the main gap. This path is also what an agent
uses, so it shares its cost with #357.

Full authoring parity is months, not weeks. Don't claim it until a blind user has written a
real page with it.

### 3.5 Prerequisites (other seats will cover these; they block everything here)

- Space must press a focused control. The shape tool's rule (`:focus-visible` wins over Play)
  should become the general rule.
- Names, roles and states on controls (VPAT F-ur-4 to F-ur-7), `lang` following the UI language.
- The web editor matters: it reaches VoiceOver on iPad and every desktop screen reader with no
  install, and school devices are often locked down.

## 4. Deaf and hard-of-hearing users

The app is in better shape here than expected: position is shown as page, count, measure, beat
and clock; the timeline works with no audio; video export has a count overlay on by default; no
UI event is sound-only. Ranked gaps:

1. **Visual metronome.** The metronome is audio only, and it is the one place where sound alone
   carries information. Add a beat lamp in the transport that follows the metronome setting,
   with the downbeat marked by shape or size, not only color.
   - Marching tempos reach 180 to 200+ beats a minute, which is above three flashes a second.
     Keep the lamp small and low in contrast change, or use a sweeping motion in place of a
     flash. With reduced motion on, show only the number changing.
2. **Large count display.** An optional big "7 / 16" over the field and in the 3D View, readable
   from across a room. Precedent: Logic's giant beats display. Also good for teaching and for
   anyone with the sound off. The field has no count overlay today.
3. **Setting tempo without hearing.** Tap tempo and beat alignment depend on hearing. MusicXML
   import already gives a tempo map with no listening. Add to it: draw the beat grid over the
   precise waveform so alignment can be checked by eye, and offer automatic onset detection as a
   suggested starting point. Medium effort; onset detection on band recordings is imperfect.
4. **Show tempo in the normal transport.** BPM appears only in Tempo mode.
5. **Remember metronome settings.** They reset on restart.
6. **Captions.** What's New clips are muted, so nothing is needed there. The Learn tab's video
   guides need captions; I did not check whether they have them.
7. **Vibration.** `navigator.vibrate` works on Android browsers only, not iPad. Low value in the
   editor. It belongs in the performer mobile app (a phone buzzing the beat during practice),
   which is a separate repo.
8. **A standing rule:** no information by sound alone, ever. It is true today; write it down.

A "text marker" lane for describing the music ("brass hit", "ballad starts") was considered.
Named rehearsal marks already do most of this. Skip it unless testers ask.

## 5. Cognitive, learning and neurodivergent users

Basic mode, Preview mode, the wizard and example shows are a real start on progressive
disclosure. The refusal reasons that appear on a button when its key can't run are an unusually
good pattern. Ranked gaps:

1. **Undo you can trust.** Name each step ("Undo move 12 marchers") in the Edit menu and in a
   brief message for every input type, not only touch. Add a history list (Logic and Photoshop
   both have one). This is idea D again. `transactionWithHistory` already takes an operation
   name; I did not check whether that name is stored.
2. **A message log.** Toasts vanish, have no close button, and can't be re-read. Keep the last
   messages in a small log (VS Code's notification center) and add a setting to keep messages
   until dismissed. The same log is the screen reader's re-read buffer.
3. **A safety net on desktop.** Every edit writes to the file at once. That removes "did I
   save?" but leaves no way back beyond undo. Show "Saved to file" quietly, and bring the web
   build's versions to desktop. The fork's working-copy work is the obvious base.
4. **Text size and a saved UI scale.** Sizes are in rem, so one root font-size setting should
   scale most of the UI cheaply. Sub text at 11 px and micro at 10 px are small for anyone.
   Field labels use their own renderer and already have a size setting.
5. **A motion setting:** System / Reduced / Full. Add one global CSS rule for the Tailwind
   animations and transitions that ignore the OS preference today.
6. **One word per thing.** The video overlay says "Set" where the app says "Page"; the readout
   mixes "ct" and "beat"; "performer" and "marcher" both appear. `i18n-meta/glossary.json`
   exists: make `check:i18n` reject the banned synonyms. The owner picks the words.
7. **Solo a section.** DAWs have solo and mute. "Solo trumpets" dims or hides everyone else.
   The dimming code exists for isolated moves (`fieldDimming.ts`). Helps ADHD and low vision,
   and any writer cleaning one section.
8. **No silent corrections.** Clamped values, renumbered drill numbers and disabled Next buttons
   with no reason are still in the code. Extend the button refusal pattern to forms.
9. **Always show the mode and the way out.** There are many modes now (Basic/Expert, Preview,
   Tempo, field edit, shape tool, isolation). Each needs a visible name and an exit, in the same
   place.
10. **Reading font.** Offer one alternative (Atkinson Hyperlegible, or the system font). The
    evidence for dyslexia-specific fonts is weak; size, spacing and line length matter more. Do
    it because it is cheap and people ask, and don't oversell it.
11. **A hideable inspector with a mouse**, for a calmer editing layout. Preview mode is
    watch-only, so there is no calm option while editing.

## 6. Separate mode or profiles?

**No separate accessible editing mode.**

- A second editor gets tested less and falls behind. Reaper and MuseScore are one app with one
  set of commands; that is why their blind users can do what sighted users do.
- The non-visual surfaces (table, descriptions, outcome sentences, history, log) are useful to
  everyone. Hiding them in a mode would waste them.
- The app already has many modes. Another axis makes it harder to understand, which hurts the
  cognitive group most.

**Yes to profiles, as presets and nothing more.**

- One accessibility settings store. Each setting works alone.
- A profile is a named bundle that sets several at once. After applying it the user can change
  any one. The app never "is in" a profile.
- Name them by need, not by diagnosis:

| Preset             | Sets                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Screen reader      | Announcements on, verbose coordinates, marcher table open, motion reduced, messages stay until dismissed |
| Keyboard only      | Focus always visible, field navigation hints, palette hint in empty states                               |
| Larger and clearer | Text size up, large field labels, stronger contrast (seat on color decides the details)                  |
| Calm               | Motion reduced, messages stay and are logged, compact layout, auto-follow off, solo dimming on           |
| Sound off          | Beat lamp on, large count display on, tempo shown                                                        |

- Follow the system first: reduced motion, contrast, color scheme, and Electron's signal that
  assistive technology is running (`app.accessibilitySupportEnabled`). Use VS Code's
  `auto / on / off` pattern so detection can be overridden.
- Offer the presets in one optional welcome step ("Anything we should set up for you?") and in
  Settings > Accessibility. Skippable, changeable later.
- Basic/Expert stays a separate question (how much of the product) from these (how it is
  presented).

## 7. A system going forward

Four rules, written into the taste doc and the PR checklist:

1. **Every command says what it did.** An action is not done without an outcome sentence
   (extends "every feature is a command").
2. **Every visual surface has a text twin.** Field: table and Describe. Timeline: readout and
   go-to. 3D View: stated plainly as a visual preview with the readout.
3. **Nothing by one sense alone.** Not sound only, color only, motion only, or hover only.
4. **Nothing changes silently and nothing needed disappears on a timer.**

Checks that fit the existing harness:

- Add axe and an accessibility-tree snapshot to the browser scenarios (none today).
- Turn the VPAT task table into keyboard-only scenarios: "build a two-page show with no
  pointer". They fail today, which is the point.
- Assert on outcome sentences in scenarios. They are stable text.
- A new sim-user persona that is given only the accessibility tree and the announcer log, never
  a screenshot. It is a cheap first filter for "can this be done blind". It does not replace
  real users.

People:

- Recruit a small panel through the lab: a blind musician or band director, a Deaf performer or
  instructor, and two or three neurodivergent writers. Schools for the blind with bands and
  blind-musician groups are the place to ask.
- Per the owner's disclosure rule, any public statement should lead with what does not work yet.

Suggested order:

| Phase | Work                                                                                              | Rough size                 |
| ----- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| 0     | Space on focused controls; names and states; announcer service with page, selection and play/stop | 1 to 2 weeks               |
| 1     | Tagged PDF, HTML and CSV dot sheets, verbose words, large print                                   | Days                       |
| 1     | Beat lamp, large count display, BPM in transport                                                  | Days                       |
| 1     | Settings store, text size, motion switch, message log, presets                                    | 1 to 2 weeks               |
| 2     | Outcome sentences, named undo, history list                                                       | 2 to 3 weeks, incremental  |
| 2     | Marcher table with typed coordinates; field navigation; select by name                            | 2 to 4 weeks               |
| 2     | Describe and Read issues; route sheet                                                             | 2 to 3 weeks               |
| 3     | Typed placement for non-visual authoring, with testers                                            | Months                     |
| Trial | Field sweep sonification; tactile chart                                                           | A few days each, throwaway |

Sizes are my estimates from reading the code, not from building anything.

## 8. Not verified

- No screen reader was run. Timeline labels exist in code; how they sound is unknown.
- Whether `generateTaggedPDF` gives a usable table on the Electron version in use.
- Where a typed shape command places its shape, and whether position can be typed.
- Whether undo operation names are stored in the history tables.
- Whether the Learn tab videos have captions.
- The performer mobile app is not in this repo; its accessibility was not assessed. For blind
  students it may matter more than anything in the editor.
- All figures on precedent apps are from memory.
- None of the ideas has been in front of a disabled user. Sonification, the tactile chart and
  the route-sheet wording need that most.
