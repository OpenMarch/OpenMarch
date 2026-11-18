# Architecture Decision Records

Name each record `NNNN-short-decision-name.md`, using the next available number.
When a decision changes, update its status and link the superseding record rather
than rewriting its history.

Use this template:

```markdown
# NNNN: Decision title

- Status: proposed | accepted | superseded
- Date: YYYY-MM-DD

## Context

## Decision

## Consequences

## Verification
```

## Records

- [0001: A tablet layout in the same app](0001-tablet-layout.md)
- [0002: The web editor keeps a library of shows in browser storage](0002-web-show-library.md)
- [0003: App menu items run renderer actions over one IPC channel](0003-menu-actions-ipc.md)
- [0004: Performer cues in the show file](0004-performer-cues.md)
- [0005: A three.js field behind a renderer-independent editor](0005-three-field-renderer.md)
- [0006: Shapes are stored as recipes beside the positions they place](0006-shape-recipes.md)
- [0007: Tempo mode stores holds, tempo changes, time signatures, measure numbers and the music offset in the show](0007-tempo-mode-storage.md)
- [0009: Show issues: pure checks, a worker sweep, and dismissals in the show file](0009-show-issues.md)
- [0010: 3D View window, venues and sync contract](0010-3d-view.md)
- [0011: Collapse the fork's migrations into one, and repair fork files on open](0011-collapse-fork-migrations.md)
- [0012: Timelines replace pages as the motion model](0012-timeline-motion-model.md)
- [0013: Remove the plugin system](0013-remove-plugin-system.md)
- [0014: The desktop app updates itself through electron-updater, shown in the title bar](0014-desktop-updates.md)
- [0015: Cue model: one parameter per cue type](0015-cue-model.md)
- [0016: A move can follow a drawn path](0016-moves-follow-drawn-paths.md) (amended by 0017)
- [0017: A group path is one route; lanes bind slots to it](0017-lanes-on-slots.md)
