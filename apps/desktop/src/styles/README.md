# Desktop style config

Due to some issues getting the tailwind variables to appear in the desktop app, styles that use classes like `--color-accent` in `apps/desktop/src/styles/index.css` do not work.

To hack through this, I've made a script to automatically replace variable names with their color values.

## Color Variable Processing

We use a special comment syntax `/* $SED */` to mark lines where color variables should be converted from CSS variables to direct RGB values.

## Example

```css
/* Source variable in tailwind.css */
--color-text: rgb(32, 32, 32);

/* In index.css */
/* $SED color: rgb(var(--color-text)); */
color: rgb(32, 32, 32); /* This line is automatically generated */
```

### Usage

This script is run automatically on `pnpm run dev` and `build`, but if you need to run it yourself, do this:

```bash
cd apps/desktop
pnpm run apply-styles
```

This is really just a band-aide until we can figure out why the styles aren't working.
Though, I would not be surprised if we forgot about it and never touched this again
