import { useEffect, useRef } from "react";
import { dataCacheDebug } from "./dataCacheDebug";

/**
 * Logs a component's derived data snapshot on mount and whenever `values` change.
 * Also updates the latest snapshot map shown in the Data Cache debug modal.
 */
export function useDataCacheComponentProbe(
  componentId: string,
  values: Record<string, unknown>,
  options?: { logEveryRender?: boolean },
): void {
  const serialized = JSON.stringify(values);
  const prevSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!dataCacheDebug.isEnabled()) return;

    const isMount = prevSerializedRef.current === null;
    const changed = prevSerializedRef.current !== serialized;

    if (options?.logEveryRender || isMount || changed) {
      dataCacheDebug.setComponentSnapshot(componentId, {
        ...values,
        __probe: isMount ? "mount" : changed ? "update" : "render",
      });
    }

    prevSerializedRef.current = serialized;
  }, [componentId, options?.logEveryRender, serialized, values]);
}
