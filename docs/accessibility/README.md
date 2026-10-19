# Accessibility Conformance Report

OpenMarch keeps an Accessibility Conformance Report (ACR) for the desktop app,
written on the [VPAT 2.5 WCAG edition](https://www.itic.org/policy/accessibility/vpat)
template and checked against [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level A
and AA. Schools and districts often ask for one before they approve software.
Each report describes one released version, so a new release needs a new report.

| Version | Report date     | Supports | Partially Supports | Does Not Support | Not Applicable |
| ------- | --------------- | -------- | ------------------ | ---------------- | -------------- |
| 0.1.7   | 19 October 2026 | 15       | 24                 | 8                | 9              |

Copies are sent on request from support@openmarch.com.

## Principles

The report is a public claim that schools rely on, so it errs toward the worse
result.

- Open with a plain-language section on what does not work, before the tables.
- Say that the report was prepared with AI when it was, and name the person who
  reviewed it and is responsible for it.
- Claim "Supports" only with evidence: a scan result, a screenshot, a recorded
  keyboard test or a source reference. VPAT allows "Not Evaluated" only for
  Level AAA, so a Level A or AA criterion that could not be checked is
  "Partially Supports", with a remark saying what was not checked.
- Say which platforms and assistive technologies were and were not tested.
- When the core task fails a criterion, mark it "Does Not Support", even if
  smaller parts of the app pass. The drill field is the core task.

## Standing decisions

These came from the 0.1.7 report. Revisit them only if the app changes.

| Criterion      | Decision                                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1, 4.1.2   | "Does Not Support" while the drill field has no text alternative and screen reader users cannot complete the core workflow. Mention exported coordinate sheets as a partial workaround. |
| 2.4.1, 2.4.5   | "Not Applicable": under [WCAG2ICT](https://www.w3.org/TR/wcag2ict-22/) these apply to a set of software programs, and OpenMarch is a single program.                                    |
| 1.4.10         | The field and timeline are two-dimensional content and are exempt from reflow; the surrounding panels are not.                                                                          |
| 1.2.1 to 1.2.5 | "Not Applicable": imported music and exported video are the user's own content.                                                                                                         |
| 4.1.1          | "Supports": obsolete in WCAG 2.2 and always satisfied.                                                                                                                                  |

## Updating the report for a release

1. **Scope.** Name the version, its release date and the platforms tested. Note
   what is out of scope, such as the web editor or the website.
2. **Find what changed.** List the user-facing changes since the last reported
   version (`git log <last-tag>..<new-tag>`), and mark the criteria each one
   could affect. Recheck those rows first, then the rest.
3. **Automated scan.** Run axe-core with the `wcag2a`, `wcag2aa`, `wcag21a`,
   `wcag21aa` and `wcag22aa` tags on every screen, panel, menu and dialog, in
   light and dark themes. The theme colors use translucent gradients, so axe
   reports most text contrast as "incomplete"; compute those ratios from the
   theme tokens in `packages/ui/src/tailwind.css` instead.
4. **Keyboard tasks.** Do each task with the keyboard alone, using real key
   presses (synthetic test events can behave differently), and record where it
   breaks:
   - First launch on a clean profile, including the analytics consent dialog.
   - Create a show with the new-show wizard.
   - Open every sidebar panel, change a setting, and open and close every dialog.
   - Add marchers; select one particular marcher; select by section.
   - Move marchers by nudging, by typed coordinates and with alignment tools.
   - Add a page, change its counts and delete it.
   - Set the audio file and tempo; play and stop.
   - Export drill charts and video.
   - Switch the interface language.
5. **Screen readers.** Run at least one of VoiceOver (macOS) or NVDA (Windows)
   over the sidebar, title bar, field, timeline, Metronome and Music panels,
   notifications and selects, and once with the interface in another language.
   If none were run, say so in the report.
6. **Visual checks.** Check text and control contrast in both themes, focus
   visibility, 200% zoom, a 320 CSS-pixel-wide window and WCAG text spacing.
7. **Write the report.** Update every row and the counts, the "what does not
   work" section, the evaluation methods and the AI note. Keep findings with
   file references out of the published report; file them as GitHub issues.
8. **Sign-off.** A maintainer reads every row before the report goes out and
   is named as the evaluator. Export it as a PDF, attach it to the GitHub
   release, and update the table at the top of this file.
