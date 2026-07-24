import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";

export interface CollectionItem<T> {
  id: string;
  data: T;
}

// observeDeep on the top-level Y.Map also fires for edits to the nested
// per-object Y.Maps, so one subscription covers create/delete/field-update.
export function useYCollection<T>(map: Y.Map<Y.Map<unknown>>): CollectionItem<T>[] {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    map.observeDeep(handler);
    return () => map.unobserveDeep(handler);
  }, [map]);

  return useMemo(
    () => {
      const out: CollectionItem<T>[] = [];
      map.forEach((v, k) => out.push({ id: k, data: v.toJSON() as T }));
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, tick],
  );
}
