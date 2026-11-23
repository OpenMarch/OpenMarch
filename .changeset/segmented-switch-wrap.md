---
"@openmarch/ui": minor
---

`SegmentedTextSwitch` options take an optional `wrap`, which wraps the option's
own item (the focusable button), for example in a tooltip trigger (`asChild`)
so the tooltip opens on focus and describes the item to screen readers.

The selected option is now styled by `aria-checked` instead of
`data-state="on"`, since a tooltip trigger sets its own `data-state` on the
item. Overrides of `data-[state=on]:` passed in `itemClassName` should use
`aria-checked:` instead.
