---
title: "Stack"
description: "What OpenMarch is built with"
---

We have made our stack as easy as possible to contribute to, using common technolgies.

# App

We use [Electron](https://www.electronjs.org/) to make OpenMarch work as a desktop app. It uses Node.js for system functionalites and supports a wide range of front-end frameworks. It runs anywhere, as it is basically just a Chromium browser.

# Front-end

We use [React](https://react.dev/) for the front-end. It is a common framework, with a big community. For global state management we use [Zustand](https://zustand.docs.pmnd.rs/getting-started/introduction).

# Field

The main part of the app, the field, is built with [Fabric.js](http://fabricjs.com/). This is where the football/indoor/custom field and marchers are visualized.

# Styling/UI

We use [Tailwind](https://tailwindcss.com/) for all things styling and CSS. For basic UI components (such as selects, checkboxes), we use [Radix Primitives](https://www.radix-ui.com/primitives) and then apply our own styles on top of them.


# Testing

[Vitest](https://vitest.dev/) and [Playwright](https://playwright.dev/).

# Misc

### Tooling

[Prettier](https://prettier.io/) and [ESLint](https://eslint.org/).

### Website

[Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/) for these docs.
