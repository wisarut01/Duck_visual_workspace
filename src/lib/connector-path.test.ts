import { describe, it, expect } from "vitest";
import { elbowPoints, roundedPath, elbowPath, elbowMidpoint, type Point } from "./connector-path";

describe("connector-path.ts (regression — Epic A3 elbow routing)", () => {
  describe("elbowPoints — unbound", () => {
    it("uses H-then-V when |dx| >= |dy|", () => {
      const a: Point = { x: 0, y: 0 };
      const b: Point = { x: 100, y: 20 };
      const pts = elbowPoints(a, b);
      // one bend: first move horizontally to b.x, then vertically to b.y
      expect(pts[0]).toEqual(a);
      expect(pts[pts.length - 1]).toEqual(b);
      expect(pts.length).toBe(3);
      expect(pts[1]).toEqual({ x: b.x, y: a.y });
    });

    it("uses V-then-H when |dy| > |dx|", () => {
      const a: Point = { x: 0, y: 0 };
      const b: Point = { x: 20, y: 100 };
      const pts = elbowPoints(a, b);
      expect(pts.length).toBe(3);
      expect(pts[1]).toEqual({ x: a.x, y: b.y });
    });

    it("collapses to a single segment when a and b are aligned (no bend needed)", () => {
      const a: Point = { x: 0, y: 0 };
      const b: Point = { x: 100, y: 0 };
      const pts = elbowPoints(a, b);
      expect(pts).toEqual([a, b]);
    });
  });

  describe("elbowPoints — single-side-bound", () => {
    it("adds a perpendicular stub off the bound side before bending", () => {
      const a: Point = { x: 0, y: 0 };
      const b: Point = { x: 100, y: 100 };
      const pts = elbowPoints(a, b, "e"); // a bound on its east side
      // first point is a itself, second is the stub 20 units east of a
      expect(pts[0]).toEqual(a);
      expect(pts[1]).toEqual({ x: 20, y: 0 });
      expect(pts[pts.length - 1]).toEqual(b);
    });

    it("stub direction matches the bound side's outward normal (west)", () => {
      const a: Point = { x: 100, y: 0 };
      const b: Point = { x: 0, y: 100 };
      const pts = elbowPoints(a, b, "w");
      expect(pts[1]).toEqual({ x: 80, y: 0 });
    });

    it("stub direction matches the bound side's outward normal (north/south)", () => {
      const a: Point = { x: 0, y: 100 };
      const b: Point = { x: 100, y: 0 };
      const ptsN = elbowPoints(a, b, "n");
      expect(ptsN[1]).toEqual({ x: 0, y: 80 });
      const ptsS = elbowPoints(a, b, "s");
      expect(ptsS[1]).toEqual({ x: 0, y: 120 });
    });
  });

  describe("elbowPoints — both-sides-bound", () => {
    it("routes a single bend when the two bound sides force different axes", () => {
      const a: Point = { x: 0, y: 0 };
      const b: Point = { x: 100, y: 100 };
      // a exits east (x-axis), b enters from north (y-axis) -> different axes
      const pts = elbowPoints(a, b, "e", "n");
      expect(pts[0]).toEqual(a);
      expect(pts[pts.length - 1]).toEqual(b);
      // stubs present
      expect(pts).toContainEqual({ x: 20, y: 0 });
      expect(pts).toContainEqual({ x: 100, y: 80 });
    });

    it("routes a two-bend Z when both bound sides force the same axis", () => {
      const a: Point = { x: 0, y: 0 };
      const b: Point = { x: 200, y: 100 };
      // both exit on the x-axis (east/west) -> same axis -> "Z" with 2 mid points
      const pts = elbowPoints(a, b, "e", "w");
      const ea = { x: 20, y: 0 };
      const eb = { x: 180, y: 100 };
      expect(pts).toContainEqual(ea);
      expect(pts).toContainEqual(eb);
      // total points: a, ea, midx@ea.y, midx@eb.y, eb, b = 6
      expect(pts.length).toBe(6);
      const midx = (ea.x + eb.x) / 2;
      expect(pts).toContainEqual({ x: midx, y: ea.y });
      expect(pts).toContainEqual({ x: midx, y: eb.y });
    });

    it("routes a two-bend Z on the y-axis when both sides are n/s", () => {
      const a: Point = { x: 0, y: 0 };
      const b: Point = { x: 100, y: 200 };
      const pts = elbowPoints(a, b, "s", "n");
      const ea = { x: 0, y: 20 };
      const eb = { x: 100, y: 180 };
      const midy = (ea.y + eb.y) / 2;
      expect(pts).toContainEqual({ x: ea.x, y: midy });
      expect(pts).toContainEqual({ x: eb.x, y: midy });
    });
  });

  describe("roundedPath — corner radius clamping", () => {
    it("returns an empty string for fewer than 2 points", () => {
      expect(roundedPath([])).toBe("");
      expect(roundedPath([{ x: 0, y: 0 }])).toBe("");
    });

    it("returns a plain M/L for exactly 2 points (no corners to round)", () => {
      const d = roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
      expect(d).toBe("M 0 0 L 10 0");
    });

    it("clamps the corner radius to half the shorter adjacent leg", () => {
      // legs of length 4 and 100 around the corner at (4,0); default radius 8
      // must clamp to min(8, 4/2, 100/2) = 2
      const pts: Point[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 100 }];
      const d = roundedPath(pts, 8);
      // the straight leg into the corner should stop 2 units short of (4,0)
      expect(d).toContain("L 2 0");
    });

    it("uses the full requested radius when legs are long enough", () => {
      const pts: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
      const d = roundedPath(pts, 8);
      expect(d).toContain("L 92 0");
    });
  });

  describe("elbowPath", () => {
    it("combines elbowPoints + roundedPath for an unbound straight case", () => {
      const a: Point = { x: 0, y: 0 };
      const b: Point = { x: 50, y: 0 };
      expect(elbowPath(a, b)).toBe("M 0 0 L 50 0");
    });

    it("produces a non-empty path for a bound corner case", () => {
      const a: Point = { x: 0, y: 0 };
      const b: Point = { x: 100, y: 100 };
      const d = elbowPath(a, b, "e", "n");
      expect(d.startsWith("M 0 0")).toBe(true);
      expect(d).toContain("Q");
    });
  });

  describe("elbowMidpoint", () => {
    it("returns the point itself for a single-point path", () => {
      expect(elbowMidpoint([{ x: 5, y: 5 }])).toEqual({ x: 5, y: 5 });
    });

    it("returns the origin for an empty path", () => {
      expect(elbowMidpoint([])).toEqual({ x: 0, y: 0 });
    });

    it("finds the true midpoint by arc length across a two-segment polyline", () => {
      // total length 100 + 100 = 200; midpoint at length 100 -> corner (100,0)
      const pts: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
      expect(elbowMidpoint(pts)).toEqual({ x: 100, y: 0 });
    });

    it("interpolates within a segment when the midpoint falls mid-leg", () => {
      // total length 200 (100 + 100), midpoint by length is at 100 along,
      // exactly the corner; use uneven legs to force interpolation instead
      const pts: Point[] = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 100 }];
      // total = 160, target = 80 -> 80 along first leg (length 60) overflows,
      // so target for 2nd leg = 80-60=20 -> y = 20
      expect(elbowMidpoint(pts)).toEqual({ x: 60, y: 20 });
    });
  });
});
