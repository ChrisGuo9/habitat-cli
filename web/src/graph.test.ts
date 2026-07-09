import { describe, expect, test } from "bun:test";
import { compileGraphExpression, sampleGraph } from "./graph";

describe("graph expression utilities", () => {
  test("evaluates a compiled expression for x values", () => {
    const expression = compileGraphExpression("x^2 - 1");

    expect(expression.evaluate(-2)).toBe(3);
    expect(expression.evaluate(0)).toBe(-1);
    expect(expression.evaluate(3)).toBe(8);
  });

  test("samples only finite points across a range", () => {
    const expression = compileGraphExpression("1 / x");

    const points = sampleGraph(expression, {
      xMin: -1,
      xMax: 1,
      yMin: -10,
      yMax: 10,
      samples: 5,
    });

    expect(points).toEqual([
      { x: -1, y: -1 },
      { x: -0.5, y: -2 },
      null,
      { x: 0.5, y: 2 },
      { x: 1, y: 1 },
    ]);
  });

  test("rejects invalid expressions with a helpful message", () => {
    expect(() => compileGraphExpression("x^")).toThrow("Invalid expression");
  });
});
