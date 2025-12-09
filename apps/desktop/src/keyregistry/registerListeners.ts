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

export const registerCommands = async (
    keyBindRegistry: KeyboardRegistry,
    commandRegistry: CommandRegistry,
) => {
    const commandFiles = fs.readdirSync(__dirname + "/commands");

    for (const file of commandFiles) {
        if (file.endsWith(".ts")) {
            const module = await import(__dirname + `/commands/${file}`);
            if (module.command.register === undefined)
                throw new Error(
                    `Command file ${file} must export a register function`,
                );

            // single module export
            if (module) {
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
                const exported = (module as any)[key];
                if (typeof exported === "object")
                    processCommandExport(
                        exported,
                        keyBindRegistry,
                        commandRegistry,
                    );
            }
        }
    }
};
