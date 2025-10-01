import { describe, it, expect, vi } from "vitest";
import { telemetryMiddleware } from "../../middleware/telemetry";
import { ActionId } from "../../types";

describe("telemetryMiddleware", () => {
  it("should log successful action execution with timing", async () => {
    const logger = vi.fn();
    const middleware = telemetryMiddleware(logger);

    const next = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = middleware(next);

    const result = await wrapped(ActionId.performUndo, undefined);

    expect(result.ok).toBe(true);
    expect(logger).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action",
        id: ActionId.performUndo,
        ok: true,
        ms: expect.any(Number),
      })
    );
  });

  it("should log failed action execution with timing", async () => {
    const logger = vi.fn();
    const middleware = telemetryMiddleware(logger);

    const error = new Error("Action failed");
    const next = vi.fn().mockResolvedValue({ ok: false, error });
    const wrapped = middleware(next);

    const result = await wrapped(ActionId.performUndo, undefined);

    expect(result.ok).toBe(false);
    expect(logger).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action",
        id: ActionId.performUndo,
        ok: false,
        ms: expect.any(Number),
      })
    );
  });

  it("should log exceptions with timing", async () => {
    const logger = vi.fn();
    const middleware = telemetryMiddleware(logger);

    const error = new Error("Unexpected error");
    const next = vi.fn().mockRejectedValue(error);
    const wrapped = middleware(next);

    const result = await wrapped(ActionId.performUndo, undefined);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);
    expect(logger).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action",
        id: ActionId.performUndo,
        ok: false,
        ms: expect.any(Number),
        error,
      })
    );
  });

  it("should measure execution time", async () => {
    const logger = vi.fn();
    const middleware = telemetryMiddleware(logger);

    const next = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { ok: true };
    });
    const wrapped = middleware(next);

    await wrapped(ActionId.performUndo, undefined);

    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        ms: expect.any(Number),
      })
    );

    const loggedMs = logger.mock.calls[0][0].ms;
    expect(loggedMs).toBeGreaterThanOrEqual(40); // Allow some margin
  });
});
