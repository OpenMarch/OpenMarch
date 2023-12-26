# OpenMarch
[**OpenMarch**](https://www.openmarch.com/) is an open source drill writing software built on web app frameworks. Eventually it will be a cross platform desktop app.

NOTE - if you're reading this right now, OpenMarch is almost fully transitioned into Electron (rather than a browser based environment). The frontend react code is largely unchanged, but rails will be completely removed in place of SQLite running directly in Electron. Check out the [file-system-restructure](https://github.com/AlexDumo/OpenMarch/tree/file-system-restructure) branch too peak at the changes. Merge will happen soon once more verification is done.

## What can **OpenMarch** do?
See [openmarch.com](https://www.openmarch.com/) for current status and a video example

**Can**
- Render a navigable canvas of a college football field
- Create marchers with an assigned section, drill number, and name
- Create multiple pages with a set number of counts
- Move a marcher around and see their coordinates printed in relation to yard lines and hashes
    - e.g. "3.25 steps inside 30 S1" or "11 steps behind front sideline"
- Navigate through pages on the canvas
- Have all marcher, page, and coordinate data saved locally to a db 

**Cannot**
- Save, except what the backend database does automatically.
    - I.e. you can't save your projects as a file.
    - But - all marchers, pages, and coordinates data is retained.
- Open other files
- Undo/redo
- Move multiple marchers at once
- Animate marchers in between pages
- Load music of any kind
- Mark props or non-marcher objects
- Export the drill into any sort of PDF or file

## What is OpenMarch's goal?
To be a free and easy drill writing solution for marching bands, indoor programs, and applicable performing ensembles.
OpenMarch hopes to be enough for 90% of ensembles with reasonable design needs. We want to make drill writing effortless.

OpenMarch is designed with three principles:
- Stay **simple**
- Stay **fast**
- Stay **free**

There may never be a day where OpenMarch has support for a 3D rendered marching band of 900
with live video feed jumbotron props, but who really needs that?

### Features in the vision for OpenMarch
- Robust support for drawing pre-defined and custom shapes with a quick workflow for putting marchers into them.
- Two click follow-the-leader drill generation.
- Support for all operating systems (as it's built in web frameworks).
- Have an accompanying lightweight mobile app for sharing drill sheets/details with students.
- Support reading MIDI and musicXML files for quick page staging and generation.
- Custom fields/floors with the ability to set custom checkpoints for coordinate references.

## What does **OpenMarch** use?
 Main packages
- [**React**](https://react.dev/) - active state response and all things frontend
- [**Ruby on Rails**](https://rubyonrails.org/) - simple backend storage of marchers, pages, and coordinates
- [**Electron Forge**](https://www.electronforge.io/) - container that react app runs in for it to be a desktop app.

Supporting packages
- [**Bootstrap**](https://getbootstrap.com/) - bootstrap
- [**Fabric.js**](http://fabricjs.com/) - the football field "canvas" GUI with marcher dots
- [**Zustand**](https://github.com/pmndrs/zustand) - global state management

## OpenMarch for developers
Currently only one person is working on this. (notice I said "we" a lot above? makes me feel official).
If you would like to help out or learn more, just shoot me an [email](mailto:alex.dumo484@gmail.com)!

This project is still in its infancy with significant and essential features missing (saving and undo lol). The team
that will bring this to life still need to make significant and path-altering decisions about what OpenMarch will be.
Currently, we ("I") work on this project as often as we ("I") can between work and life. We're ("I'm") motivated by a
vision of simple, fast, and free drill designing software for band programs and designers across the country.

### Onboarding
Look at the [wiki](https://github.com/AlexDumo/OpenMarch/wiki) and [Onbaording for Developers](https://github.com/AlexDumo/OpenMarch/wiki/Onboarding-for-Developers)

## OpenMarch for users and drill designers 
OpenMarch does not have any releases or production demos available.
Users who want to try it now are welcome follow the strps to spin up a production environment, though it is missing key features a designer may need.

Check back to [openmarch.com](https://www.openmarch.com/) and this repository periodically for updates. We're looking for some development, help so send your developer friends this way! 

## License
OpenMarch is written under the [GPL-3.0 license](LICENSE). All code written for this project will forever and always
be open and accessible.

###

