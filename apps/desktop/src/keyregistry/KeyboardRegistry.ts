import { KeyBindInterface } from "./keyRegister";

class KeyboardRegistry {
    // resolved key combo -> KeyBindInterface
    private keyMap: Record<string, KeyBindInterface> = {};
    // command id -> resolved key combo
    private idToKey: Record<string, string> = {};

    register(keyBind: KeyBindInterface) {
        const resolved = this.resolveKeyForPlatform(keyBind).toLowerCase();
        if (this.keyMap[resolved]) {
            throw new Error(`Duplicate keyBind for: ${resolved}`);
        }
        this.keyMap[resolved] = { ...keyBind, key: resolved };
        this.idToKey[keyBind.id] = resolved;
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
        const normalized = keyPressed.toLowerCase();
        const bind = this.keyMap[normalized];
        return bind?.id;
    }

    overrideKeyBind(id: string, newBind: string) {
        const oldResolved = this.idToKey[id];
        if (!oldResolved) return;

        const existing = this.keyMap[oldResolved];
        if (!existing) return;

        // remove old entry
        delete this.keyMap[oldResolved];

        const newResolved = newBind.toLowerCase();
        if (this.keyMap[newResolved]) {
            throw new Error(
                `Cannot override; target key ${newResolved} already in use`,
            );
        }

        // update stored bind and maps
        const updatedBind: KeyBindInterface = { ...existing, key: newResolved };
        this.keyMap[newResolved] = updatedBind;
        this.idToKey[id] = newResolved;
    }
}

export default KeyboardRegistry;
