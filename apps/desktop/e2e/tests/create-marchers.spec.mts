import { expect } from "@playwright/test";
import { test } from "../fixtures.mjs";

test.skip("Create multiple types of marchers", async ({ electronApp }) => {
    const { page } = electronApp;
    await page.getByRole("button", { name: "Marchers" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Quantity" }).click();
    await page.getByRole("spinbutton", { name: "Quantity" }).fill("75");
    await page.getByRole("combobox", { name: "Section" }).click();
    await page.getByLabel("Baritone").getByText("Baritone").click();
    await page.getByRole("button", { name: "Create Marcher Button" }).click();
    // await expect(page.getByText('B1', { exact: true })).toBeVisible();
    await page.getByText("B75").click();
    await expect(page.locator("#marcherListForm")).toMatchAriaSnapshot(`
      - paragraph: List
      - button "Edit Marchers"
      - paragraph: "#"
      - paragraph: Section
      - paragraph: Name
      - paragraph: B1
      - paragraph: Baritone
      - paragraph
      - paragraph: B2
      - paragraph: Baritone
      - paragraph
      - paragraph: B3
      - paragraph: Baritone
      - paragraph
      - paragraph: B4
      - paragraph: Baritone
      - paragraph
      - paragraph: B5
      - paragraph: Baritone
      - paragraph
      - paragraph: B6
      - paragraph: Baritone
      - paragraph
      - paragraph: B7
      - paragraph: Baritone
      - paragraph
      - paragraph: B8
      - paragraph: Baritone
      - paragraph
      - paragraph: B9
      - paragraph: Baritone
      - paragraph
      - paragraph: B10
      - paragraph: Baritone
      - paragraph
      - paragraph: B11
      - paragraph: Baritone
      - paragraph
      - paragraph: B12
      - paragraph: Baritone
      - paragraph
      - paragraph: B13
      - paragraph: Baritone
      - paragraph
      - paragraph: B14
      - paragraph: Baritone
      - paragraph
      - paragraph: B15
      - paragraph: Baritone
      - paragraph
      - paragraph: B16
      - paragraph: Baritone
      - paragraph
      - paragraph: B17
      - paragraph: Baritone
      - paragraph
      - paragraph: B18
      - paragraph: Baritone
      - paragraph
      - paragraph: B19
      - paragraph: Baritone
      - paragraph
      - paragraph: B20
      - paragraph: Baritone
      - paragraph
      - paragraph: B21
      - paragraph: Baritone
      - paragraph
      - paragraph: B22
      - paragraph: Baritone
      - paragraph
      - paragraph: B23
      - paragraph: Baritone
      - paragraph
      - paragraph: B24
      - paragraph: Baritone
      - paragraph
      - paragraph: B25
      - paragraph: Baritone
      - paragraph
      - paragraph: B26
      - paragraph: Baritone
      - paragraph
      - paragraph: B27
      - paragraph: Baritone
      - paragraph
      - paragraph: B28
      - paragraph: Baritone
      - paragraph
      - paragraph: B29
      - paragraph: Baritone
      - paragraph
      - paragraph: B30
      - paragraph: Baritone
      - paragraph
      - paragraph: B31
      - paragraph: Baritone
      - paragraph
      - paragraph: B32
      - paragraph: Baritone
      - paragraph
      - paragraph: B33
      - paragraph: Baritone
      - paragraph
      - paragraph: B34
      - paragraph: Baritone
      - paragraph
      - paragraph: B35
      - paragraph: Baritone
      - paragraph
      - paragraph: B36
      - paragraph: Baritone
      - paragraph
      - paragraph: B37
      - paragraph: Baritone
      - paragraph
      - paragraph: B38
      - paragraph: Baritone
      - paragraph
      - paragraph: B39
      - paragraph: Baritone
      - paragraph
      - paragraph: B40
      - paragraph: Baritone
      - paragraph
      - paragraph: B41
      - paragraph: Baritone
      - paragraph
      - paragraph: B42
      - paragraph: Baritone
      - paragraph
      - paragraph: B43
      - paragraph: Baritone
      - paragraph
      - paragraph: B44
      - paragraph: Baritone
      - paragraph
      - paragraph: B45
      - paragraph: Baritone
      - paragraph
      - paragraph: B46
      - paragraph: Baritone
      - paragraph
      - paragraph: B47
      - paragraph: Baritone
      - paragraph
      - paragraph: B48
      - paragraph: Baritone
      - paragraph
      - paragraph: B49
      - paragraph: Baritone
      - paragraph
      - paragraph: B50
      - paragraph: Baritone
      - paragraph
      - paragraph: B51
      - paragraph: Baritone
      - paragraph
      - paragraph: B52
      - paragraph: Baritone
      - paragraph
      - paragraph: B53
      - paragraph: Baritone
      - paragraph
      - paragraph: B54
      - paragraph: Baritone
      - paragraph
      - paragraph: B55
      - paragraph: Baritone
      - paragraph
      - paragraph: B56
      - paragraph: Baritone
      - paragraph
      - paragraph: B57
      - paragraph: Baritone
      - paragraph
      - paragraph: B58
      - paragraph: Baritone
      - paragraph
      - paragraph: B59
      - paragraph: Baritone
      - paragraph
      - paragraph: B60
      - paragraph: Baritone
      - paragraph
      - paragraph: B61
      - paragraph: Baritone
      - paragraph
      - paragraph: B62
      - paragraph: Baritone
      - paragraph
      - paragraph: B63
      - paragraph: Baritone
      - paragraph
      - paragraph: B64
      - paragraph: Baritone
      - paragraph
      - paragraph: B65
      - paragraph: Baritone
      - paragraph
      - paragraph: B66
      - paragraph: Baritone
      - paragraph
      - paragraph: B67
      - paragraph: Baritone
      - paragraph
      - paragraph: B68
      - paragraph: Baritone
      - paragraph
      - paragraph: B69
      - paragraph: Baritone
      - paragraph
      - paragraph: B70
      - paragraph: Baritone
      - paragraph
      - paragraph: B71
      - paragraph: Baritone
      - paragraph
      - paragraph: B72
      - paragraph: Baritone
      - paragraph
      - paragraph: B73
      - paragraph: Baritone
      - paragraph
      - paragraph: B74
      - paragraph: Baritone
      - paragraph
      - paragraph: B75
      - paragraph: Baritone
      - paragraph
      `);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("combobox", { name: "Section" }).click();
    await page.getByLabel("Piccolo").getByText("Piccolo").click();
    await page.getByRole("spinbutton", { name: "Quantity" }).click();
    await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
    await page.getByRole("button", { name: "Create Marcher Button" }).click();
    await expect(page.locator("#table")).toMatchAriaSnapshot(`
      - paragraph: "#"
      - paragraph: Section
      - paragraph: Name
      - paragraph: P1
      - paragraph: Piccolo
      - paragraph
      - paragraph: P2
      - paragraph: Piccolo
      - paragraph
      - paragraph: B1
      - paragraph: Baritone
      - paragraph
      - paragraph: B2
      - paragraph: Baritone
      - paragraph
      - paragraph: B3
      - paragraph: Baritone
      - paragraph
      - paragraph: B4
      - paragraph: Baritone
      - paragraph
      - paragraph: B5
      - paragraph: Baritone
      - paragraph
      - paragraph: B6
      - paragraph: Baritone
      - paragraph
      - paragraph: B7
      - paragraph: Baritone
      - paragraph
      - paragraph: B8
      - paragraph: Baritone
      - paragraph
      - paragraph: B9
      - paragraph: Baritone
      - paragraph
      - paragraph: B10
      - paragraph: Baritone
      - paragraph
      - paragraph: B11
      - paragraph: Baritone
      - paragraph
      - paragraph: B12
      - paragraph: Baritone
      - paragraph
      - paragraph: B13
      - paragraph: Baritone
      - paragraph
      - paragraph: B14
      - paragraph: Baritone
      - paragraph
      - paragraph: B15
      - paragraph: Baritone
      - paragraph
      - paragraph: B16
      - paragraph: Baritone
      - paragraph
      - paragraph: B17
      - paragraph: Baritone
      - paragraph
      - paragraph: B18
      - paragraph: Baritone
      - paragraph
      - paragraph: B19
      - paragraph: Baritone
      - paragraph
      - paragraph: B20
      - paragraph: Baritone
      - paragraph
      - paragraph: B21
      - paragraph: Baritone
      - paragraph
      - paragraph: B22
      - paragraph: Baritone
      - paragraph
      - paragraph: B23
      - paragraph: Baritone
      - paragraph
      - paragraph: B24
      - paragraph: Baritone
      - paragraph
      - paragraph: B25
      - paragraph: Baritone
      - paragraph
      - paragraph: B26
      - paragraph: Baritone
      - paragraph
      - paragraph: B27
      - paragraph: Baritone
      - paragraph
      - paragraph: B28
      - paragraph: Baritone
      - paragraph
      - paragraph: B29
      - paragraph: Baritone
      - paragraph
      - paragraph: B30
      - paragraph: Baritone
      - paragraph
      - paragraph: B31
      - paragraph: Baritone
      - paragraph
      - paragraph: B32
      - paragraph: Baritone
      - paragraph
      - paragraph: B33
      - paragraph: Baritone
      - paragraph
      - paragraph: B34
      - paragraph: Baritone
      - paragraph
      - paragraph: B35
      - paragraph: Baritone
      - paragraph
      - paragraph: B36
      - paragraph: Baritone
      - paragraph
      - paragraph: B37
      - paragraph: Baritone
      - paragraph
      - paragraph: B38
      - paragraph: Baritone
      - paragraph
      - paragraph: B39
      - paragraph: Baritone
      - paragraph
      - paragraph: B40
      - paragraph: Baritone
      - paragraph
      - paragraph: B41
      - paragraph: Baritone
      - paragraph
      - paragraph: B42
      - paragraph: Baritone
      - paragraph
      - paragraph: B43
      - paragraph: Baritone
      - paragraph
      - paragraph: B44
      - paragraph: Baritone
      - paragraph
      - paragraph: B45
      - paragraph: Baritone
      - paragraph
      - paragraph: B46
      - paragraph: Baritone
      - paragraph
      - paragraph: B47
      - paragraph: Baritone
      - paragraph
      - paragraph: B48
      - paragraph: Baritone
      - paragraph
      - paragraph: B49
      - paragraph: Baritone
      - paragraph
      - paragraph: B50
      - paragraph: Baritone
      - paragraph
      - paragraph: B51
      - paragraph: Baritone
      - paragraph
      - paragraph: B52
      - paragraph: Baritone
      - paragraph
      - paragraph: B53
      - paragraph: Baritone
      - paragraph
      - paragraph: B54
      - paragraph: Baritone
      - paragraph
      - paragraph: B55
      - paragraph: Baritone
      - paragraph
      - paragraph: B56
      - paragraph: Baritone
      - paragraph
      - paragraph: B57
      - paragraph: Baritone
      - paragraph
      - paragraph: B58
      - paragraph: Baritone
      - paragraph
      - paragraph: B59
      - paragraph: Baritone
      - paragraph
      - paragraph: B60
      - paragraph: Baritone
      - paragraph
      - paragraph: B61
      - paragraph: Baritone
      - paragraph
      - paragraph: B62
      - paragraph: Baritone
      - paragraph
      - paragraph: B63
      - paragraph: Baritone
      - paragraph
      - paragraph: B64
      - paragraph: Baritone
      - paragraph
      - paragraph: B65
      - paragraph: Baritone
      - paragraph
      - paragraph: B66
      - paragraph: Baritone
      - paragraph
      - paragraph: B67
      - paragraph: Baritone
      - paragraph
      - paragraph: B68
      - paragraph: Baritone
      - paragraph
      - paragraph: B69
      - paragraph: Baritone
      - paragraph
      - paragraph: B70
      - paragraph: Baritone
      - paragraph
      - paragraph: B71
      - paragraph: Baritone
      - paragraph
      - paragraph: B72
      - paragraph: Baritone
      - paragraph
      - paragraph: B73
      - paragraph: Baritone
      - paragraph
      - paragraph: B74
      - paragraph: Baritone
      - paragraph
      - paragraph: B75
      - paragraph: Baritone
      - paragraph
      `);

    // ---------------------
});

// test(async ({ electronApp }) => {
//     const { app, databasePath } = electronApp;
//     const context = await browser.newContext();
//     const page = await context.newPage();
//     await page.getByRole("button", { name: "Marchers" }).click();
//     await page.getByRole("button", { name: "Add", exact: true }).click();
//     await page.getByRole("spinbutton", { name: "Quantity" }).click();
//     await page.getByRole("spinbutton", { name: "Quantity" }).fill("75");
//     await page.getByRole("combobox", { name: "Section" }).click();
//     await page.getByLabel("Trumpet").getByText("Trumpet").click();
//     await page.getByRole("combobox", { name: "Section" }).click();
//     await page.getByLabel("Baritone").getByText("Baritone").click();
//     await page.getByRole("button", { name: "Create Marcher Button" }).click();
//     // await expect(page.getByText('B1', { exact: true })).toBeVisible();
//     await page.getByText("B75").click();
//     await expect(page.locator("#marcherListForm")).toMatchAriaSnapshot(`
//       - paragraph: List
//       - button "Edit Marchers"
//       - paragraph: "#"
//       - paragraph: Section
//       - paragraph: Name
//       - paragraph: B1
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B2
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B3
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B4
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B5
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B6
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B7
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B8
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B9
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B10
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B11
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B12
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B13
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B14
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B15
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B16
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B17
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B18
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B19
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B20
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B21
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B22
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B23
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B24
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B25
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B26
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B27
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B28
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B29
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B30
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B31
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B32
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B33
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B34
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B35
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B36
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B37
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B38
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B39
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B40
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B41
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B42
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B43
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B44
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B45
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B46
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B47
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B48
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B49
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B50
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B51
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B52
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B53
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B54
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B55
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B56
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B57
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B58
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B59
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B60
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B61
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B62
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B63
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B64
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B65
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B66
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B67
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B68
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B69
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B70
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B71
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B72
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B73
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B74
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B75
//       - paragraph: Baritone
//       - paragraph
//       `);
//     await page.getByRole("button", { name: "Add", exact: true }).click();
//     await page.getByRole("combobox", { name: "Section" }).click();
//     await page.getByLabel("Piccolo").getByText("Piccolo").click();
//     await page.getByRole("spinbutton", { name: "Quantity" }).click();
//     await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
//     await page.getByRole("button", { name: "Create Marcher Button" }).click();
//     await expect(page.locator("#table")).toMatchAriaSnapshot(`
//       - paragraph: "#"
//       - paragraph: Section
//       - paragraph: Name
//       - paragraph: P1
//       - paragraph: Piccolo
//       - paragraph
//       - paragraph: P2
//       - paragraph: Piccolo
//       - paragraph
//       - paragraph: B1
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B2
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B3
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B4
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B5
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B6
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B7
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B8
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B9
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B10
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B11
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B12
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B13
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B14
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B15
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B16
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B17
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B18
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B19
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B20
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B21
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B22
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B23
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B24
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B25
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B26
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B27
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B28
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B29
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B30
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B31
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B32
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B33
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B34
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B35
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B36
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B37
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B38
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B39
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B40
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B41
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B42
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B43
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B44
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B45
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B46
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B47
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B48
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B49
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B50
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B51
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B52
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B53
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B54
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B55
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B56
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B57
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B58
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B59
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B60
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B61
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B62
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B63
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B64
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B65
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B66
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B67
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B68
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B69
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B70
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B71
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B72
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B73
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B74
//       - paragraph: Baritone
//       - paragraph
//       - paragraph: B75
//       - paragraph: Baritone
//       - paragraph
//       `);

//     // ---------------------
//     await context.close();
//     await browser.close();
// })();
