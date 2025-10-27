# musicxml-parser

A MusicXML parsing utility for the OpenMarch project

## Development

1. Ensure you have [Node](https://nodejs.org/en/download) installed
1. [pnpm](https://pnpm.io/installation) is optional but recommended
1. Install dependencies

   ```bash
   pnpm install
   ```

1. Run tests

   ```bash
   pnpm run test
   ```

## Creating Tests

To add a new MusicXML parsing test:

1. **Copy the Template Directory**  
   Duplicate the directory `src/__test__/Template Test` and give the new folder a descriptive name.

2. **Rename the TypeScript File**  
   Inside your new folder, rename the `.ts` file (for example, `MyTest.test.ts`) to match your test case.
3. **Replace the Template XML File**  
   Replace the `TEMPLATE.xml` file in your new folder with your actual `.musicxml`, `.XML`, or `.mxl` file.

4. **Update Variables in the Test File**  
   Open the test file and update the following:
   - Change the value of the `filename` variable to match your MusicXML file name.
   - Change the `testName` variable to describe your test case.

5. **Add Your Measures**  
   Edit the `expected` array in the test file to include the measures you want to test.

For a complete example, refer to the `src/__test__/Test Score 1/TestScore1.test.ts` file.

---
