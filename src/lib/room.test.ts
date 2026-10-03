import { describe, it, expect, vi } from "vitest";
import { parseRoomId, randomRoomId, USER_COLORS } from "./room";

describe("room.ts (regression)", () => {
  describe("parseRoomId", () => {
    it("returns a bare room id unchanged", () => {
      expect(parseRoomId("eager-field-355")).toBe("eager-field-355");
    });

    it("extracts the room id from a full shared board URL", () => {
      expect(parseRoomId("https://host/board/eager-field-355")).toBe("eager-field-355");
    });

    it("extracts the room id from a URL with trailing query/hash", () => {
      expect(parseRoomId("https://host/board/eager-field-355?x=1#y")).toBe("eager-field-355");
    });

    it("trims surrounding whitespace", () => {
      expect(parseRoomId("  quiet-jam-100  ")).toBe("quiet-jam-100");
    });

    it("decodes URI-encoded characters in the id", () => {
      expect(parseRoomId("https://host/board/my%20room")).toBe("my room");
    });

    it("handles a bare id pasted with no protocol/path", () => {
      expect(parseRoomId("design-jam")).toBe("design-jam");
    });
  });

  describe("randomRoomId", () => {
    it("produces an adjective-noun-<10 char suffix> shaped id", () => {
      for (let i = 0; i < 50; i++) {
        expect(randomRoomId()).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{10}$/);
      }
    });

    it("survives the relay's roomKey sanitiser unchanged", () => {
      const id = randomRoomId();
      expect(id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)).toBe(id);
    });

    it("does not use Math.random", () => {
      const spy = vi.spyOn(Math, "random");
      randomRoomId();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("round-trips through parseRoomId", () => {
      const id = randomRoomId();
      expect(parseRoomId(`https://host/board/${id}`)).toBe(id);
    });

    it("produces different ids across calls (not a constant)", () => {
      const ids = new Set(Array.from({ length: 20 }, () => randomRoomId()));
      expect(ids.size).toBeGreaterThan(1);
    });
  });

  describe("USER_COLORS", () => {
    it("has at least 4 distinct hex colors", () => {
      expect(USER_COLORS.length).toBeGreaterThanOrEqual(4);
      expect(new Set(USER_COLORS).size).toBe(USER_COLORS.length);
      for (const c of USER_COLORS) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });
});
