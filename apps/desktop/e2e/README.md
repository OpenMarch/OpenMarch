# End-to-end testing process

End-to-end (or E2E) tests are a fantastic way to validate whole-system functionality in OpenMarch.
While they don't replace unit tests, it's often very helpful to know that everything is working together as it should.

The end-to-end tests run OpenMarch in the production build, so they are especially useful for finding bugs we may not have seen in development.

If you're ever lost, or if you think this guide isn't helpful, check out the github action `.github/workflows/desktop-e2e.yaml`.
This will have the most update initialization info

## How it works

OpenMarch uses [Playwright](https://playwright.dev/) for our E2E tests, a standard E2E tool in the web world.

Since OpenMarch relies on heavy context (marchers being created, music being imported, etc.) we take advantage of
Playwright's [fixtures](https://playwright.dev/docs/test-fixtures).
These allow to define re-usable setup and cleanup functions that can be reused for every test to streamline logic and
focus on functionality.

For example, every test needs its own `.dots` file.
One test can't rely on another to put the `.dots` file in a usable state, and we don't want one failed test to mess up the whole suite.
Fixtures are a perfect solution to this.

Each test is given the base `setupDb` fixture, which does the following:

1. Find the `_blank.dots` file and assert it exists
1. Copy this file into a temporary directory that only that test has access to
1. Waits for the test to finish
1. Deletes the temporary `.dots` file

This keep every test _atomic_, removing race conditions and confusion.

### Adding data to the temporary database

Since we don't want every test to start of blank, we can also use fixtures to add pre-existing test data to our temporary `.dots` file.

If you look in the `e2e/mock-databases` folder, you'll notice that there are some `.sql` files.
These files represent isolated data blocks that we can add to the database before a test runs.
You can see an example of this in the `audioFiles` fixture.

```ts
// fixtures.ts
audioFiles: async ({}, use, testInfo) => {
   // Load and apply SQL using the utility function
   await loadSqlIntoDatabase(testInfo, "audio-files.sql");
   // run the test
   await use({ expectedAudioFiles });
},
```

The advantage of this `.sql` approach is that it lets us store our mock data in reusable chunks, rather than as a whole `.dots` file.

For example, rather than having one `.dots` file with marchers, one with pages, and one with both, we can just
make two `.sql` files and apply those queries to the temporary database.

## Writing your own E2E tests

Writing your own E2E test for a feature you build is the best way to ensure that future code changes don't break it.
Once it's written, it will forever be part of the test suite and we can rest easy knowing that the feature works.
(At least, this is the ideal)

Developing E2E tests in OpenMarch is classified into two steps:

1. **Test generation** - Recording actions taken in OpenMarch and generating code to mimic it
1. **Test execution** - Running the E2E tests to ensure the functionality is working correctly

### First step

This guide assumes you have your project set up and your regular node dependencies downloaded (`pnpm i`)

1. Ensure that you have an up-to-date build

   ```bash
   pnpm run build:electron
   ```

   > This doesn't have to finish all the way, you just need an `apps/desktop/dist-electron` folder

1. Install playwright browsers

   ```bash
   pnpm exec playwright install --with-deps
   ```

1. Run the current test suite to validate Playwright is working

   ```bash
   cd apps/desktop
   pnpm run e2e
   ```

### Code Generation

While you can these tests manually, Playwright comes with a handy code generation tool to help you out.

> Note - Canvas interactions are not ready to be tested yet. We're working on it :)

1. Create a new test file in `apps/desktop/e2e/tests`
   - The file should be formatted at `{test_name}.spec.mts`
   - The `.mts` rather than `.ts` is very important
   - All files that the Playwright suite uses must use `.mts` or `.mjs`. They will not run otherwise
1. Run the code generation tool

   ```bash
   cd apps/desktop
   pnpm run e2e:codegen
   ```

   - To add pre-existing data to the file that launches, run `pnpm run e2e:codegen -h` to see what data is available.
     - All the data you can use is in the `e2e/mock-databases/` folder. Feel free to add your own!

> In the `e2e/mock-databases/`, `.sql` files are preferred to ensure maximum flexibility between tests.
>
> Repeating the example, rather than having one `.dots` file with marchers, one with pages, and one with both, we can just
> make two `.sql` files and apply those queries to the test database.

1. Wait for the OpenMarch and the utility Chrome window to pop up
1. Record your actions (you may need to press the record button)
1. Copy the code generated from the utility window into your test file
   - Use `tests/audio-files.spec.mts` as an example
1. Close OpenMarch and try your test!

```bash
pnpm run e2e {your_test}.spec.mts
```
