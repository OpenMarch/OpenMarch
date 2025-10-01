import { createContext, useContext } from "react";
import { ActionRegistry } from "../actions/registry";
import { ActionBus } from "../actions/bus";

interface ActionSystemContextType {
  registry: ActionRegistry;
  bus: ActionBus;
}

const ActionSystemContext = createContext<ActionSystemContextType | null>(null);

export const useActionSystem = () => {
  const context = useContext(ActionSystemContext);
  if (!context) {
    throw new Error("useActionSystem must be used within ActionSystemProvider");
  }
  return context;
};

export const ActionSystemProvider = ActionSystemContext.Provider;

export default ActionSystemContext;
