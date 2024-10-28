# Testing the Database

In order to test the database in electron, `better-sqlite3` must be compiled with the same version of node as the front end.

There is a script in `package.json` to do this.
Simply run:

```bash
# Compile packages for tests and run them
npm run test:prepare
```

This will, however, break the app and you will not be able to launch it.
To launch the app, run this:

```bash
# Compile packages for dev environment to run the app
npm run app:prepare
npm run dev
```
