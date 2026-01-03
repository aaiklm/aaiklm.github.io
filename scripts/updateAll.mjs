#!/usr/bin/env node
/**
 * Update All Data
 *
 * Runs all data update scripts in order:
 * 1. download:teams - Download team data
 * 2. download:matches - Download match data
 * 3. add:lines - Add betting lines for the current date
 *
 * Usage: node scripts/updateAll.mjs
 */

import { spawn } from "child_process";

function runScript(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Running: ${command} ${args.join(" ")}`);
    console.log("=".repeat(60));

    const proc = spawn(command, args, {
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function main() {
  const currentDate = getCurrentDate();

  console.log(`\nStarting full data update for ${currentDate}`);
  console.log("This will run: download:teams → download:matches → add:lines\n");

  try {
    // Step 1: Download team data
    await runScript("npm", ["run", "download:teams"]);

    // Step 2: Download match data
    await runScript("npm", ["run", "download:matches"]);

    // Step 3: Add lines for current date
    await runScript("node", ["scripts/addLinesToFile.mjs", currentDate]);

    console.log(`\n${"=".repeat(60)}`);
    console.log("✓ All updates completed successfully!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error(`\n✗ Update failed: ${error.message}`);
    process.exit(1);
  }
}

main();

