# OpenMarch
[**OpenMarch**](https://www.openmarch.com/) is an open source drill writing software built on web app frameworks.
Eventually, the hope is for OpenMarch to run in something like [**Electron.js**](https://www.electronjs.org/)
so that it can be a cross-platform desktop app.


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

Supporting packages
- [**Bootstrap**](https://getbootstrap.com/) - bootstrap
- [**Fabric.js**](http://fabricjs.com/) - the football field "canvas" GUI with marcher dots
- [**Zustand**](https://github.com/pmndrs/zustand) - global state management

## OpenMarch development
Currently only one person is working on this. (notice I said "we" a lot above? makes me feel official).
If you would like to help out or learn more, just shoot me an [email](mailto:alex.dumo484@gmail.com)!

This project is still in its infancy with significant and essential features missing (saving and undo lol). The team
that will bring this to life still need to make significant and path-altering decisions about what OpenMarch will be.
Currently, we ("I") work on this project as often as we ("I") can between work and life. We're ("I'm") motivated by a
vision of simple, fast, and free drill designing software for band programs and designers across the country.

### Onboarding
Details tbd. If you know how to start a React and Rails dev environment you're golden. If you're completely new to
web dev and still want to help out, shoot me an [email](mailto:alex.dumo484@gmail.com).

## License
OpenMarch is written under the [GPL-3.0 license](LICENSE). All code written for this project will forever and always
be open and accessible.

###

