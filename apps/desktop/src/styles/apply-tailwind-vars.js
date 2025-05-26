const fs = require("fs");
const path = require("path");

// Function to extract variables from tailwind.css
function extractVariables(content) {
    const variables = {
        light: new Map(),
        dark: new Map(),
    };
    const lines = content.split("\n");
    let inThemeBlock = false;
    let inDarkBlock = false;

    lines.forEach((line) => {
        // Check for theme block
        if (line.includes("@theme {")) {
            inThemeBlock = true;
            return;
        }
        if (inThemeBlock && line.trim() === "}") {
            inThemeBlock = false;
            return;
        }

        // Check for dark mode block
        if (line.includes('[class="dark"]')) {
            inDarkBlock = true;
            return;
        }
        if (inDarkBlock && line.trim() === "}") {
            inDarkBlock = false;
            return;
        }

        // Extract variables based on current context
        if ((inThemeBlock || inDarkBlock) && line.includes("--color-")) {
            const match = line.match(/--color-([^:]+):\s*(rgb[a]?\([^)]+\))/);
            if (match) {
                const [, name, value] = match;
                if (inDarkBlock) {
                    variables.dark.set(name.trim(), value.trim());
                } else if (inThemeBlock) {
                    variables.light.set(name.trim(), value.trim());
                }
            }
        }
    });

    return variables;
}

// Function to process a variable reference and return the RGB value
function processVariableReference(varRef, variables, mode = "light") {
    // Extract variable name from different formats
    let varName;
    if (varRef.includes("var(--color-")) {
        varName = varRef.match(/var\(--color-([^)]+)\)/)[1];
    } else if (varRef.includes("rgb(var(--color-")) {
        varName = varRef.match(/rgb\(var\(--color-([^)]+)\)\)/)[1];
    } else if (varRef.includes("rgba(var(--color-")) {
        varName = varRef.match(/rgba\(var\(--color-([^)]+)\)/)[1];
    }

    if (!varName) return null;
    return variables[mode].get(varName);
}

// Function to update index.css
function updateIndexCss(content, variables) {
    const lines = content.split("\n");
    const updatedLines = [];
    let previousLine = "";

    lines.forEach((line) => {
        if (line.includes("/* $SED") || line.includes("/* $SED_DARK")) {
            // Store the comment line
            previousLine = line;
            updatedLines.push(line);
        } else if (
            previousLine.includes("/* $SED") ||
            previousLine.includes("/* $SED_DARK")
        ) {
            // Determine if we're handling a dark mode variable
            const isDark = previousLine.includes("/* $SED_DARK");
            // Extract the variable reference from the previous comment
            const varRef = previousLine.match(
                /\/\* \$SED(?:_DARK)? (.*?) \*\//,
            )[1];
            const rgbValue = processVariableReference(
                varRef,
                variables,
                isDark ? "dark" : "light",
            );

            if (rgbValue) {
                // Replace the placeholder with the actual RGB value
                const updatedLine = line.replace(
                    /"#123456"|#123456|rgb\([^)]+\)/,
                    rgbValue,
                );
                updatedLines.push(updatedLine);
            } else {
                updatedLines.push(line);
            }
            previousLine = "";
        } else {
            updatedLines.push(line);
            previousLine = line;
        }
    });

    return updatedLines.join("\n");
}

async function main() {
    try {
        // Read the tailwind.css file
        const tailwindPath = path.resolve(
            __dirname,
            "../../../../packages/ui/src/tailwind.css",
        );
        const tailwindContent = await fs.promises.readFile(
            tailwindPath,
            "utf8",
        );

        // Read the index.css file
        const indexPath = path.resolve(__dirname, "index.css");
        const indexContent = await fs.promises.readFile(indexPath, "utf8");

        // Extract variables from tailwind.css
        const variables = extractVariables(tailwindContent);

        // Update index.css content
        const updatedContent = updateIndexCss(indexContent, variables);

        // Write the updated content back to index.css
        await fs.promises.writeFile(indexPath, updatedContent, "utf8");

        console.log(
            "Successfully updated color values in index.css for both light and dark modes",
        );
    } catch (error) {
        console.error("Error:", error);
    }
}

main();
