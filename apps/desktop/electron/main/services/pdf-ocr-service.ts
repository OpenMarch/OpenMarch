import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { app } from "electron";

export interface OCRWord {
    str: string;
    x: number;
    y: number;
    w: number;
    h: number;
    conf: number;
}

export interface OCRResult {
    words: OCRWord[];
    gpu_used: boolean;
    dpi: number;
    word_count: number;
}

let pythonAvailable: boolean | null = null;
let pythonPath: string | null = null;

/**
 * Check if Python 3 is available and find the executable path
 * Uses system Python (python3 or python command)
 */
export async function checkPythonAvailable(): Promise<boolean> {
    if (pythonAvailable !== null) return pythonAvailable;

    const isWindows = process.platform === "win32";
    const pythonCommands = ["python3", "python"];

    for (const cmd of pythonCommands) {
        try {
            const result = await new Promise<boolean>((resolve) => {
                const proc = spawn(cmd, ["--version"], {
                    shell: isWindows,
                });
                let output = "";
                proc.stdout.on("data", (data) => {
                    output += data.toString();
                });
                proc.on("close", (code) => {
                    if (code === 0 && output.includes("Python 3")) {
                        pythonPath = cmd;
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
                proc.on("error", () => resolve(false));
            });

            if (result) {
                pythonAvailable = true;
                return true;
            }
        } catch {
            continue;
        }
    }

    pythonAvailable = false;
    return false;
}

/**
 * Check if required Python packages are installed
 */
export async function checkPythonPackages(): Promise<boolean> {
    if (!pythonPath) return false;

    try {
        const result = await new Promise<boolean>((resolve) => {
            const proc = spawn(
                pythonPath!,
                ["-c", "import easyocr, pdf2image, PIL, fitz; print('OK')"],
                {
                    shell: process.platform === "win32",
                },
            );
            proc.on("close", (code) => resolve(code === 0));
            proc.on("error", () => resolve(false));
        });
        return result;
    } catch {
        return false;
    }
}

/**
 * Run coordinate sheet parser on a PDF page
 */
export async function runCoordinateParser(
    pdfArrayBuffer: ArrayBuffer,
    pageIndex: number,
    dpi: number = 300,
): Promise<any> {
    if (!pythonPath) {
        // Try to find Python if not already found
        const available = await checkPythonAvailable();
        if (!available) {
            throw new Error("Python not available");
        }
    }

    // Resolve script path relative to app root
    let scriptPath: string;
    if (app.isPackaged) {
        scriptPath = path.join(
            process.resourcesPath,
            "app",
            "scripts",
            "parse_coordinate_sheet.py",
        );
    } else {
        const appPath = app.getAppPath();
        scriptPath = path.join(appPath, "scripts", "parse_coordinate_sheet.py");

        if (!fs.existsSync(scriptPath)) {
            const appRoot = path.resolve(__dirname, "../../../");
            scriptPath = path.join(
                appRoot,
                "scripts",
                "parse_coordinate_sheet.py",
            );
        }

        if (!fs.existsSync(scriptPath)) {
            const cwdScriptPath = path.join(
                process.cwd(),
                "scripts",
                "parse_coordinate_sheet.py",
            );
            if (fs.existsSync(cwdScriptPath)) {
                scriptPath = cwdScriptPath;
            }
        }
    }

    if (!fs.existsSync(scriptPath)) {
        throw new Error(`Parser script not found at ${scriptPath}`);
    }

    return new Promise((resolve, reject) => {
        const proc = spawn(
            pythonPath!,
            [scriptPath, pageIndex.toString(), dpi.toString()],
            {
                shell: process.platform === "win32",
                stdio: ["pipe", "pipe", "pipe"],
            },
        );

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        proc.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        proc.on("error", (error) => {
            reject(
                new Error(`Failed to spawn Python process: ${error.message}`),
            );
        });

        const buffer = Buffer.from(pdfArrayBuffer);

        if (proc.stdin && !proc.stdin.destroyed) {
            proc.stdin.on("error", (error: NodeJS.ErrnoException) => {
                if (error.code !== "EPIPE") {
                    reject(
                        new Error(
                            `Failed to write PDF data to Python process: ${error.message}`,
                        ),
                    );
                }
            });

            try {
                const writeSuccess = proc.stdin.write(buffer);
                if (!writeSuccess) {
                    proc.stdin.once("drain", () => {
                        proc.stdin?.end();
                    });
                } else {
                    proc.stdin.end();
                }
            } catch (error: any) {
                if (error.code !== "EPIPE") {
                    reject(
                        new Error(`Failed to write PDF data: ${error.message}`),
                    );
                    return;
                }
            }
        } else {
            reject(new Error("Python process stdin is not available"));
        }

        proc.on("close", (code) => {
            if (code !== 0) {
                // Try to parse error JSON from stderr first
                let errorMessage = `Parser failed with exit code ${code}`;
                try {
                    const errorJson = JSON.parse(
                        stderr.trim() || stdout.trim(),
                    );
                    if (errorJson.error) {
                        errorMessage = errorJson.error;
                    } else if (stderr.trim()) {
                        errorMessage = stderr.trim();
                    }
                } catch {
                    if (stderr.trim()) errorMessage = stderr.trim();
                }
                reject(new Error(errorMessage));
                return;
            }

            try {
                // Find the JSON output in stdout
                // The script prints debug to stderr, so stdout should be clean JSON
                // But just in case, look for the JSON object
                const trimmed = stdout.trim();
                if (trimmed.startsWith("{")) {
                    const result = JSON.parse(trimmed);
                    resolve(result);
                } else {
                    // Try to find JSON line
                    const lines = stdout.split("\n");
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (line.startsWith("{")) {
                            const result = JSON.parse(line);
                            resolve(result);
                            return;
                        }
                    }
                    throw new Error("No JSON output found");
                }
            } catch (e) {
                reject(
                    new Error(
                        `Failed to parse parser result: ${e instanceof Error ? e.message : String(e)}. stdout: ${stdout.substring(0, 500)}`,
                    ),
                );
            }
        });
    });
}

/**
 * Run Python OCR on a PDF page using EasyOCR
 * @param pdfArrayBuffer - The PDF file as ArrayBuffer
 * @param pageIndex - Zero-based page index
 * @param dpi - DPI for image conversion (default: 300)
 * @returns OCR result with word positions and confidence scores
 */
export async function runPythonOCR(
    pdfArrayBuffer: ArrayBuffer,
    pageIndex: number,
    dpi: number = 300,
): Promise<OCRResult> {
    if (!pythonPath) {
        // Try to find Python if not already found
        const available = await checkPythonAvailable();
        if (!available) {
            throw new Error("Python not available");
        }
    }

    // Resolve script path relative to app root
    // In development: __dirname is dist-electron/main/services/, so we go up to apps/desktop/
    // In packaged: use process.resourcesPath/app
    let scriptPath: string;
    if (app.isPackaged) {
        scriptPath = path.join(
            process.resourcesPath,
            "app",
            "scripts",
            "pdf_ocr_easyocr.py",
        );
    } else {
        // In development, try multiple path resolution strategies
        // Strategy 1: Use app.getAppPath() which should point to apps/desktop/
        const appPath = app.getAppPath();
        scriptPath = path.join(appPath, "scripts", "pdf_ocr_easyocr.py");

        // Strategy 2: If that doesn't work, try relative to __dirname
        // __dirname = .../apps/desktop/dist-electron/main/services/
        // We need: .../apps/desktop/scripts/pdf_ocr_easyocr.py
        if (!fs.existsSync(scriptPath)) {
            const appRoot = path.resolve(__dirname, "../../../");
            scriptPath = path.join(appRoot, "scripts", "pdf_ocr_easyocr.py");
        }

        // Strategy 3: Try from process.cwd() if we're in the right directory
        if (!fs.existsSync(scriptPath)) {
            const cwdScriptPath = path.join(
                process.cwd(),
                "scripts",
                "pdf_ocr_easyocr.py",
            );
            if (fs.existsSync(cwdScriptPath)) {
                scriptPath = cwdScriptPath;
            }
        }
    }

    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
        console.error(`[ocr] __dirname: ${__dirname}`);
        console.error(`[ocr] app.getAppPath(): ${app.getAppPath()}`);
        console.error(`[ocr] process.cwd(): ${process.cwd()}`);
        throw new Error(
            `OCR script not found at ${scriptPath}. Tried paths relative to __dirname, app.getAppPath(), and process.cwd().`,
        );
    }

    return new Promise((resolve, reject) => {
        const proc = spawn(
            pythonPath!,
            [scriptPath, pageIndex.toString(), dpi.toString()],
            {
                shell: process.platform === "win32",
                stdio: ["pipe", "pipe", "pipe"],
            },
        );

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => {
            const text = data.toString();
            stdout += text;
            // Log progress messages for debugging
            if (text.includes("Downloading") || text.includes("Please wait")) {
                console.log(`[ocr] EasyOCR progress: ${text.trim()}`);
            }
        });

        proc.stderr.on("data", (data) => {
            const text = data.toString();
            stderr += text;
            // EasyOCR outputs progress messages to stderr - log them but don't treat as errors
            if (
                text.includes("Downloading") ||
                text.includes("Please wait") ||
                text.includes("This may take")
            ) {
                console.log(`[ocr] EasyOCR progress: ${text.trim()}`);
            }
        });

        // Handle process errors early
        proc.on("error", (error) => {
            reject(
                new Error(`Failed to spawn Python process: ${error.message}`),
            );
        });

        // Send PDF data to stdin with proper error handling
        const buffer = Buffer.from(pdfArrayBuffer);

        // Check if stdin is writable before writing
        if (proc.stdin && !proc.stdin.destroyed) {
            proc.stdin.on("error", (error: NodeJS.ErrnoException) => {
                // EPIPE is expected if process exits early, but we should still handle it gracefully
                if (error.code !== "EPIPE") {
                    reject(
                        new Error(
                            `Failed to write PDF data to Python process: ${error.message}`,
                        ),
                    );
                }
            });

            // Write buffer to stdin
            try {
                const writeSuccess = proc.stdin.write(buffer);

                // If write returns false, wait for drain event before ending
                if (!writeSuccess) {
                    proc.stdin.once("drain", () => {
                        proc.stdin?.end();
                    });
                } else {
                    proc.stdin.end();
                }
            } catch (error: any) {
                // Ignore EPIPE errors (process may have exited early)
                if (error.code !== "EPIPE") {
                    reject(
                        new Error(`Failed to write PDF data: ${error.message}`),
                    );
                    return;
                }
            }
        } else {
            reject(new Error("Python process stdin is not available"));
        }

        proc.on("close", (code) => {
            if (code !== 0) {
                // Try to parse error JSON from stderr first (Python script outputs errors as JSON)
                let errorMessage = `Python OCR failed with exit code ${code}`;

                // Filter out EasyOCR progress messages from stderr
                const stderrLines = stderr.split("\n");
                const errorLines = stderrLines.filter(
                    (line) =>
                        !line.includes("Downloading") &&
                        !line.includes("Please wait") &&
                        !line.includes("This may take") &&
                        line.trim().length > 0,
                );
                const filteredStderr = errorLines.join("\n");

                try {
                    if (filteredStderr) {
                        // Try to parse as JSON first
                        try {
                            const errorJson = JSON.parse(filteredStderr.trim());
                            if (errorJson.error) {
                                errorMessage = errorJson.error;
                            } else {
                                errorMessage = filteredStderr;
                            }
                        } catch {
                            // Not JSON, use as-is
                            errorMessage = filteredStderr;
                        }
                    } else if (stdout) {
                        // Sometimes errors might be in stdout
                        try {
                            const errorJson = JSON.parse(stdout.trim());
                            if (errorJson.error) {
                                errorMessage = errorJson.error;
                            } else {
                                errorMessage = stdout;
                            }
                        } catch {
                            errorMessage = stdout;
                        }
                    } else {
                        errorMessage = `Python OCR failed with exit code ${code}`;
                    }
                } catch {
                    // If parsing fails, use filtered stderr or stdout
                    errorMessage =
                        filteredStderr ||
                        stdout ||
                        `Python OCR failed with exit code ${code}`;
                }
                reject(new Error(errorMessage));
                return;
            }

            // Success - parse JSON result from stdout
            // EasyOCR may have output progress messages, so try to find the JSON line
            try {
                // Try parsing the entire stdout first
                const result = JSON.parse(stdout) as OCRResult;
                resolve(result);
            } catch (e) {
                // If that fails, try to find the last JSON line (EasyOCR might have output progress before the JSON)
                const lines = stdout.split("\n");
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (line.startsWith("{") && line.endsWith("}")) {
                        try {
                            const result = JSON.parse(line) as OCRResult;
                            resolve(result);
                            return;
                        } catch {
                            continue;
                        }
                    }
                }
                reject(
                    new Error(
                        `Failed to parse OCR result: ${e instanceof Error ? e.message : String(e)}. stdout: ${stdout.substring(0, 500)}`,
                    ),
                );
            }
        });
    });
}

/**
 * Initialize OCR service - check Python availability
 */
export async function initializeOCRService(): Promise<{
    available: boolean;
    gpuSupported: boolean;
    message?: string;
}> {
    const available = await checkPythonAvailable();
    if (!available) {
        return {
            available: false,
            gpuSupported: false,
            message: "Python 3 not found",
        };
    }

    const packagesInstalled = await checkPythonPackages();
    if (!packagesInstalled) {
        return {
            available: false,
            gpuSupported: false,
            message:
                "Required Python packages not installed. Run: pip install easyocr pdf2image pillow",
        };
    }

    // Try to detect GPU (this will be done by Python script, but we can check here too)
    // For now, assume GPU might be available
    return {
        available: true,
        gpuSupported: true, // Will be determined at runtime by Python
    };
}
