const { execSync } = require("child_process");
const { existsSync } = require("fs");
const { join } = require("path");

/**
 * Logs to the console
 */
const log = (msg) => console.log(`\n${msg}`); // eslint-disable-line no-console

/**
 * Exits the current process with an error code and message
 */
const exit = (msg) => {
    console.error(msg);
    process.exit(1);
};

/**
 * Executes the provided shell command and redirects stdout/stderr to the console
 */
const run = (cmd, cwd) =>
    execSync(cmd, { encoding: "utf8", stdio: "inherit", cwd });

/**
 * Determines the current operating system (one of ["mac", "windows", "linux"])
 */
const getPlatform = () => {
    switch (process.platform) {
        case "darwin":
            return "mac";
        case "win32":
            return "windows";
        default:
            return "linux";
    }
};

/**
 * Returns the value for an environment variable (or `null` if it's not defined)
 */
const getEnv = (name) => process.env[name.toUpperCase()] || null;

/**
 * Sets the specified env variable if the value isn't empty
 */
const setEnv = (name, value) => {
    if (value) {
        process.env[name.toUpperCase()] = value.toString();
    }
};

/**
 * Returns the value for an input variable (or `null` if it's not defined). If the variable is
 * required and doesn't have a value, abort the action
 */
const getInput = (name, required) => {
    const value = getEnv(`INPUT_${name}`);
    if (required && !value) {
        exit(`"${name}" input variable is not defined`);
    }
    return value;
};

/**
 * Installs NPM dependencies and builds/releases the Electron app
 */
const runAction = () => {
    console.log("PLATFORM:", process.platform);
    console.log("ARCH:", process.arch);

    const platform = getPlatform();
    const release = getInput("release", true) === "true";
    const pkgRoot = "apps/desktop";
    const maxAttempts = Number(getInput("max_attempts") || "1");
    const args = getInput("args") || "";
    let runtimeArgs = "";

    const pkgJsonPath = join(pkgRoot, "package.json");

    // Make sure `package.json` file exists
    if (!existsSync(pkgJsonPath)) {
        exit(`\`package.json\` file not found at path "${pkgJsonPath}"`);
    }

    // Copy "github_token" input variable to "GH_TOKEN" env variable (required by `electron-builder`)
    setEnv("GH_TOKEN", getInput("github_token", true));

    // Validate publishing credentials
    if (release) {
        if (platform === "linux") {
            log(
                "Platform is linux and release is true. Validating snapcraft credentials...",
            );
            run("snapcraft whoami -q");
        }
    }

    // Require code signing certificate and password if building for macOS. Export them to environment
    // variables (required by `electron-builder`)
    if (platform === "mac") {
        setEnv("CSC_LINK", getInput("mac_certs"));
        setEnv("CSC_KEY_PASSWORD", getInput("mac_certs_password"));
    } else if (platform === "windows") {
        setEnv("CSC_LINK", getInput("windows_certs"));
        setEnv("CSC_KEY_PASSWORD", getInput("windows_certs_password"));
    }

    // Disable console advertisements during install phase
    setEnv("ADBLOCK", true);

    run("pnpm install", pkgRoot);

    // Run NPM build script if it exists
    log("Running the build script…");
    run(`pnpm run build`, pkgRoot);

    if (platform === "mac") {
        if (process.arch === "x64") {
            runtimeArgs += "--x64";
        } else {
            runtimeArgs += "--arm64";
        }
    }

    log(`Building${release ? " and releasing" : ""} the Electron app…`);
    const cmd = "electron-builder";
    const fullCmd = `pnpx ${cmd} --${platform} ${
        release ? "--publish always" : ""
    } ${args} ${runtimeArgs}`;
    log(`Running '${fullCmd}' in ${pkgRoot}`);
    for (let i = 0; i < maxAttempts; i += 1) {
        try {
            run(fullCmd, pkgRoot);
            break;
        } catch (err) {
            if (i < maxAttempts - 1) {
                log(`Attempt ${i + 1} failed:`);
                log(err);
            } else {
                throw err;
            }
        }
    }
};

runAction();
