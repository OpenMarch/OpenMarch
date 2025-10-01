import { ActionId, ActionContext, ActionResult } from "./types";
import { ActionRegistry } from "./registry";

export type DispatchOptions = { silent?: boolean };

export type ActionMiddleware = (
  next: (id: ActionId, payload: unknown, opts?: DispatchOptions) => Promise<ActionResult>
) => (id: ActionId, payload: unknown, opts?: DispatchOptions) => Promise<ActionResult>;

export interface ActionBus {
  dispatch<P = unknown>(id: ActionId, payload: P, opts?: DispatchOptions): Promise<ActionResult>;
  addMiddleware(mw: ActionMiddleware): void;
}

export const createActionBus = (registry: ActionRegistry, ctx: ActionContext): ActionBus => {
  let middlewares: ActionMiddleware[] = [];

  const coreDispatch = async (id: ActionId, payload: unknown, _opts?: DispatchOptions) => {
    const factory = registry.getFactory<any>(id);
    if (!factory) return { ok: false, error: new Error(`No factory for ${id}`) };
    const cmd = factory(payload);
    if (cmd.canExecute && !(await cmd.canExecute(ctx, payload))) {
      return { ok: false, error: new Error(`Action ${id} cannot execute`) };
    }
    try {
      const res = await cmd.execute(ctx, payload);
      if (cmd.getInverse) {
        const inverse = await cmd.getInverse(ctx, payload);
        await ctx.history.push(inverse);
      }
      return res;
    } catch (e) {
      return { ok: false, error: e };
    }
  };

  const dispatchWithMw: ActionBus["dispatch"] = async (id, payload, opts) => {
    const chain = middlewares.reduceRight(
      (next, mw) => mw(next),
      coreDispatch
    );
    return chain(id, payload, opts);
  };

  return {
    dispatch: dispatchWithMw,
    addMiddleware(mw) {
      middlewares.push(mw);
    },
  };
};
