// Minimal self-hosted Yjs realtime relay (epic 4 — FLOW.md §2/§3).
// One room per roomId: relays Yjs sync + awareness (presence) messages
// between connected clients. Epic 6 — each room's doc is snapshotted to a
// `board_snapshots` table in Supabase (debounced) and reloaded from there
// when a room is next opened, so restarting this process (or redeploying,
// on hosts with no persistent disk) no longer wipes every room.
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { createServer } from "http";
import { parse } from "url";
import { createClient } from "@supabase/supabase-js";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PORT = process.env.Y_WS_PORT ? Number(process.env.Y_WS_PORT) : 1234;
const SAVE_DEBOUNCE_MS = 1000;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// roomId comes straight from the URL path — never trust it as a raw key.
function roomKey(roomId) {
  return roomId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "default";
}

async function loadDoc(roomId, doc) {
  const { data, error } = await supabase
    .from("board_snapshots")
    .select("data")
    .eq("room_id", roomKey(roomId))
    .maybeSingle();
  if (error) {
    console.error(`load failed for ${roomId}:`, error.message);
    return;
  }
  if (data?.data) {
    // bytea comes back as a "\x"-prefixed hex string over the JS client.
    Y.applyUpdate(doc, Buffer.from(data.data.slice(2), "hex"), "remote-load");
  }
}

async function saveDoc(roomId, doc) {
  const update = Buffer.from(Y.encodeStateAsUpdate(doc));
  const { error } = await supabase
    .from("board_snapshots")
    .upsert({ room_id: roomKey(roomId), data: update, updated_at: new Date().toISOString() });
  if (error) console.error(`save failed for ${roomId}:`, error.message);
}

const rooms = new Map(); // roomId -> { doc, awareness, conns: Set<ws>, saveTimer }

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    const doc = new Y.Doc();
    loadDoc(roomId, doc);
    const awareness = new awarenessProtocol.Awareness(doc);
    room = { doc, awareness, conns: new Set(), saveTimer: null };
    doc.on("update", (_update, origin) => {
      if (origin === "remote-load") return;
      clearTimeout(room.saveTimer);
      room.saveTimer = setTimeout(() => saveDoc(roomId, doc), SAVE_DEBOUNCE_MS);
    });
    rooms.set(roomId, room);
  }
  return room;
}

async function flushAll() {
  for (const [roomId, room] of rooms) {
    clearTimeout(room.saveTimer);
    await saveDoc(roomId, room.doc);
  }
}

process.on("SIGINT", async () => {
  await flushAll();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await flushAll();
  process.exit(0);
});

function send(ws, buf) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(buf, (err) => err && ws.close());
  } catch {
    ws.close();
  }
}

const httpServer = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("y-websocket relay ok\n");
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  const { pathname } = parse(req.url || "/");
  const roomId = (pathname || "/").replace(/^\/+/, "") || "default";
  const room = getRoom(roomId);
  room.conns.add(ws);
  console.log(`+ ${roomId} (${room.conns.size} connected)`);

  // 1. send initial sync step 1 (our state vector) so the client can
  //    compute and send back exactly what we're missing.
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    send(ws, encoding.toUint8Array(encoder));
  }
  // 2. send current awareness states.
  {
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
      );
      send(ws, encoding.toUint8Array(encoder));
    }
  }

  const onUpdate = (update, origin) => {
    if (origin === ws) return; // don't echo back to the sender
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    send(ws, encoding.toUint8Array(encoder));
  };
  room.doc.on("update", onUpdate);

  // Track which awareness clientIDs this connection has introduced, so we
  // can clear their presence (cursor/avatar) for everyone else on close —
  // without this, a disconnected user's cursor lingers until awareness's
  // own timeout (~30s) expires.
  const ownedClientIds = new Set();
  const onAwarenessUpdate = ({ added, updated, removed }, origin) => {
    if (origin === ws) {
      added.forEach((id) => ownedClientIds.add(id));
      removed.forEach((id) => ownedClientIds.delete(id));
      return;
    }
    const changed = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed));
    send(ws, encoding.toUint8Array(encoder));
  };
  room.awareness.on("update", onAwarenessUpdate);

  ws.on("message", (data) => {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const messageType = decoding.readVarUint(decoder);
    if (messageType === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      // syncProtocol.readSyncMessage applies updates with `ws` as the
      // transaction origin, so onUpdate above correctly skips echoing
      // back to whoever just sent it.
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
      if (encoding.length(encoder) > 1) send(ws, encoding.toUint8Array(encoder));
    } else if (messageType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
    }
  });

  ws.on("close", () => {
    room.conns.delete(ws);
    room.doc.off("update", onUpdate);
    room.awareness.off("update", onAwarenessUpdate);
    awarenessProtocol.removeAwarenessStates(room.awareness, [...ownedClientIds], null);
    console.log(`- ${roomId} (${room.conns.size} connected)`);
    if (room.conns.size === 0) {
      // Flush to Supabase before dropping the in-memory doc — the next open
      // reloads from there, so nothing written since the last debounced
      // save may be lost.
      clearTimeout(room.saveTimer);
      saveDoc(roomId, room.doc);
      rooms.delete(roomId);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`y-websocket relay listening on :${PORT}`);
});
