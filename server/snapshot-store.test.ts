// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Y from "yjs";
import { createSnapshotStore, roomKey } from "./snapshot-store.mjs";

function hexOf(doc: Y.Doc) {
  return "\\x" + Buffer.from(Y.encodeStateAsUpdate(doc)).toString("hex");
}

function stubSelect(result: unknown, opts: { throws?: boolean } = {}) {
  const maybeSingle = vi.fn(async () => {
    if (opts.throws) throw new Error("network down");
    return result;
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn();
  return { client: { from: vi.fn(() => ({ select, upsert })) }, eq, upsert };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("roomKey", () => {
  it("sanitises and caps the id", () => {
    expect(roomKey("a/b c")).toBe("a_b_c");
    expect(roomKey("x".repeat(200)).length).toBe(100);
    expect(roomKey("")).toBe("default");
  });
  it("leaves generated room ids unchanged", () => {
    expect(roomKey("quiet-jam-a1b2c3d4e5")).toBe("quiet-jam-a1b2c3d4e5");
  });
});

describe("snapshot store load", () => {
  it("returns failed when the query returns an error", async () => {
    const { client } = stubSelect({ data: null, error: { message: "boom" } });
    expect(await createSnapshotStore(client).load("r", new Y.Doc())).toBe("failed");
  });

  it("returns failed when the query throws", async () => {
    const { client } = stubSelect(null, { throws: true });
    expect(await createSnapshotStore(client).load("r", new Y.Doc())).toBe("failed");
  });

  it("returns empty when there is no row", async () => {
    const { client } = stubSelect({ data: null, error: null });
    expect(await createSnapshotStore(client).load("r", new Y.Doc())).toBe("empty");
  });

  it("returns loaded and applies the update with origin remote-load", async () => {
    const src = new Y.Doc();
    src.getMap("m").set("k", "v");
    const { client, eq } = stubSelect({ data: { data: hexOf(src) }, error: null });
    const doc = new Y.Doc();
    const origins: unknown[] = [];
    doc.on("update", (_u: Uint8Array, origin: unknown) => origins.push(origin));
    expect(await createSnapshotStore(client).load("a/b", doc)).toBe("loaded");
    expect(doc.getMap("m").get("k")).toBe("v");
    expect(origins).toEqual(["remote-load"]);
    expect(eq).toHaveBeenCalledWith("room_id", "a_b");
  });

  it("treats undecodable bytes as failed", async () => {
    for (const bad of ["\\xzz", "\\xabc", "nothex"]) {
      const { client } = stubSelect({ data: { data: bad }, error: null });
      expect(await createSnapshotStore(client).load("r", new Y.Doc())).toBe("failed");
    }
  });
});

describe("snapshot store save", () => {
  it("upserts hex bytea and resolves true", async () => {
    const { client, upsert } = stubSelect(null);
    upsert.mockResolvedValue({ error: null });
    const doc = new Y.Doc();
    doc.getMap("m").set("k", 1);
    expect(await createSnapshotStore(client).save("room 1", doc)).toBe(true);
    const row = upsert.mock.calls[0][0];
    expect(row.room_id).toBe("room_1");
    expect(row.data).toBe(hexOf(doc));
    expect(typeof row.updated_at).toBe("string");
  });

  it("resolves false on error without throwing", async () => {
    const { client, upsert } = stubSelect(null);
    upsert.mockResolvedValue({ error: { message: "nope" } });
    expect(await createSnapshotStore(client).save("r", new Y.Doc())).toBe(false);
  });

  it("resolves false when upsert throws", async () => {
    const { client, upsert } = stubSelect(null);
    upsert.mockRejectedValue(new Error("down"));
    expect(await createSnapshotStore(client).save("r", new Y.Doc())).toBe(false);
  });
});
