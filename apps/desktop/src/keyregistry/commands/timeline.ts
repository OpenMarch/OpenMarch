import { CommandInterface } from "../keyRegister";

// example of named export
export const command: CommandInterface = {
    id: "tooltip.show",
    action: () => {},
    register: (keyBind) => {
        keyBind.register({
            id: "tooltip.show",
            key: "ctrl+f",
        });
    },
};
