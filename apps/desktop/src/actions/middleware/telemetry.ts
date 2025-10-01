import { ActionMiddleware } from "../bus";

export const telemetryMiddleware = (logger: (e: any) => void): ActionMiddleware =>
  (next) => async (id, payload, opts) => {
    const t0 = performance.now();
    try {
      const res = await next(id, payload, opts);
      const t1 = performance.now();
      logger({ type: "action", id, ok: res.ok, ms: Math.round(t1 - t0) });
      return res;
    } catch (e) {
      const t1 = performance.now();
      logger({ type: "action", id, ok: false, ms: Math.round(t1 - t0), error: e });
      return { ok: false, error: e };
    }
  };
