import { notarize } from "@electron/notarize";
import fs from "fs";
import path from "path";

export default async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== "darwin") {
        return;
    }

    const appName = context.packager.appInfo.productFilename;

    let appleApiKey: string;
    let appleApiIssuer: string;
    let appleApiKeyId: string;

    if (process.env.APPLE_API_KEY !== undefined)
        appleApiKey = process.env.APPLE_API_KEY;
    else
        throw new Error(
            "Apple API key is not defined in the environment variable APPLE_API_KEY",
        );

    if (process.env.APPLE_API_KEY_ISSUER !== undefined)
        appleApiIssuer = process.env.APPLE_API_KEY_ISSUER;
    else
        throw new Error(
            "Apple API key issuer is not defined in the environment variable APPLE_API_KEY_ISSUER",
        );
    if (process.env.APPLE_API_KEY_ID !== undefined)
        appleApiKeyId = process.env.APPLE_API_KEY_ID;
    else
        throw new Error(
            "Apple API key ID is not defined in the environment variable APPLE_API_KEY_ID",
        );

    // Create a temporary file to hold the API key
    const tempKeyPath = path.join(__dirname, "apple_api_key.p8");
    fs.writeFileSync(tempKeyPath, process.env.APPLE_API_KEY, {
        encoding: "utf8",
    });

    try {
        await notarize({
            tool: "notarytool",
            appPath: `${appOutDir}/${appName}.app`,
            appleApiKey, // Absolute path to API key (e.g. `/path/to/AuthKey_X0X0X0X0X0.p8`)
            appleApiIssuer, // Issuer ID (e.g. `d5631714-a680-4b4b-8156-b4ed624c0845`)
            appleApiKeyId, // Key ID (e.g. `X0X0X0X0X0`)
        });
    } finally {
        // Clean up the temporary file
        fs.unlinkSync(tempKeyPath);
    }
}
