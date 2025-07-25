const fs = require("fs");
const path = require("path");

const TARGET_DIR = path.join(__dirname);
const LICENSE_BLOCK = `/**\n * @license Business Source License 1.1\n * See LICENSE.txt for usage restrictions and change date.\n */\n\n`;

function addLicenseHeader(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    if (content.includes("@license Business Source License")) return; // Skip if already added

    const newContent = LICENSE_BLOCK + content;
    fs.writeFileSync(filePath, newContent);
    console.log(`Added license to ${filePath}`);
}

function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            addLicenseHeader(fullPath);
        }
    }
}

walk(TARGET_DIR);
