![Banner](public/githubbanner.png)

<!-- WHENEVER MODIFYING THIS FILE, you must also modify /docs/README.md to ensure the website is up to date.
    maybe there's a better way to do this without symlinks. someone better than me at ruby pls -->

OpenMarch is an open source drill writing software built on web app frameworks.

## What can OpenMarch do?

Check the [website](https://www.OpenMarch.com/) for video demos of what OpenMarch can do!

**Can:**

- Render a navigable canvas of a college football field
- Move a marcher around and see their coordinates printed in relation to yard lines and hashes
  - e.g. "3.25 steps inside 30 S1" or "11 steps behind front sideline"
- Navigate through pages on the canvas
- Have all marcher, page, and coordinate data saved locally to a db
- Save files to the local system
  - Changes are saved automatically as the user makes them
- Undo/redo
  - Undo history stack is baked into the file, so progress is never lost
  - Currently history is unlimited, which could lead to massive files.
  - Likely future revisions will let users define how long they want their history to go.
- Move multiple marchers at once
- Animate marchers in between pages
- Export individual coordinate sheets
- Load audio files and MusicXML files to base the show off of
- Draw a line and distribute marchers
- Support high school, college, and pro football fields

**Cannot:**

- Mark props or non-marcher objects
- Export the drill into a pdf of the grid

## What is OpenMarch's goal?

To be a free and easy drill writing solution for marching bands, indoor programs, and applicable performing ensembles.
OpenMarch hopes to be enough for 90% of ensembles with reasonable design needs. We want to make drill writing effortless.

OpenMarch is designed with three principles:

- Stay **free**
- Stay **fast**
- Stay **simple**

There may never be a day where OpenMarch has support for a 3D rendered marching band of 900
with live video feed jumbotron props.
OpenMarch's current (and really only) focus is on the drill-writing experience.

### Features in the vision for OpenMarch

- Robust support for drawing pre-defined and custom shapes with a quick workflow for putting marchers into them.
  - Integrate open source tools for quick shape detection (e.g. reading a school's logo and translating that to coordinates).
- Two click follow-the-leader drill generation.
- Support for all operating systems (as it's built in web frameworks).
- Have an accompanying lightweight mobile app for sharing drill sheets/details with students.
- Custom fields/floors with the ability to set custom checkpoints for coordinate references.

## What does OpenMarch use?

Main packages

- [**React**](https://react.dev/) - active state response and all things frontend
- [**Electron**](https://www.electronjs.org/) - container that react app runs in for it to be a desktop app.

Supporting packages

- [**Tailwind**](https://tailwindcss.com/)
- [**Fabric.js**](http://fabricjs.com/) - the football field "canvas" GUI with marcher dots
- [**Zustand**](https://github.com/pmndrs/zustand) - global state management

## OpenMarch for developers

Currently only one person is working on this. (notice I said "we" a lot above? makes me feel official).
If you would like to help out or learn more, just shoot me an [email](mailto:contact@openmarch.com)!

The team
that will bring this to life needs to make significant and path-altering decisions about what OpenMarch will be.
Currently, we work on this project as often as we can between work and life. We're motivated by a
vision of simple, fast, and free drill designing software for band programs and designers across the country.

### Onboarding

Look at the [wiki](https://github.com/OpenMarch/OpenMarch/wiki) and [Onboarding for Developers](https://github.com/OpenMarch/OpenMarch/wiki/Onboarding-for-Developers)

## OpenMarch for users and drill designers

[**Install 0.0.3**](https://github.com/OpenMarch/OpenMarch/releases/tag/v0.0.3)

> Note that there are bugs and this code is not production-ready.
> Use at your own risk and have fun!

Check back to [OpenMarch.com](https://www.OpenMarch.com/) and this repository periodically for updates. We're looking for some development, help so send your developer friends this way!

## License

OpenMarch is written under the [GPL-3.0 license](LICENSE).
All code written for this project will forever and always be open and accessible.
