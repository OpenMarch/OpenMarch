import { CommandInterface } from "./keyRegister";

class CommandRegistry {
    private commands: Record<string, CommandInterface> = {}; // something like tooltip.show -> Command

    register(command: CommandInterface) {
        this.commands[command.id] = command;
    }

    execute(id: string, ...args: any[]) {
        if (!(id in this.commands)) {
            throw new Error(
                "id not in command, ensure all commands are registered and or a valid id is being used",
            );
        }
        this.commands[id].action(args);
    }
}

export default CommandRegistry;
