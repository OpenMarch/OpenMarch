import {
    createServer as createHttpServer,
    IncomingMessage,
    ServerResponse,
} from "node:http";
import path from "node:path";
import { createServer as createViteServer } from "vite";

const dotsPath = process.env.OPENMARCH_DOTS_PATH;
const host = process.env.OPENMARCH_BROWSER_HOST || "127.0.0.1";
const port = Number(process.env.OPENMARCH_BROWSER_PORT || 7777);

if (!process.env.OPENMARCH_BROWSER) {
    process.env.OPENMARCH_BROWSER = "1";
}

if (!dotsPath) {
    console.error(
        "OPENMARCH_DOTS_PATH is required when launching browser mode.",
    );
    process.exit(1);
}

void main();

async function main() {
    const resolvedDotsPath = path.resolve(dotsPath);
    const BrowserDatabaseServices =
        await import("../electron/database/browser.services");
    const setDbResult = BrowserDatabaseServices.setDbPath(resolvedDotsPath);
    if (setDbResult !== 200) {
        console.error(
            `Failed to open .dots file [code=${setDbResult}] [path=${resolvedDotsPath}]`,
        );
        process.exit(1);
    }

    const vite = await createViteServer({
        configFile: path.resolve("vite.config.mts"),
        server: { middlewareMode: true },
        appType: "spa",
    });

    const server = createHttpServer(async (req, res) => {
        if (req.url?.startsWith("/api/")) {
            await handleApiRequest(req, res, BrowserDatabaseServices);
            return;
        }

        vite.middlewares(req, res, () => {
            res.statusCode = 404;
            res.end("Not found");
        });
    });

    server.listen(port, host, () => {
        console.log(`OpenMarch browser mode: http://${host}:${port}`);
        console.log(`Using .dots file: ${resolvedDotsPath}`);
    });
}

async function handleApiRequest(
    req: IncomingMessage,
    res: ServerResponse,
    BrowserDatabaseServices: typeof import("../electron/database/browser.services"),
) {
    try {
        const url = new URL(req.url || "/", `http://${host}:${port}`);

        if (req.method === "GET" && url.pathname === "/api/database/is-ready") {
            sendJson(res, BrowserDatabaseServices.databaseIsReady());
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/database/path") {
            sendJson(res, BrowserDatabaseServices.getDbPath());
            return;
        }

        const body = req.method === "POST" ? await readJsonBody(req) : {};

        if (req.method === "POST" && url.pathname === "/api/sql/proxy") {
            const result = await BrowserDatabaseServices.handleSqlProxy(
                body.sql,
                body.params || [],
                body.method,
            );
            sendJson(res, result);
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/sql/unsafe") {
            sendJson(
                res,
                await BrowserDatabaseServices.handleUnsafeSqlProxy(body.sql),
            );
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/audio/all") {
            sendJson(res, await BrowserDatabaseServices.getAudioFilesDetails());
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/audio/selected") {
            sendJson(res, await BrowserDatabaseServices.getSelectedAudioFile());
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/audio/select") {
            sendJson(
                res,
                await BrowserDatabaseServices.setSelectedAudioFile(
                    body.audioFileId,
                ),
            );
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/audio/update") {
            sendJson(
                res,
                await BrowserDatabaseServices.updateAudioFiles(body.args || []),
            );
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/audio/delete") {
            sendJson(
                res,
                await BrowserDatabaseServices.deleteAudioFile(body.audioFileId),
            );
            return;
        }

        sendJson(res, { error: "Not found" }, 404);
    } catch (error) {
        console.error("Browser API error:", error);
        sendJson(
            res,
            {
                error: error instanceof Error ? error.message : String(error),
            },
            500,
        );
    }
}

function readJsonBody(req: IncomingMessage) {
    return new Promise<any>((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}

function sendJson(res: ServerResponse, data: unknown, statusCode = 200) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
}
