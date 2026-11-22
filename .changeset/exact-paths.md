---
"@openmarch/core": minor
---

Adds exact paths (ADR 0018): one marcher's walk during one move as fixed
shapes (points, arcs, cubics) plus timing keys in ticks, 480 per beat.

- The format: `ExactPath` and its shapes and keys, `checkExactPath` (rules
  EP-1 to EP-6), `exactPlayer` and `exactPointAt` for playback, and
  `followExactEnds`, `retimeExactPath` and `splitExactPath` for edits.
- The converter: `exactPathsOf(snapshot, resolver)` gives one exact path per
  marcher per moving span, within `EXACT_DEFAULT_TOLERANCE` (1/100 of an
  8-to-5 step) of the resolver.

The types are a temporary copy until the `schema` package owns them.
