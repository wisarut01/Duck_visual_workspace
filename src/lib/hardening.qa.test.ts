// QA acceptance tests for the hardening batch.
import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { randomRoomId, parseRoomId } from "./room";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs module, no type declarations
import { roomKey, createSnapshotStore } from "../../server/snapshot-store.mjs";

describe("QA: room ids", () => {
  it("has a long random suffix and survives the relay sanitiser", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = randomRoomId();
      expect(id).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{10}$/);
      expect(roomKey(id)).toBe(id);
      seen.add(id);
    }
    expect(seen.size).toBe(500);
  });
  it("still parses old ids and full links", () => {
    expect(parseRoomId("eager-field-355")).toBe("eager-field-355");
    expect(parseRoomId("https://x.vercel.app/board/eager-field-355?a=1")).toBe("eager-field-355");
    const id = randomRoomId();
    expect(parseRoomId(`https://x.vercel.app/board/${id}`)).toBe(id);
  });
});

type Row = { room_id: string; data: string; updated_at: string };
function stub(opts: { failSelect?: boolean; throwSelect?: boolean; failUpsert?: boolean; rows?: Map<string, Row> } = {}) {
  const rows = opts.rows ?? new Map<string, Row>();
  const upserts: Row[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe("board_snapshots");
      return {
        select() {
          return {
            eq(_col: string, key: string) {
              return {
                async maybeSingle() {
                  if (opts.throwSelect) throw new Error("network down");
                  if (opts.failSelect) return { data: null, error: { message: "boom" } };
                  const row = rows.get(key);
                  return { data: row ? { data: row.data } : null, error: null };
                },
              };
            },
          };
        },
        async upsert(row: Row) {
          if (opts.failUpsert) return { error: { message: "boom" } };
          upserts.push(row);
          rows.set(row.room_id, row);
          return { error: null };
        },
      };
    },
  };
  return { client, rows, upserts };
}

describe("QA: snapshot store", () => {
  it("roomKey sanitises", () => {
    expect(roomKey("../../etc/passwd")).toBe("______etc_passwd");
    expect(roomKey("")).toBe("default");
    expect(roomKey("a".repeat(300))).toHaveLength(100);
  });

  it("save then load round-trips through the bytea hex encoding", async () => {
    const s = stub();
    const store = createSnapshotStore(s.client);
    const a = new Y.Doc();
    a.getMap("notes").set("n1", "hello");
    expect(await store.save("room-1", a)).toBe(true);
    expect(s.upserts[0].room_id).toBe("room-1");
    expect(s.upserts[0].data).toMatch(/^\\x[0-9a-f]+$/);

    const b = new Y.Doc();
    const origins: unknown[] = [];
    b.on("update", (_u: Uint8Array, origin: unknown) => origins.push(origin));
    expect(await store.load("room-1", b)).toBe("loaded");
    expect(b.getMap("notes").get("n1")).toBe("hello");
    expect(origins).toEqual(["remote-load"]);
  });

  it("no row is 'empty'", async () => {
    const store = createSnapshotStore(stub().client);
    expect(await store.load("nope", new Y.Doc())).toBe("empty");
  });

  it("a query error is 'failed', and so is a thrown one", async () => {
    expect(await createSnapshotStore(stub({ failSelect: true }).client).load("r", new Y.Doc())).toBe("failed");
    expect(await createSnapshotStore(stub({ throwSelect: true }).client).load("r", new Y.Doc())).toBe("failed");
  });

  it("a corrupt snapshot is 'failed', not 'empty'", async () => {
    const rows = new Map<string, Row>([["r", { room_id: "r", data: "\\xdeadbeef00ff", updated_at: "" }]]);
    const doc = new Y.Doc();
    expect(await createSnapshotStore(stub({ rows }).client).load("r", doc)).toBe("failed");
  });

  it("save reports failure without throwing", async () => {
    const store = createSnapshotStore(stub({ failUpsert: true }).client);
    expect(await store.save("r", new Y.Doc())).toBe(false);
  });
});
