import { CommandInterface } from "../keyRegister";

// a named export array is also acceptable
export const command: CommandInterface[] = [
    {
        id: "marcher.group",
        action: () => {
            // console.log("Group Marcher command");
        },
        register: (keyRegister) => {
            keyRegister.register({
                id: "marcher.group",
                key: "g",
            });
        },
    },
    {
        id: "marcher.square.shape",
        action: () => {
            // console.log("Marcher Square Shape");
        },
        register: (keyRegister) => {
            keyRegister.register({
                id: "marcher.square.shape",
                key: "s",
            });
        },
    },
];
