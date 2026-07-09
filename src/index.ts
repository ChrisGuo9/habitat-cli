#!/usr/bin/env bun

import { Command } from "commander";
import { createBattery, deleteBattery, getBattery, listBatteries, updateBattery } from "./battery";
import { addCacheItem, consumeCacheItem, createCache, deleteCache, listCaches } from "./cache";
import { attachSuit, createSuitport, deleteSuitport, detachSuit, getSuitport, listSuitports } from "./suitport";
import { addDoorToAirlock, createAirlock, createDoor, deleteAirlock, deleteDoor, getAirlock, getDoor, listAirlocks, listDoors, updateAirlock, updateDoor } from "./structures";
import { createFabricator, deleteFabricator, getFabricator, listFabricators } from "./workshop";

const program = new Command();

function formatBattery(battery: {
  id: string;
  name: string;
  chargeLevel: number;
  capacity: number;
  charging: boolean;
  output: boolean;
}): string {
  return `${battery.id} ${battery.name} charge=${battery.chargeLevel}/${battery.capacity} charging=${battery.charging} output=${battery.output}`;
}

program
  .name("habitat")
  .description("A tiny Bun and TypeScript command-line app.")
  .version("0.1.0", "-v, --version", "show the current version")
  .showSuggestionAfterError(false)
  .helpOption("-h, --help", "show help");

const batteryCommand = program.command("battery").description("manage batteries");
const airlockCommand = program.command("airlock").description("manage airlocks");
const doorCommand = program.command("door").description("manage doors");
const cacheCommand = program.command("cache").description("manage supply caches");
const suitportCommand = program.command("suitport").description("manage suitports");
const workshopCommand = program.command("workshop").description("manage workshop fabricators");

batteryCommand
  .command("create")
  .argument("<name>", "battery name")
  .action((name: string) => {
    const battery = createBattery(name);
    console.log(`Created battery: ${formatBattery(battery)}`);
  });

batteryCommand
  .command("list")
  .action(() => {
    const batteries = listBatteries();
    if (batteries.length === 0) {
      console.log("No batteries found.");
      return;
    }
    for (const battery of batteries) {
      console.log(formatBattery(battery));
    }
  });

batteryCommand
  .command("status")
  .argument("<id>", "battery id")
  .action((id: string) => {
    const battery = getBattery(id);
    if (!battery) {
      console.error(`Battery not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(battery, null, 2));
  });

batteryCommand
  .command("update")
  .argument("<id>", "battery id")
  .option("--charge <chargeLevel>", "charge level")
  .option("--capacity <capacity>", "capacity")
  .option("--charging", "set charging on")
  .option("--no-charging", "set charging off")
  .option("--output", "set output on")
  .option("--no-output", "set output off")
  .option("--name <name>", "battery name")
  .action(
    (
      id: string,
      options: {
        charge?: string;
        capacity?: string;
        charging?: boolean;
        output?: boolean;
        name?: string;
      },
    ) => {
      const patch: {
        name?: string;
        chargeLevel?: number;
        capacity?: number;
        charging?: boolean;
        output?: boolean;
      } = {};
      if (options.name) patch.name = options.name;
      if (options.charge !== undefined) patch.chargeLevel = Number(options.charge);
      if (options.capacity !== undefined) patch.capacity = Number(options.capacity);
      if (options.charging !== undefined) patch.charging = options.charging;
      if (options.output !== undefined) patch.output = options.output;
      const battery = updateBattery(id, patch);
      if (!battery) {
        console.error(`Battery not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(`Updated battery: ${formatBattery(battery)}`);
    },
  );

batteryCommand
  .command("delete")
  .argument("<id>", "battery id")
  .action((id: string) => {
    const deleted = deleteBattery(id);
    if (!deleted) {
      console.error(`Battery not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Deleted battery: ${id}`);
  });

function formatAirlock(airlock: {
  id: string;
  name: string;
  pressureLevel: number;
  locked: boolean;
  doorIds: string[];
}): string {
  return `${airlock.id} ${airlock.name} pressure=${airlock.pressureLevel} locked=${airlock.locked} doors=${airlock.doorIds.join(",") || "none"}`;
}

airlockCommand
  .command("create")
  .argument("<name>", "airlock name")
  .action((name: string) => {
    const airlock = createAirlock(name);
    console.log(`Created airlock: ${formatAirlock(airlock)}`);
  });

airlockCommand
  .command("list")
  .action(() => {
    const airlocks = listAirlocks();
    if (airlocks.length === 0) {
      console.log("No airlocks found.");
      return;
    }
    for (const airlock of airlocks) {
      console.log(formatAirlock(airlock));
    }
  });

airlockCommand
  .command("status")
  .argument("<id>", "airlock id or name")
  .action((id: string) => {
    const airlock = getAirlock(id);
    if (!airlock) {
      console.error(`Airlock not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(airlock, null, 2));
  });

airlockCommand
  .command("update")
  .argument("<id>", "airlock id or name")
  .option("--pressure <pressureLevel>", "pressure level")
  .option("--locked", "lock the airlock")
  .option("--no-locked", "unlock the airlock")
  .action((id: string, options: { pressure?: string; locked?: boolean }) => {
    const patch: { pressureLevel?: number; locked?: boolean } = {};
    if (options.pressure !== undefined) patch.pressureLevel = Number(options.pressure);
    if (options.locked !== undefined) patch.locked = options.locked;
    const airlock = updateAirlock(id, patch);
    if (!airlock) {
      console.error(`Airlock not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Updated airlock: ${formatAirlock(airlock)}`);
  });

airlockCommand
  .command("delete")
  .argument("<id>", "airlock id or name")
  .action((id: string) => {
    const deleted = deleteAirlock(id);
    if (!deleted) {
      console.error(`Airlock not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Deleted airlock: ${id}`);
  });

airlockCommand
  .command("add-door")
  .argument("<airlockName>", "airlock name or id")
  .argument("<doorName>", "door name or id")
  .action((airlockName: string, doorName: string) => {
    const airlock = addDoorToAirlock(airlockName, doorName);
    if (!airlock) {
      console.error(`Airlock or door not found: ${airlockName}, ${doorName}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Attached door to airlock: ${formatAirlock(airlock)}`);
  });

function formatCache(cache: {
  id: string;
  name: string;
  location: string;
  quantity: number;
  capacity: number;
}): string {
  return `${cache.id} ${cache.name} type=${cache.location} quantity=${cache.quantity}/${cache.capacity}`;
}

cacheCommand
  .command("create")
  .argument("<name>", "cache name")
  .requiredOption("--type <type>", "cache type")
  .action((name: string, options: { type: string }) => {
    const cache = createCache(name, options.type);
    console.log(`Created cache: ${formatCache(cache)}`);
  });

cacheCommand
  .command("list")
  .action(() => {
    const caches = listCaches();
    if (caches.length === 0) {
      console.log("No caches found.");
      return;
    }
    for (const cache of caches) {
      console.log(formatCache(cache));
    }
  });

cacheCommand
  .command("add")
  .argument("<id>", "cache id or name")
  .requiredOption("--type <type>", "item type")
  .action((id: string, options: { type: string }) => {
    const cache = addCacheItem(id, options.type);
    if (!cache) {
      console.error(`Cache not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Added item to cache: ${formatCache(cache)}`);
  });

cacheCommand
  .command("consume")
  .argument("<id>", "cache id or name")
  .requiredOption("--type <type>", "item type")
  .action((id: string, options: { type: string }) => {
    const cache = consumeCacheItem(id, options.type);
    if (!cache) {
      console.error(`Cache not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Consumed item from cache: ${formatCache(cache)}`);
  });

cacheCommand
  .command("delete")
  .argument("<id>", "cache id or name")
  .action((id: string) => {
    const deleted = deleteCache(id);
    if (!deleted) {
      console.error(`Cache not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Deleted cache: ${id}`);
  });

function formatDoor(door: {
  id: string;
  name: string;
  status: string;
  locked: boolean;
}): string {
  return `${door.id} ${door.name} status=${door.status} locked=${door.locked}`;
}

doorCommand
  .command("create")
  .argument("<name>", "door name")
  .option("--status <status>", "door status")
  .option("--locked", "lock the door")
  .option("--no-locked", "unlock the door")
  .action((name: string, options: { status?: string; locked?: boolean }) => {
    const door = createDoor(name);
    const updated = updateDoor(door.id, {
      status: options.status ?? door.status,
      locked: options.locked ?? door.locked,
    });
    const created = updated ?? door;
    console.log(`Created door: ${formatDoor(created)}`);
  });

doorCommand
  .command("list")
  .action(() => {
    const doors = listDoors();
    if (doors.length === 0) {
      console.log("No doors found.");
      return;
    }
    for (const door of doors) {
      console.log(formatDoor(door));
    }
  });

doorCommand
  .command("status")
  .argument("<id>", "door id or name")
  .action((id: string) => {
    const door = getDoor(id);
    if (!door) {
      console.error(`Door not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(door, null, 2));
  });

doorCommand
  .command("update")
  .argument("<id>", "door id or name")
  .option("--status <status>", "door status")
  .option("--locked", "lock the door")
  .option("--no-locked", "unlock the door")
  .action((id: string, options: { status?: string; locked?: boolean }) => {
    const patch: { status?: string; locked?: boolean } = {};
    if (options.status) patch.status = options.status;
    if (options.locked !== undefined) patch.locked = options.locked;
    const door = updateDoor(id, patch);
    if (!door) {
      console.error(`Door not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Updated door: ${formatDoor(door)}`);
  });

doorCommand
  .command("delete")
  .argument("<id>", "door id or name")
  .action((id: string) => {
    const deleted = deleteDoor(id);
    if (!deleted) {
      console.error(`Door not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Deleted door: ${id}`);
  });

function formatSuitport(suitport: {
  id: string;
  name: string;
  suitAttached: boolean;
  suitBatteryLevel: number;
  inUseBy: string | null;
  status: string;
}): string {
  return `${suitport.id} ${suitport.name} attached=${suitport.suitAttached} battery=${suitport.suitBatteryLevel} inUseBy=${suitport.inUseBy ?? "none"} status=${suitport.status}`;
}

suitportCommand
  .command("create")
  .argument("<name>", "suitport name")
  .action((name: string) => {
    const suitport = createSuitport(name);
    console.log(`Created suitport: ${formatSuitport(suitport)}`);
  });

suitportCommand
  .command("list")
  .action(() => {
    const suitports = listSuitports();
    if (suitports.length === 0) {
      console.log("No suitports found.");
      return;
    }
    for (const suitport of suitports) {
      console.log(formatSuitport(suitport));
    }
  });

suitportCommand
  .command("status")
  .argument("<id>", "suitport id or name")
  .action((id: string) => {
    const suitport = getSuitport(id);
    if (!suitport) {
      console.error(`Suitport not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(suitport, null, 2));
  });

suitportCommand
  .command("attach")
  .argument("<id>", "suitport id or name")
  .action((id: string) => {
    const suitport = attachSuit(id);
    if (!suitport) {
      console.error(`Suitport not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Attached suitport: ${formatSuitport(suitport)}`);
  });

suitportCommand
  .command("detach")
  .argument("<id>", "suitport id or name")
  .action((id: string) => {
    const suitport = detachSuit(id);
    if (!suitport) {
      console.error(`Suitport not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Detached suitport: ${formatSuitport(suitport)}`);
  });

suitportCommand
  .command("delete")
  .argument("<id>", "suitport id or name")
  .action((id: string) => {
    const deleted = deleteSuitport(id);
    if (!deleted) {
      console.error(`Suitport not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Deleted suitport: ${id}`);
  });

function formatWorkshopFabricator(fabricator: {
  id: string;
  name: string;
  status: string;
}): string {
  return `${fabricator.id} ${fabricator.name} status=${fabricator.status}`;
}

workshopCommand
  .command("create")
  .argument("<name>", "fabricator name")
  .action((name: string) => {
    const fabricator = createFabricator(name);
    console.log(`Created workshop fabricator: ${formatWorkshopFabricator(fabricator)}`);
  });

workshopCommand
  .command("list")
  .action(() => {
    const fabricators = listFabricators();
    if (fabricators.length === 0) {
      console.log("No workshop fabricators found.");
      return;
    }
    for (const fabricator of fabricators) {
      console.log(formatWorkshopFabricator(fabricator));
    }
  });

workshopCommand
  .command("status")
  .argument("<id>", "fabricator id or name")
  .action((id: string) => {
    const fabricator = getFabricator(id);
    if (!fabricator) {
      console.error(`Workshop fabricator not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(fabricator, null, 2));
  });

workshopCommand
  .command("delete")
  .argument("<id>", "fabricator id or name")
  .action((id: string) => {
    const deleted = deleteFabricator(id);
    if (!deleted) {
      console.error(`Workshop fabricator not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Deleted workshop fabricator: ${id}`);
  });

program.addHelpText(
  "after",
  `
Main command groups:
  airlock  manage airlocks
  battery  manage batteries
  cache    manage supply caches
  door     manage doors
  suitport manage suitports
  workshop manage workshop fabricators

Common command pattern:
  create  make one object
  list    show all objects
  status  inspect one object
  update  modify one object
  delete  remove one object

Try "habitat airlock --help", "habitat battery --help", "habitat cache --help",
"habitat door --help", "habitat suitport --help", and "habitat workshop --help"
for object-specific examples.`,
);

airlockCommand.addHelpText(
  "after",
  `
Examples:
  $ habitat airlock create "Main Airlock"
  $ habitat airlock list
  $ habitat airlock status a1
  $ habitat airlock update a1 --pressure 100
  $ habitat airlock delete a1
  $ habitat airlock add-door a1 d1

Airlock flow:
  create -> list -> status -> update -> add-door -> delete`,
);

batteryCommand.addHelpText(
  "after",
  `
Examples:
  $ habitat battery create "Main Bank"
  $ habitat battery list
  $ habitat battery status b1
  $ habitat battery update b1 --charge 85
  $ habitat battery delete b1

Battery flow:
  create -> list -> status -> update -> delete`,
);

doorCommand.addHelpText(
  "after",
  `
Examples:
  $ habitat door create "Outer Door"
  $ habitat door list
  $ habitat door status d1
  $ habitat door update d1 --status open
  $ habitat door delete d1

Door flow:
  create -> list -> status -> update -> delete`,
);

cacheCommand.addHelpText(
  "after",
  `
Examples:
  $ habitat cache create "Food Store A" --type food
  $ habitat cache list
  $ habitat cache add "Food Store A" --type food
  $ habitat cache consume "Food Store A" --type food
  $ habitat cache delete food-store-a

Cache flow:
  create -> list -> add -> consume -> delete`,
);

suitportCommand.addHelpText(
  "after",
  `
Examples:
  $ habitat suitport create "Port 1"
  $ habitat suitport list
  $ habitat suitport status s1
  $ habitat suitport delete s1
  $ habitat suitport attach s1
  $ habitat suitport detach s1

Suitport flow:
  create -> list -> status -> attach -> detach -> delete`,
);

workshopCommand.addHelpText(
  "after",
  `
Examples:
  $ habitat workshop create "Main Fabricator"
  $ habitat workshop list
  $ habitat workshop status w1
  $ habitat workshop delete w1

Workshop flow:
  create -> list -> status -> delete`,
);

program.on("command:*", ([unknownCommand]) => {
  console.error(`Unknown command: ${unknownCommand}`);
  console.error('Run "habitat --help" to see available commands.');
  process.exitCode = 1;
});

program.parseAsync();
