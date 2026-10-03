// Supabase persistence for room snapshots. Kept free of env access and
// client construction so it can be unit-tested with a stub `supabase`.
import * as Y from "yjs";

// roomId comes straight from the URL path — never trust it as a raw key.
export function roomKey(roomId) {
  return roomId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "default";
}

export function createSnapshotStore(supabase) {
  return {
    // Resolves "loaded" | "empty" | "failed". Callers must never save a doc
    // whose load came back "failed" — that would overwrite the stored board.
    async load(roomId, doc) {
      let result;
      try {
        result = await supabase
          .from("board_snapshots")
          .select("data")
          .eq("room_id", roomKey(roomId))
          .maybeSingle();
      } catch (err) {
        console.error(`load failed for ${roomId}:`, err?.message ?? err);
        return "failed";
      }
      const { data, error } = result ?? {};
      if (error) {
        console.error(`load failed for ${roomId}:`, error.message);
        return "failed";
      }
      if (!data?.data) return "empty";
      try {
        // bytea comes back as a "\x"-prefixed hex string over the JS client.
        const hex = String(data.data);
        if (!hex.startsWith("\\x")) throw new Error("unexpected bytea encoding");
        const body = hex.slice(2);
        if (body.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(body)) {
          throw new Error("invalid hex");
        }
        Y.applyUpdate(doc, Buffer.from(body, "hex"), "remote-load");
        return "loaded";
      } catch (err) {
        console.error(`corrupt snapshot for ${roomId}, refusing to overwrite:`, err?.message ?? err);
        return "failed";
      }
    },

    // Resolves true on success, false on any error. Never throws.
    async save(roomId, doc) {
      try {
        // PostgREST needs bytea as a "\x"-prefixed hex string in the JSON
        // body — a raw Buffer serializes as {"type":"Buffer",...} instead,
        // which silently corrupts the stored column.
        const hex = "\\x" + Buffer.from(Y.encodeStateAsUpdate(doc)).toString("hex");
        const { error } = await supabase
          .from("board_snapshots")
          .upsert({ room_id: roomKey(roomId), data: hex, updated_at: new Date().toISOString() });
        if (error) {
          console.error(`save failed for ${roomId}:`, error.message);
          return false;
        }
        return true;
      } catch (err) {
        console.error(`save failed for ${roomId}:`, err?.message ?? err);
        return false;
      }
    },
  };
}
