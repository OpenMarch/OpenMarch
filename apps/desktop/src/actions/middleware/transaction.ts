import { ActionMiddleware } from "../bus";
import { ActionId } from "../types";

export const transactionMiddleware = (ctx: any, allowlist: Set<ActionId>): ActionMiddleware =>
  (next) => async (id, payload, opts) => {
    if (!allowlist.has(id)) return next(id, payload, opts);
    const tx = await ctx.db.begin?.();
    try {
      const res = await next(id, payload, opts);
      if (res.ok) await tx?.commit?.();
      else await tx?.rollback?.();
      return res;
    } catch (e) {
      await tx?.rollback?.();
      return { ok: false, error: e };
    }
  };
