import { ActionId, ActionMeta, ActionCommandFactory } from "./types";

export interface ActionRegistry {
  register(meta: ActionMeta, factory: ActionCommandFactory<any>): void;
  getMeta(id: ActionId): ActionMeta | undefined;
  getFactory<P>(id: ActionId): ActionCommandFactory<P> | undefined;
  list(): ActionMeta[];
}

export const createActionRegistry = (): ActionRegistry => {
  const metas = new Map<ActionId, ActionMeta>();
  const factories = new Map<ActionId, ActionCommandFactory<any>>();
  return {
    register(meta, factory) {
      if (metas.has(meta.id)) throw new Error(`Duplicate action: ${meta.id}`);
      metas.set(meta.id, meta);
      factories.set(meta.id, factory);
    },
    getMeta: (id) => metas.get(id),
    getFactory: (id) => factories.get(id),
    list: () => [...metas.values()],
  };
};
