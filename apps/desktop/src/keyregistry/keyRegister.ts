import KeyboardRegistry from "./KeyboardRegistry";

export interface KeyBindInterface {
    id: string;
    key: string;
    mac?: string;
    win?: string;
    linux?: string;
}

export interface CommandInterface {
    id: string;
    action: (args: any[]) => void;
    register: (keyBinds: KeyboardRegistry) => void;
}
