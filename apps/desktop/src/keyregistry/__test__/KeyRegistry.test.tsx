import { describe, it, expect, vi } from "vitest";
import KeyboardRegistry from "../KeyboardRegistry";
import CommandRegistry from "../CommandRegistry";
import type { CommandInterface, KeyBindInterface } from "../keyRegister";

describe("Key + Command integration", () => {
    it("looks up command by key combo and executes it", () => {
        const keyReg = new KeyboardRegistry();
        const cmdReg = new CommandRegistry();

        const spy = vi.fn();
        const cmd: CommandInterface = {
            id: "toolbox.show",
            action: (args: any[]) => spy(args),
            register: () => {},
        };

        // register command and keyBind
        cmdReg.register(cmd);
        keyReg.register({ id: "toolbox.show", key: "ctrl+p+f" });

        // simulate the glue code: key -> command id -> execute
        const combo = "ctrl+p+f";
        const id = keyReg.getCommandForKey(combo);
        expect(id).toBe("toolbox.show");

        if (id) cmdReg.execute(id, "payload");
        // CommandRegistry.action receives args array
        expect(spy).toHaveBeenCalledWith(["payload"]);
    });
});

describe("CommandRegistry", () => {
    it("registers and executes a command with args", () => {
        const reg = new CommandRegistry();
        const spy = vi.fn();
        const cmd: CommandInterface = {
            id: "test.cmd",
            action: (args: any[]) => spy(args),
            register: () => {},
        };

        reg.register(cmd);
        reg.execute("test.cmd", 1, 2);

        // CommandRegistry currently calls action(args) passing the args array
        expect(spy).toHaveBeenCalledWith([1, 2]);
    });

    it("throws when executing unknown command", () => {
        const reg = new CommandRegistry();
        expect(() => reg.execute("no.such")).toThrow();
    });
});

describe("KeyboardRegistry", () => {
    it("stores keyBind and returns command id for a key", () => {
        const kr = new KeyboardRegistry();
        const bind: KeyBindInterface = { id: "search.find", key: "ctrl+f" };
        kr.register(bind);

        const id = kr.getCommandForKey("ctrl+f");
        expect(id).toBe("search.find");
    });

    it("resolves platform-specific key", () => {
        const kr = new KeyboardRegistry();
        const bind: KeyBindInterface = {
            id: "search.find",
            key: "ctrl+f",
            mac: "meta+f",
            win: "ctrl+f",
        };

        // temporarily override platform for the test
        const realPlatform = process.platform;
        // @ts-ignore modify process.platform for test
        Object.defineProperty(process, "platform", { value: "darwin" });

        const resolved = kr.resolveKeyForPlatform(bind);
        expect(resolved).toBe("meta+f");

        // restore
        // @ts-ignore
        Object.defineProperty(process, "platform", { value: realPlatform });
    });
});
