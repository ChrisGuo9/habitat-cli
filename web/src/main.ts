import { compileGraphExpression, sampleGraph, type GraphBounds, type GraphSample } from "./graph";
import "./styles.css";

const form = getElement<HTMLFormElement>("graph-form");
const expressionInput = getElement<HTMLInputElement>("expression");
const canvas = getElement<HTMLCanvasElement>("graph");
const status = getElement<HTMLParagraphElement>("status");
const xMinInput = getElement<HTMLInputElement>("x-min");
const xMaxInput = getElement<HTMLInputElement>("x-max");
const yMinInput = getElement<HTMLInputElement>("y-min");
const yMaxInput = getElement<HTMLInputElement>("y-max");

const boundsInputs = [xMinInput, xMaxInput, yMinInput, yMaxInput];

form.addEventListener("submit", (event) => {
  event.preventDefault();
  plot();
});

for (const input of boundsInputs) {
  input.addEventListener("change", plot);
}

getElement<HTMLButtonElement>("zoom-in").addEventListener("click", () => {
  scaleBounds(0.5);
  plot();
});

getElement<HTMLButtonElement>("zoom-out").addEventListener("click", () => {
  scaleBounds(2);
  plot();
});

getElement<HTMLButtonElement>("reset-view").addEventListener("click", () => {
  setBounds({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, samples: 500 });
  plot();
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-example]")) {
  button.addEventListener("click", () => {
    expressionInput.value = button.dataset.example ?? "x";
    plot();
  });
}

window.addEventListener("resize", plot);

plot();

function plot() {
  const bounds = readBounds();
  if (!bounds) {
    return;
  }

  try {
    const expression = compileGraphExpression(expressionInput.value);
    const points = sampleGraph(expression, {
      ...bounds,
      samples: Math.max(360, Math.floor(canvas.clientWidth * 1.5)),
    });

    if (drawGraph(points, bounds)) {
      status.textContent = `Showing y = ${expression.source}`;
      status.classList.remove("status-error");
    } else {
      status.textContent = "Canvas drawing is not available in this browser.";
      status.classList.add("status-error");
    }
  } catch (error) {
    drawGraph([], bounds);
    status.textContent = error instanceof Error ? error.message : "Invalid expression.";
    status.classList.add("status-error");
  }
}

function readBounds(): GraphBounds | null {
  const bounds = {
    xMin: Number(xMinInput.value),
    xMax: Number(xMaxInput.value),
    yMin: Number(yMinInput.value),
    yMax: Number(yMaxInput.value),
    samples: 500,
  };

  if (
    !Number.isFinite(bounds.xMin) ||
    !Number.isFinite(bounds.xMax) ||
    !Number.isFinite(bounds.yMin) ||
    !Number.isFinite(bounds.yMax) ||
    bounds.xMin >= bounds.xMax ||
    bounds.yMin >= bounds.yMax
  ) {
    status.textContent = "Enter valid graph bounds.";
    status.classList.add("status-error");
    return null;
  }

  return bounds;
}

function setBounds(bounds: GraphBounds) {
  xMinInput.value = String(bounds.xMin);
  xMaxInput.value = String(bounds.xMax);
  yMinInput.value = String(bounds.yMin);
  yMaxInput.value = String(bounds.yMax);
}

function scaleBounds(scale: number) {
  const bounds = readBounds();
  if (!bounds) {
    return;
  }

  const xCenter = (bounds.xMin + bounds.xMax) / 2;
  const yCenter = (bounds.yMin + bounds.yMax) / 2;
  const xRadius = ((bounds.xMax - bounds.xMin) * scale) / 2;
  const yRadius = ((bounds.yMax - bounds.yMin) * scale) / 2;

  setBounds({
    xMin: roundInput(xCenter - xRadius),
    xMax: roundInput(xCenter + xRadius),
    yMin: roundInput(yCenter - yRadius),
    yMax: roundInput(yCenter + yRadius),
    samples: bounds.samples,
  });
}

function drawGraph(points: GraphSample[], bounds: GraphBounds) {
  if (typeof canvas.getContext !== "function") {
    return false;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(320, canvas.clientWidth);
  const height = Math.max(320, canvas.clientHeight);
  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  context.clearRect(0, 0, width, height);
  drawGrid(context, bounds, width, height);
  drawAxes(context, bounds, width, height);
  drawCurve(context, points, bounds, width, height);
  return true;
}

function drawGrid(
  context: CanvasRenderingContext2D,
  bounds: GraphBounds,
  width: number,
  height: number,
) {
  context.strokeStyle = "rgba(57, 245, 208, 0.13)";
  context.lineWidth = 1;

  for (const x of gridTicks(bounds.xMin, bounds.xMax)) {
    const screenX = mapX(x, bounds, width);
    line(context, screenX, 0, screenX, height);
  }

  for (const y of gridTicks(bounds.yMin, bounds.yMax)) {
    const screenY = mapY(y, bounds, height);
    line(context, 0, screenY, width, screenY);
  }
}

function drawAxes(
  context: CanvasRenderingContext2D,
  bounds: GraphBounds,
  width: number,
  height: number,
) {
  context.strokeStyle = "rgba(238, 252, 255, 0.44)";
  context.lineWidth = 2;

  if (bounds.yMin <= 0 && bounds.yMax >= 0) {
    const y = mapY(0, bounds, height);
    line(context, 0, y, width, y);
  }

  if (bounds.xMin <= 0 && bounds.xMax >= 0) {
    const x = mapX(0, bounds, width);
    line(context, x, 0, x, height);
  }
}

function drawCurve(
  context: CanvasRenderingContext2D,
  points: GraphSample[],
  bounds: GraphBounds,
  width: number,
  height: number,
) {
  context.shadowColor = "rgba(57, 245, 208, 0.55)";
  context.shadowBlur = 12;
  context.strokeStyle = "#39f5d0";
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();

  let drawing = false;

  for (const point of points) {
    if (!point || point.y < bounds.yMin * 4 || point.y > bounds.yMax * 4) {
      drawing = false;
      continue;
    }

    const x = mapX(point.x, bounds, width);
    const y = mapY(point.y, bounds, height);

    if (!drawing) {
      context.moveTo(x, y);
      drawing = true;
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
  context.shadowBlur = 0;
}

function gridTicks(min: number, max: number) {
  const range = max - min;
  const rawStep = range / 10;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];

  for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }

  return ticks;
}

function mapX(x: number, bounds: GraphBounds, width: number) {
  return ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * width;
}

function mapY(y: number, bounds: GraphBounds, height: number) {
  return height - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * height;
}

function line(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
}

function roundInput(value: number) {
  return Number(value.toPrecision(8));
}

function getElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }

  return element as T;
}
