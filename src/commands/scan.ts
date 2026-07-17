import type { Command } from "commander";
import { scanWorldViaApi } from "../api/client";
import type { WorldScanQuantityEstimate, WorldScanResponse, WorldScanTile } from "../kepler";

type ScanOptions = {
  x: string;
  y: string;
  strength: string;
  radius: string;
  json?: boolean;
};

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("scan nearby Kepler tiles for resource probabilities")
    .requiredOption("--x <integer>", "current x coordinate")
    .requiredOption("--y <integer>", "current y coordinate")
    .requiredOption("--strength <0-100>", "effective sensor strength")
    .option("--radius <0-5>", "scan radius", "0")
    .option("--json", "print the complete JSON response")
    .action(async (options: ScanOptions) => {
      try {
        const x = parseInteger(options.x, "x must be an integer.");
        const y = parseInteger(options.y, "y must be an integer.");
        const sensorStrength = parseRangedInteger(options.strength, 0, 100, "Sensor strength must be an integer from 0 through 100.");
        const radiusTiles = parseRangedInteger(options.radius, 0, 5, "Radius must be an integer from 0 through 5.");
        const response = await scanWorldViaApi({ x, y, sensorStrength, radiusTiles });

        if (options.json || program.opts<{ json?: boolean }>().json) console.log(JSON.stringify(response, null, 2));
        else printScan(response);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}

function parseInteger(value: string, message: string): number {
  if (!/^-?\d+$/.test(value)) throw new Error(message);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(message);
  return parsed;
}

function parseRangedInteger(value: string, minimum: number, maximum: number, message: string): number {
  const parsed = parseInteger(value, message);
  if (parsed < minimum || parsed > maximum) throw new Error(message);
  return parsed;
}

function printScan(response: WorldScanResponse): void {
  const { scan } = response;
  console.log("Resource Scan");
  console.log("-------------");
  console.log(`position        ${scan.origin.x}, ${scan.origin.y}`);
  console.log(`sensorStrength  ${scan.sensorStrength}`);
  console.log(`radiusTiles     ${scan.radiusTiles}`);
  console.log(`modelVersion    ${scan.modelVersion}`);

  if (scan.radiusTiles === 0 && scan.tiles.length === 1) printSingleTile(scan.tiles[0]!);
  else printTileSummary(scan.tiles);
}

function printSingleTile(tile: WorldScanTile): void {
  console.log("\nTile");
  console.log("----");
  console.log(`coordinates      ${tile.x}, ${tile.y}`);
  console.log(`terrain          ${tile.terrain}`);
  console.log(`distanceTiles    ${tile.distanceTiles}`);
  console.log(`topCandidate     ${resourceLabel(tile.topCandidate.resourceType)}`);
  console.log(`confidence       ${formatPercent(tile.topCandidate.probabilityPct)}`);

  console.log("\nResource Probabilities");
  console.log("----------------------");
  for (const probability of tile.probabilities) {
    console.log(`${resourceLabel(probability.resourceType).padEnd(20)} ${formatPercent(probability.probabilityPct)}`);
  }

  console.log("\nQuantity Estimate");
  console.log("-----------------");
  if (!tile.quantityEstimate) {
    console.log("resourceType  -");
    console.log("quantity      -");
    return;
  }
  const estimate = tile.quantityEstimate;
  console.log(`resourceType  ${estimate.resourceType}`);
  console.log(`estimatedKg   ${estimate.estimatedKg}`);
  console.log(`minimumKg     ${estimate.minimumKg}`);
  console.log(`maximumKg     ${estimate.maximumKg}`);
  console.log(`exact         ${estimate.exact}`);
  console.log(`quantity      ${formatQuantity(estimate)}`);
}

function printTileSummary(tiles: WorldScanTile[]): void {
  const headers = ["COORDINATES", "DISTANCE", "TERRAIN", "TOP CANDIDATE", "CONFIDENCE", "ESTIMATED QUANTITY"];
  const rows = tiles.map((tile) => [
    `${tile.x}, ${tile.y}`,
    String(tile.distanceTiles),
    tile.terrain,
    resourceLabel(tile.topCandidate.resourceType),
    formatPercent(tile.topCandidate.probabilityPct),
    tile.quantityEstimate ? formatQuantity(tile.quantityEstimate) : "-",
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]!.length)));
  console.log(`\n${headers.map((header, index) => header.padEnd(widths[index]!)).join("  ")}`);
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(row.map((value, index) => value.padEnd(widths[index]!)).join("  "));
}

function resourceLabel(resourceType: string | null): string {
  return resourceType ?? "none";
}

function formatPercent(value: number): string {
  return `${value}%`;
}

function formatQuantity(estimate: WorldScanQuantityEstimate): string {
  return estimate.exact
    ? `${estimate.estimatedKg} kg (exact)`
    : `${estimate.estimatedKg} kg (${estimate.minimumKg}-${estimate.maximumKg} kg)`;
}
