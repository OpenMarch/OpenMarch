# OpenMarch

![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/OpenMarch/OpenMarch/total)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/OpenMarch/OpenMarch)
![GitHub License](https://img.shields.io/github/license/OpenMarch/OpenMarch)

![Banner](/.github/assets/githubbanner.png)

OpenMarch is a free, open-source, fast and intuitive drill writing app for the marching arts. This repository is the entire OpenMarch codebase.

## Our goal

To be a free and easy drill writing solution for marching bands, indoor programs, and applicable performing ensembles. OpenMarch hopes to be enough for 90% of ensembles with reasonable design needs. We want to make drill writing effortless.

## Development

<!---
Please update the website's dev docs if you're updating anything important
apps/website/src/content/docs/developers
-->

We are using a monorepo with Turbo, pnpm, and Node.js 22. Here are the main commands you need to know:

```bash
# Install packages
pnpm install

# Prepare electron app
pnpm desktop app:prepare
# Run electron & vite
pnpm desktop dev

# Run the website's astro dev server
pnpm site dev

# Run the design system playground
pnpm ui dev

# Fix
pnpm fix
# or individually:
pnpm format
pnpm lint
pnpm spellcheck

# can also run tasks in specific packages
pnpm desktop lint
```

> [!NOTE]
> If you're having issues with the desktop app's database when running the dev server or installing, try following [these steps](https://github.com/Automattic/node-canvas?tab=readme-ov-file#compiling) and doing a clean `pnpm install`.

See all commands in each project's `package.json`.

Join our [Discord](https://discord.gg/eTsQ98uZzq) to interact with the other contributors and to get support.

### Stack

- **App framework** - Electron
- **Frontend** - React
- **State** - Zustand
- **Styling / UI** - Radix & Tailwind
- **Testing** - Vitest & Playwright

## Users and drill designers

Download the current version of the app on our [website](https://openmarch.com/download/), or the GitHub releases on the sidebar here.

Check out the update videos and posts [here](https://openmarch.com/blog/), to stay up to date with the latest version.

Join our [Discord](https://discord.gg/eTsQ98uZzq) to interact with the community and to get help!

Check out our full [feature list](https://openmarch.com/about/features/) and our [beginner guide](https://openmarch.com/guides/getting-started/) too.

If you're wanting to test the latest and **_unstable_** features, go to the [releases](https://github.com/OpenMarch/OpenMarch/releases) tab on GitHub and download the latest `Pre-release` version displayed. Feel free to give feedback and report bugs in GitHub issues or the Discord.

> Always keep in mind, OpenMarch is still in development. You probably will encounter bugs, issues, and missing features. Help support us grow by contributing or donating!

<div align="center"><img width="700" src="https://github.com/user-attachments/assets/7a744b9e-a3ea-4bb1-a120-6067288c2280" alt="OpenMarch app" /></div>

## License

OpenMarch is written under the [GPL-3.0 license](LICENSE).
All code written for this project will forever and always be open and accessible.
