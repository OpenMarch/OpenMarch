#!/usr/bin/env node

/**
 * Test script to verify all export functionality combinations work correctly
 * This script tests the export service with various option combinations
 */

const { execSync } = require("child_process");
const path = require("path");

console.log("🧪 Testing OpenMarch Export Functionality\n");

const testCases = [
    {
        name: "Coordinate Sheet Component Tests",
        command:
            "npm test -- src/components/exporting/__test__/MarcherCoordinateSheet.test.tsx --run",
        description:
            "Tests the coordinate sheet component rendering and error handling",
    },
    {
        name: "Export Service Unit Tests",
        command:
            "npm test -- electron/main/services/__test__/export-service.test.ts --run",
        description:
            "Tests the PDF export service with all option combinations",
    },
];

let allTestsPassed = true;

for (const testCase of testCases) {
    console.log(`📋 Running: ${testCase.name}`);
    console.log(`   ${testCase.description}\n`);

    try {
        const output = execSync(testCase.command, {
            cwd: path.join(__dirname, ".."),
            encoding: "utf8",
            stdio: "pipe",
        });

        // Check if tests passed
        if (output.includes("PASS") || output.includes("✓")) {
            console.log("✅ PASSED\n");
        } else {
            console.log("❌ FAILED\n");
            console.log(output);
            allTestsPassed = false;
        }
    } catch (error) {
        console.log("❌ FAILED\n");
        console.log(error.stdout || error.message);
        allTestsPassed = false;
    }
}

console.log("📊 Test Summary");
console.log("================");

if (allTestsPassed) {
    console.log("✅ All export functionality tests PASSED!");
    console.log(
        "\n🎉 Export functionality is working correctly with all option combinations:",
    );
    console.log("   • Single PDF export (organize by section = false)");
    console.log("   • Single PDF export with quarter pages");
    console.log(
        "   • Separate PDFs organized by section (organize by section = true)",
    );
    console.log("   • Individual marcher drill charts");
    console.log("   • Overview drill charts");
    console.log("   • Error handling and timeout scenarios");
    console.log("   • User cancellation scenarios");
    console.log("   • File system error scenarios");

    process.exit(0);
} else {
    console.log("❌ Some tests FAILED. Please check the output above.");
    process.exit(1);
}
