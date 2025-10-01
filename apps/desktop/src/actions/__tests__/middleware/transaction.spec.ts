import { describe, it, expect, vi } from "vitest";
import { transactionMiddleware } from "../../middleware/transaction";
import { ActionId } from "../../types";

describe("transactionMiddleware", () => {
  it("should skip non-allowlisted actions", async () => {
    const ctx = {
      db: {
        begin: vi.fn(),
      },
    };
    const allowlist = new Set<ActionId>([]);
    const middleware = transactionMiddleware(ctx, allowlist);

    const next = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = middleware(next);

    const result = await wrapped(ActionId.performUndo, undefined);

    expect(result.ok).toBe(true);
    expect(ctx.db.begin).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(ActionId.performUndo, undefined, undefined);
  });

  it("should wrap allowlisted actions in transaction and commit on success", async () => {
    const tx = {
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const ctx = {
      db: {
        begin: vi.fn().mockResolvedValue(tx),
      },
    };
    const allowlist = new Set<ActionId>([ActionId.performUndo]);
    const middleware = transactionMiddleware(ctx, allowlist);

    const next = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = middleware(next);

    const result = await wrapped(ActionId.performUndo, undefined);

    expect(result.ok).toBe(true);
    expect(ctx.db.begin).toHaveBeenCalled();
    expect(tx.commit).toHaveBeenCalled();
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it("should rollback transaction on failure", async () => {
    const tx = {
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const ctx = {
      db: {
        begin: vi.fn().mockResolvedValue(tx),
      },
    };
    const allowlist = new Set<ActionId>([ActionId.performUndo]);
    const middleware = transactionMiddleware(ctx, allowlist);

    const next = vi.fn().mockResolvedValue({ ok: false, error: new Error("Action failed") });
    const wrapped = middleware(next);

    const result = await wrapped(ActionId.performUndo, undefined);

    expect(result.ok).toBe(false);
    expect(ctx.db.begin).toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("should rollback transaction on exception", async () => {
    const tx = {
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const ctx = {
      db: {
        begin: vi.fn().mockResolvedValue(tx),
      },
    };
    const allowlist = new Set<ActionId>([ActionId.performUndo]);
    const middleware = transactionMiddleware(ctx, allowlist);

    const error = new Error("Unexpected error");
    const next = vi.fn().mockRejectedValue(error);
    const wrapped = middleware(next);

    const result = await wrapped(ActionId.performUndo, undefined);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);
    expect(ctx.db.begin).toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });
});
