const fs = require("fs");
const path = require("path");

// --- CONFIGURATION ---
// Adjust this path if your desktop app is in a different folder
const desktopAppPath = path.join(__dirname, "..", "apps/desktop");
const expectedBinaryPkg = `@libsql/darwin-arm64`;
// ---------------------

console.log(
    `🚀 Diagnostic: Checking libSQL for ${process.platform}-${process.arch}`,
);

function checkPath(label, relativePath) {
    const fullPath = path.resolve(desktopAppPath, "node_modules", relativePath);
    console.log(`\nChecking ${label}:`);
    console.log(`  Path: ${fullPath}`);

    if (!fs.existsSync(fullPath)) {
        console.log(`  ❌ NOT FOUND`);
        return false;
    }

    const stats = fs.lstatSync(fullPath);
    if (stats.isSymbolicLink()) {
        try {
            const realPath = fs.realpathSync(fullPath);
            console.log(`  🔗 Symlink (Points to: ${realPath})`);
            if (!fs.existsSync(realPath)) {
                console.log(`  ⚠️  BROKEN SYMLINK! The target does not exist.`);
            }
        } catch (e) {
            console.log(`  ❌ BROKEN SYMLINK! Could not resolve target.`);
        }
    } else {
        console.log(`  ✅ Physical Directory/File`);
    }
    return true;
}

// 1. Check if the wrapper exists
checkPath("Wrapper Package", "libsql");

// 2. Check if the native binary package exists
checkPath("Native Binary Package", expectedBinaryPkg);

// 3. Attempt a "Dry Run" Load
console.log(`\nTesting Module Load:`);
try {
    // We try to require it from the desktop app's perspective
    const libsqlPath = path.resolve(desktopAppPath, "node_modules", "libsql");
    const db = require(libsqlPath);
    console.log(`  ✅ Successfully loaded 'libsql' via require().`);
} catch (err) {
    console.log(`  ❌ FAILED to load 'libsql'.`);
    console.log(`  Error Code: ${err.code}`);
    console.log(
        `  Stack Trace snippet: ${err.stack.split("\n").slice(0, 3).join("\n")}`,
    );
}
