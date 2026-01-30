import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { GetPlatformProxyOptions } from "wrangler";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sqliteD1Adapter } from "@payloadcms/db-d1-sqlite";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import { r2Storage } from "@payloadcms/storage-r2";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";
import { Posts } from "./collections/Posts";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const realpath = (value: string) =>
    fs.existsSync(value) ? fs.realpathSync(value) : undefined;

const isCLI = process.argv.some((value) =>
    realpath(value)?.endsWith(path.join("payload", "bin.js")),
);
const isProduction = process.env.NODE_ENV === "production";

const cloudflare =
    isCLI || !isProduction
        ? await getCloudflareContextFromWrangler()
        : await getCloudflareContext({ async: true });

export default buildConfig({
    admin: {
        user: Users.slug,
        importMap: {
            baseDir: path.resolve(dirname),
        },
    },
    collections: [Users, Media, Posts],
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || "",
    typescript: {
        outputFile: path.resolve(dirname, "payload-types.ts"),
    },
    db: sqliteD1Adapter({ binding: cloudflare.env.D1 }),
    plugins: [
        r2Storage({
            bucket: cloudflare.env.R2,
            collections: { media: true },
        }),
    ],
});

async function getCloudflareContextFromWrangler(): Promise<{
    env: CloudflareEnv;
}> {
    const mod = await import(
        /* webpackIgnore: true */ `${"__wrangler".replaceAll("_", "")}`
    );
    const { env } = await mod.getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        remoteBindings: isProduction,
    } satisfies GetPlatformProxyOptions);
    return { env };
}
