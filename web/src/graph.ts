import { Parser } from "expr-eval";

export type GraphBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  samples: number;
};

export type GraphPoint = {
  x: number;
  y: number;
};

export type GraphSample = GraphPoint | null;

export type CompiledGraphExpression = {
  source: string;
  evaluate: (x: number) => number;
};

export function compileGraphExpression(source: string): CompiledGraphExpression {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("Invalid expression: enter a function of x.");
  }

  try {
    const compiled = Parser.parse(trimmed);

    return {
      source: trimmed,
      evaluate(x: number) {
        const value = compiled.evaluate({ x });
        return typeof value === "number" ? value : Number(value);
      },
    };
  } catch {
    throw new Error("Invalid expression: check the formula syntax.");
  }
}

export function sampleGraph(expression: CompiledGraphExpression, bounds: GraphBounds) {
  const samples = Math.max(2, Math.floor(bounds.samples));
  const step = (bounds.xMax - bounds.xMin) / (samples - 1);
  const points: GraphSample[] = [];

  for (let index = 0; index < samples; index += 1) {
    const x = round(bounds.xMin + step * index);
    const y = round(expression.evaluate(x));
    points.push(Number.isFinite(y) ? { x, y } : null);
  }

  return points;
}

function round(value: number) {
  return Number(value.toPrecision(12));
}
