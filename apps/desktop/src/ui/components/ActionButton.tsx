import * as React from "react";
import { ActionId } from "../../actions/types";
import { ActionBus } from "../../actions/bus";
import { ActionRegistry } from "../../actions/registry";
import { toHumanShortcut } from "../../actions/keymap/keymap.service";

type Props = {
  id: ActionId;
  bus: ActionBus;
  registry: ActionRegistry;
  className?: string;
  payload?: unknown;
  children?: React.ReactNode;
  titleOverride?: string;
};

export function ActionButton({ id, bus, registry, className, payload, children, titleOverride }: Props) {
  const meta = registry.getMeta(id)!;
  const [toggled, setToggled] = React.useState<boolean | null>(null);

  // Lightweight state query for toggle; if you want reactive updates, create a small pub/sub in ctx
  React.useEffect(() => {
    const cmd = registry.getFactory(id)?.(payload);
    if (cmd?.isToggled) {
      // @ts-ignore: global ctx bridge or pass ctx via props for SSR-safe design
      const toggled = cmd.isToggled((window as any).__actionCtx);
      setToggled(!!toggled);
    }
  }, [id, registry, payload]);

  const descKey = toggled === true && meta.toggleOnKey
    ? meta.toggleOnKey
    : toggled === false && meta.toggleOffKey
      ? meta.toggleOffKey
      : meta.descKey;

  const shortcut = meta.shortcuts?.[0];
  const tooltip = titleOverride ?? `${descKey}${shortcut ? ` (${toHumanShortcut(shortcut)})` : ""}`;

  return (
    <button
      className={className}
      aria-pressed={toggled ?? undefined}
      title={tooltip}
      onClick={() => void bus.dispatch(id, payload)}
    >
      {children}
    </button>
  );
}
