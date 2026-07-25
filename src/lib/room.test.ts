import { describe, it, expect } from "vitest";
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
    it("produces an adjective-noun-number shaped id", () => {
      const id = randomRoomId();
      expect(id).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
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
