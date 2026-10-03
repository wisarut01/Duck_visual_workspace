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
import { createSnapshotStore } from "./snapshot-store.mjs";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
// Render (and most PaaS hosts) assign the listen port via $PORT at runtime;
// Y_WS_PORT stays for local dev where that's not set.
const PORT = Number(process.env.PORT ?? process.env.Y_WS_PORT ?? 1234);
const SAVE_DEBOUNCE_MS = 1000;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const store = createSnapshotStore(supabase);

const LOAD_RETRY_BASE_MS = 1000;
const LOAD_RETRY_MAX_MS = 30000;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

// room.loaded is false until the stored snapshot resolved "loaded"/"empty".
// An unloaded room must never be saved: its doc lacks the stored board, so an
// upsert would overwrite real data. Edits made meanwhile stay in memory and
// are merged (Yjs updates commute) once a later load succeeds.
const rooms = new Map(); // roomId -> { doc, awareness, conns, saveTimer, loadTimer, loaded, dirty, closed }

function scheduleSave(roomId, room) {
  clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => saveRoom(roomId, room), SAVE_DEBOUNCE_MS);
}

async function saveRoom(roomId, room) {
  if (!room.loaded) return false;
  room.dirty = false;
  const ok = await store.save(roomId, room.doc);
  if (!ok) {
    room.dirty = true;
    // Retry later only while the room is still alive; the close path and
    // flushAll make their own final attempt.
    if (!room.closed) scheduleSave(roomId, room);
  }
  return ok;
}

// Final saves still in flight for rooms whose last client just left. A
// rejoin must wait for it, or it would load the snapshot from before that
// save and later write its stale copy back over the newer one.
const pendingSaves = new Map(); // roomId -> Promise

async function attemptLoad(roomId, room, attempt) {
  room.loadTimer = null;
  if (room.closed) return;
  await pendingSaves.get(roomId);
  if (room.closed) return;
  const result = await store.load(roomId, room.doc);
  if (room.closed) return;
  if (result === "failed") {
    const delay = Math.min(LOAD_RETRY_BASE_MS * 2 ** attempt, LOAD_RETRY_MAX_MS);
    console.error(`load for ${roomId} failed, retrying in ${delay}ms`);
    room.loadTimer = setTimeout(() => attemptLoad(roomId, room, attempt + 1), delay);
    return;
  }
  room.loaded = true;
  if (room.dirty) scheduleSave(roomId, room);
}

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    room = {
      doc,
      awareness,
      conns: new Set(),
      saveTimer: null,
      loadTimer: null,
      loaded: false,
      dirty: false,
      closed: false,
    };
    const r = room;
    doc.on("update", (_update, origin) => {
      if (origin === "remote-load") return;
      r.dirty = true;
      if (r.loaded) scheduleSave(roomId, r);
    });
    rooms.set(roomId, room);
    attemptLoad(roomId, room, 0).catch((err) => console.error(`load failed for ${roomId}:`, err.message));
  }
  return room;
}

function disposeRoom(roomId, room) {
  room.closed = true;
  clearTimeout(room.saveTimer);
  clearTimeout(room.loadTimer);
  room.awareness.destroy();
  if (rooms.get(roomId) === room) rooms.delete(roomId);
}

async function flushAll() {
  for (const [roomId, room] of rooms) {
    clearTimeout(room.saveTimer);
    if (room.loaded) await store.save(roomId, room.doc);
    else console.error(`not saving ${roomId}: snapshot never loaded`);
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

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD_BYTES });

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
      // reloads from there. If the load never succeeded there is nothing
      // safe to write, so just drop the room (and its timers).
      const { loaded, doc } = room;
      disposeRoom(roomId, room);
      if (loaded) {
        const p = store.save(roomId, doc).finally(() => {
          if (pendingSaves.get(roomId) === p) pendingSaves.delete(roomId);
        });
        pendingSaves.set(roomId, p);
      }
      else console.error(`dropping ${roomId}: snapshot never loaded, edits not persisted`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`y-websocket relay listening on :${PORT}`);
});
