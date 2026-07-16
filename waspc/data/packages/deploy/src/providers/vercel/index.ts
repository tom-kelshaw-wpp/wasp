import { Command, Option } from "commander";
import { $ } from "zx";

import { WaspProjectDir } from "../../common/brandedTypes.js";
import { runVercelPreflightChecks } from "./preflight.js";

class VercelCommand extends Command {
  addProjectNameArgument(): this {
    return this.argument("<project-name>", "project name to use on Vercel");
  }
}

export const vercelSetupCommand = makeVercelSetupCommand();

export const vercelDeployCommand = makeVercelDeployCommand();

const vercelLaunchCommand = makeVercelLaunchCommand();

export function createVercelCommand(): Command {
  const vercel = new Command("vercel")
    .description("Create and deploy Wasp apps on Vercel")
    .addCommand(vercelSetupCommand)
    .addCommand(vercelDeployCommand)
    .addCommand(vercelLaunchCommand)
    .allowUnknownOption();

  // Add global options and hooks to all commands.
  // Add these hooks before any command-specific ones so they run first.
  vercel.commands.forEach((cmd) => {
    cmd
      .addOption(
        new Option(
          "--wasp-exe <path>",
          "Wasp executable (either on PATH or absolute path)",
        )
          .hideHelp()
          .makeOptionMandatory(),
      )
      .addOption(
        new Option(
          "--wasp-project-dir <dir>",
          "absolute path to Wasp project dir",
        )
          .hideHelp()
          .makeOptionMandatory(),
      )
      .addOption(
        new Option(
          "--vercel-exe <path>",
          "Vercel command to run (either on PATH or absolute path)",
        )
          .hideHelp()
          .default("vercel"),
      )
      .hook("preAction", (cmd) => {
        const { waspProjectDir } = cmd.opts<{ waspProjectDir: string }>();
        // Preflight (task-16): warn-not-block detection of Wasp project
        // features (pg-boss jobs, WebSockets) known to behave badly on
        // Vercel. This never throws and never blocks the command below.
        runVercelPreflightChecks(waspProjectDir as WaspProjectDir);
      })
      .hook("preAction", async (cmd) => {
        const { vercelExe } = cmd.opts<{ vercelExe: string }>();
        await ensureVercelCliReady(vercelExe);
      });
  });

  return vercel;
}

async function ensureVercelCliReady(vercelExe: string): Promise<void> {
  await ensureVercelCliInstalled(vercelExe);
  await ensureUserLoggedIn(vercelExe);
}

async function ensureVercelCliInstalled(vercelExe: string): Promise<void> {
  const result = await $({ nothrow: true })`${vercelExe} --version`;
  if (result.exitCode !== 0) {
    throw new Error(
      [
        "Failed to run the Vercel CLI. Most likely the Vercel CLI is not installed.",
        "Read how to install the Vercel CLI here: https://vercel.com/docs/cli",
      ].join("\n"),
    );
  }
}

async function ensureUserLoggedIn(vercelExe: string): Promise<void> {
  const result = await $({ nothrow: true })`${vercelExe} whoami`;
  if (result.exitCode !== 0) {
    throw new Error(
      [
        "You are not logged in to the Vercel CLI.",
        `Log in with \`${vercelExe} login\` (or provide a token via the VERCEL_TOKEN env var) and try again.`,
      ].join("\n"),
    );
  }
}

function makeVercelSetupCommand(): Command {
  return new VercelCommand("setup")
    .description("Configure a new app on Vercel")
    .addProjectNameArgument()
    .action(() => {
      throw new Error(
        "`wasp deploy vercel setup` is not implemented yet. Nothing was changed on Vercel.",
      );
    });
}

function makeVercelDeployCommand(): Command {
  return new VercelCommand("deploy")
    .description("Deploys the app to Vercel")
    .addProjectNameArgument()
    .action(() => {
      throw new Error(
        "`wasp deploy vercel deploy` is not implemented yet. Nothing was deployed to Vercel.",
      );
    });
}

function makeVercelLaunchCommand(): Command {
  return new VercelCommand("launch")
    .description("Launch a new app on Vercel (calls setup and deploy)")
    .addProjectNameArgument()
    .action(() => {
      throw new Error(
        "`wasp deploy vercel launch` is not implemented yet. Nothing was changed on Vercel.",
      );
    });
}
