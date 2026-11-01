// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyGlRenderer, fieldQuality } from "../fieldQuality";

describe("classifyGlRenderer", () => {
    it.each([
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
        "Google SwiftShader",
        "llvmpipe (LLVM 15.0.6, 256 bits)",
        "ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits), OpenGL 4.5)",
        "Microsoft Basic Render Driver",
        "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "softpipe",
    ])("counts %s as software", (renderer) => {
        expect(classifyGlRenderer(renderer)).toBe("software");
    });

    it.each([
        "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "Mesa Intel(R) UHD Graphics 600 (GLK 2)",
        "ANGLE (ARM, Mali-G52, OpenGL ES 3.2)",
        "Apple M1",
        // A browser that hides the unmasked name still has a GPU as far as we can tell
        "WebKit WebGL",
    ])("counts %s as hardware", (renderer) => {
        expect(classifyGlRenderer(renderer)).toBe("hardware");
    });

    it("counts no renderer as no WebGL", () => {
        expect(classifyGlRenderer(null)).toBe("none");
    });
});

describe("fieldQuality", () => {
    const base = { performanceMode: false, gl: "hardware", gpuCrashed: false };

    it("draws at full quality on a GPU", () => {
        expect(fieldQuality({ ...base, gl: "hardware" })).toEqual({
            mode: "full",
            reason: null,
        });
    });

    it("draws at full quality while the GPU isn't known yet", () => {
        expect(fieldQuality({ ...base, gl: null }).mode).toBe("full");
    });

    it.each([
        [{ gl: "software" }, "software"],
        [{ gl: "none" }, "noWebGL"],
        [{ gpuCrashed: true }, "gpuCrashed"],
        [{ performanceMode: true }, "setting"],
    ] as const)("drops to low quality for %o", (change, reason) => {
        expect(fieldQuality({ ...base, ...change })).toEqual({
            mode: "low",
            reason,
        });
    });

    it("gives the machine's reason over the setting", () => {
        // The one-time explanation is about the machine, even with Performance mode on
        expect(
            fieldQuality({ ...base, performanceMode: true, gl: "software" })
                .reason,
        ).toBe("software");
        expect(
            fieldQuality({
                ...base,
                performanceMode: true,
                gl: "software",
                gpuCrashed: true,
            }).reason,
        ).toBe("gpuCrashed");
        expect(
            fieldQuality({ ...base, gl: "none", gpuCrashed: true }).reason,
        ).toBe("noWebGL");
    });
});
