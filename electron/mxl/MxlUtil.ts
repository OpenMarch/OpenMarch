var AdmZip = require("adm-zip");

/**
 * Parses score xml as a string from an MXL file
 * @param filePath path to .mxl file on disk
 * @returns parsed XML or undefined if an error occurred
 */
export function parseMxl(filePath: string): string | undefined {
    try {
        var zip = new AdmZip(filePath);
        var zipEntries = zip.getEntries();

        // Find the root container, this will tell us which zip entry contains the actual score data we care about.
        const rootContainer = zipEntries.find(
            (entry: any) => entry.entryName === "META-INF/container.xml",
        );

        // Parse the root container data to a string
        const rootContainerData = rootContainer.getData().toString("utf8");

        // Pull out the root file path using a regex (I gave up on parsing this "correctly" using xml)
        const regex = /rootfile full-path="([^"]*)"/;
        const match = rootContainerData.match(regex);
        let scorePath = match ? match[1] : undefined;

        // Find the score container and create a string from its xml data
        let scoreContainer = zipEntries.find(
            (zipEntry: any) => zipEntry.entryName === scorePath,
        );
        return scoreContainer.getData().toString("utf8");
    } catch (error) {
        console.error("Error parsing MXL:", error);
        return undefined;
    }
}
