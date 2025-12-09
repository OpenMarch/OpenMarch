import { KeyBindInterface } from "./keyRegister";

class KeyboardRegistry {
    private keyBinds: Record<string, KeyBindInterface> = {}; // something like ctrl+f -> tooltip.show

    register(keyBind: KeyBindInterface) {
        if (this.keyBinds[keyBind.key]) {
            throw new Error(`Duplicate keyBind id: ${keyBind.key}`);
        }
        this.keyBinds[keyBind.key] = keyBind;
    }

    resolveKeyForPlatform(bind: KeyBindInterface): string {
        switch (process.platform) {
            case "darwin":
                return bind.mac ?? bind.key;
            case "win32":
                return bind.win ?? bind.key;
            case "linux":
                return bind.linux ?? bind.key;
            default:
                return bind.key;
        }
    }

    getCommandForKey(keyPressed: string): string | undefined {
        if (!(keyPressed in this.keyBinds)) return undefined;

        const bind = this.keyBinds[keyPressed];

        return bind.id;
    }

    overrideKeyBind(id: string, newBind: string) {
        this.keyBinds[id].key = newBind;
    }
}

export default KeyboardRegistry;
