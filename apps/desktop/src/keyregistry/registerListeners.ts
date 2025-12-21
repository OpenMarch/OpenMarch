import fs from "fs";
import { CommandInterface } from "./keyRegister";
import KeyboardRegistry from "./KeyboardRegistry";
import CommandRegistry from "./CommandRegistry";

// example keyBind would be {"tooltip.show": {"key": "F1", "command": "tooltip.show"}}
function processCommandExport(
    command: CommandInterface,
    keyRegistry: KeyboardRegistry,
    commandRegistry: CommandRegistry,
) {
    commandRegistry.register(command);
    command.register(keyRegistry);
}

function overrideKeyBind(keyBoardRegistry: KeyboardRegistry) {
    const configPath = __dirname + "/userCommands.json";
    if (!fs.existsSync(configPath)) {
        return; // No user overrides configured
    }
    try {
        const userOverrides = fs.readFileSync(configPath, "utf-8");
        const data: { id: string; key: string }[] = JSON.parse(userOverrides);
        data.forEach((keyBind) => {
            keyBoardRegistry.overrideKeyBind(keyBind.id, keyBind.key);
        });
    } catch (error) {
        console.error("Failed to load user key bind overrides:", error);
    }
}

export const registerCommands = async (
    keyBindRegistry: KeyboardRegistry,
    commandRegistry: CommandRegistry,
) => {
    const commandFiles = fs.readdirSync(__dirname + "/commands");

    for (const file of commandFiles) {
        if (file.endsWith(".ts")) {
            const module = await import(__dirname + `/commands/${file}`);
            if (module.command === undefined)
                throw new Error(
                    `Command file ${file} must be named export or array of objects`,
                );

            // single module export
            if (typeof module.command === "object" && module.command.id) {
                processCommandExport(
                    module.command,
                    keyBindRegistry,
                    commandRegistry,
                );
                continue;
            }

            // array of objects is acceptable
            if (Array.isArray(module.command)) {
                module.command.forEach((command: CommandInterface) => {
                    processCommandExport(
                        command,
                        keyBindRegistry,
                        commandRegistry,
                    );
                });
            }

            // I think this would handle named exports
            for (const key of Object.keys(module.command)) {
                const exported = (module)[key];
                if (typeof exported === "object")
                    processCommandExport(
                        exported,
                        keyBindRegistry,
                        commandRegistry,
                    );
            }
        }
    }

    overrideKeyBind(keyBindRegistry);
};
