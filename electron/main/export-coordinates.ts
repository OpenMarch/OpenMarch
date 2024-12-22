// import { dialog } from "electron";
// import * as fs from "fs";
// import puppeteer, { Browser } from "puppeteer";

// let browser: Browser;

export async function generatePDF(renderedPages: string[]) {
    console.log("generatePDF");
    // Launch browser on app ready
    // browser = await puppeteer.launch();

    // const page = await browser.newPage();

    // const combinedHtml = renderedPages.join(
    //     '<div style="page-break-after: always"></div>',
    // );

    // // Set page content
    // await page.setContent(combinedHtml);

    // // Generate PDF
    // const pdfBuffer = await page.pdf({
    //     printBackground: true,
    //     format: "letter",
    //     margin: {
    //         top: "1cm",
    //         right: "1cm",
    //         bottom: "1cm",
    //         left: "1cm",
    //     },
    // });

    // // Show save dialog
    // const { filePath } = await dialog.showSaveDialog({
    //     filters: [{ name: "PDF", extensions: ["pdf"] }],
    // });

    // // Save PDF file
    // if (filePath) {
    //     fs.writeFileSync(filePath, pdfBuffer);
    // }

    // await page.close();
}
