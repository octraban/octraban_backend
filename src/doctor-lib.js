import { execSync } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import net from "net";
import pg from "pg";

// Helper to run shell commands safely
function checkCommand(command) {
  try {
    const stdout = execSync(command, { stdio: "pipe", timeout: 3000 }).toString().trim();
    return { available: true, output: stdout };
  } catch (err) {
    return { available: false, output: "", error: err.message };
  }
}

// Helper to check if a TCP port is in use
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function runAllChecks(customDbUrl = null) {
  const results = {
    runtimes: {},
    database: { connected: false, message: "" },
    env: {},
    ports: {},
    system: {},
    gitHooks: {},
    docker: {},
  };

  // 1. Runtime Version Checks
  // Node.js
  const nodeVersionStr = process.version; // e.g. "v20.9.0"
  const nodeMatch = nodeVersionStr.match(/^v(\d+)\./);
  const nodeMajor = nodeMatch ? parseInt(nodeMatch[1], 10) : 0;
  results.runtimes.node = {
    status: nodeMajor >= 20 ? "pass" : "fail",
    version: nodeVersionStr,
    message: nodeMajor >= 20 ? "Node.js 20+ detected" : "Node.js 20+ required",
  };

  // npm
  const npmCheck = checkCommand("npm --version");
  if (npmCheck.available) {
    const npmMajor = parseInt(npmCheck.output.split(".")[0], 10);
    results.runtimes.npm = {
      status: npmMajor >= 10 ? "pass" : "warn",
      version: npmCheck.output,
      message: npmMajor >= 10 ? "npm 10+ detected" : "npm 10+ recommended (detected " + npmCheck.output + ")",
    };
  } else {
    results.runtimes.npm = {
      status: "fail",
      version: "Not found",
      message: "npm not found in PATH",
    };
  }

  // Rust
  const rustCheck = checkCommand("rustc --version");
  if (rustCheck.available) {
    // rustc 1.80.0 (37835f65a 2024-07-22)
    const rustVersionMatch = rustCheck.output.match(/rustc (\d+)\.(\d+)\./);
    const isRustOld =
      rustVersionMatch &&
      (parseInt(rustVersionMatch[1], 10) < 1 ||
        (parseInt(rustVersionMatch[1], 10) === 1 && parseInt(rustVersionMatch[2], 10) < 80));
    results.runtimes.rust = {
      status: isRustOld ? "warn" : "pass",
      version: rustCheck.output.split(" ")[1] || rustCheck.output,
      message: isRustOld ? "Rust 1.80+ recommended" : `Rust ${rustCheck.output.split(" ")[1]} detected`,
    };
  } else {
    results.runtimes.rust = {
      status: "fail",
      version: "Not found",
      message: "Rust compiler (rustc) not found. Install from https://rustup.rs/",
    };
  }

  // wasm32 target
  if (rustCheck.available) {
    const targetCheck = checkCommand("rustup target list --installed");
    if (targetCheck.available) {
      const isWasmInstalled = targetCheck.output.includes("wasm32-unknown-unknown");
      results.runtimes.wasm32 = {
        status: isWasmInstalled ? "pass" : "fail",
        message: isWasmInstalled
          ? "wasm32-unknown-unknown target installed"
          : "wasm32-unknown-unknown target missing. Install via: rustup target add wasm32-unknown-unknown",
      };
    } else {
      results.runtimes.wasm32 = {
        status: "warn",
        message: "Could not verify installed Rust targets (rustup not available)",
      };
    }
  } else {
    results.runtimes.wasm32 = {
      status: "fail",
      message: "wasm32 target check requires Rust",
    };
  }

  // 2. PostgreSQL Connection Check
  const dbUrl = customDbUrl || process.env.DATABASE_URL;
  if (!dbUrl) {
    results.database = {
      connected: false,
      message: "DATABASE_URL is not set in environment variables",
    };
  } else {
    try {
      const client = new pg.Client({
        connectionString: dbUrl,
        connectionTimeoutMillis: 3000,
      });
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      results.database = {
        connected: true,
        message: "Successfully connected to PostgreSQL database",
      };
    } catch (err) {
      results.database = {
        connected: false,
        message: `Failed to connect to PostgreSQL: ${err.message}`,
      };
    }
  }

  // 3. Environment Variables Check
  results.env.SOROBAN_RPC_URL = {
    status: process.env.SOROBAN_RPC_URL ? "pass" : "warn",
    value: process.env.SOROBAN_RPC_URL || "Not set",
    message: process.env.SOROBAN_RPC_URL
      ? "SOROBAN_RPC_URL configured"
      : "SOROBAN_RPC_URL missing (using default stellar.org)",
  };
  results.env.DATABASE_URL = {
    status: process.env.DATABASE_URL ? "pass" : "fail",
    value: process.env.DATABASE_URL || "Not set",
    message: process.env.DATABASE_URL ? "DATABASE_URL configured" : "DATABASE_URL is required",
  };

  // 4. Ports Availability Check (5173, 3001, 5432)
  const portsToCheck = [5173, 3001, 5432];
  for (const port of portsToCheck) {
    const inUse = await isPortInUse(port);
    let message = inUse ? `Port ${port} is in use` : `Port ${port} is available`;
    let status = inUse ? "warn" : "pass";
    if (port === 5432) {
      if (inUse) {
        status = results.database.connected ? "pass" : "warn";
        message = results.database.connected
          ? "Port 5432 is in use (PostgreSQL connected)"
          : "Port 5432 is in use (but PostgreSQL connection failed!)";
      } else {
        status = "fail";
        message = "Port 5432 is free (PostgreSQL is likely NOT running!)";
      }
    }
    results.ports[port] = { status, inUse, message };
  }

  // 5. Disk Space Check (> 1GB free)
  try {
    const stats = await fs.statfs(".");
    const freeBytes = stats.bfree * stats.bsize;
    const freeGB = freeBytes / (1024 * 1024 * 1024);
    results.system.disk = {
      status: freeGB > 1.0 ? "pass" : "fail",
      freeGB: freeGB.toFixed(2),
      message: `${freeGB.toFixed(2)} GB disk space free (required > 1 GB)`,
    };
  } catch (err) {
    results.system.disk = {
      status: "warn",
      message: `Could not verify disk space: ${err.message}`,
    };
  }

  // 6. Memory Check (> 2GB total/available)
  const totalBytes = os.totalmem();
  const totalGB = totalBytes / (1024 * 1024 * 1024);
  const freeBytes = os.freemem();
  const freeGB = freeBytes / (1024 * 1024 * 1024);
  results.system.memory = {
    status: totalGB >= 2.0 ? "pass" : "fail",
    totalGB: totalGB.toFixed(2),
    freeGB: freeGB.toFixed(2),
    message: `${totalGB.toFixed(1)} GB total memory, ${freeGB.toFixed(2)} GB free (required > 2 GB)`,
  };

  // 7. Git Hooks Check
  const expectedHooks = ["pre-commit", "pre-push", "commit-msg", "post-merge"];
  const missingHooks = [];
  const hookStatus = {};
  for (const hook of expectedHooks) {
    const hookPath = path.join(".git", "hooks", hook);
    const exists = fsSync.existsSync(hookPath);
    hookStatus[hook] = exists;
    if (!exists) missingHooks.push(hook);
  }
  results.gitHooks = {
    status: missingHooks.length === 0 ? "pass" : "warn",
    installed: hookStatus,
    message:
      missingHooks.length === 0
        ? "All Git hooks installed successfully"
        : `Missing Git hooks: ${missingHooks.join(", ")}`,
  };

  // 8. Docker & Docker Compose Check
  const dockerVer = checkCommand("docker --version");
  const composeVer = checkCommand("docker compose version");
  results.docker = {
    installed: dockerVer.available && composeVer.available,
    status: dockerVer.available && composeVer.available ? "pass" : "warn",
    message:
      dockerVer.available && composeVer.available
        ? `Docker & Compose detected (${dockerVer.output}, ${composeVer.output})`
        : "Docker or Docker Compose not found in PATH",
  };

  return results;
}
