import path from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createVercelCommand } from "../../../src/providers/vercel/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");
const stubVercelCliPath = path.join(fixturesDir, "stubVercelCli.sh");

// createVercelCommand() mutates module-level singleton subcommands
// (vercelSetupCommand/vercelDeployCommand/vercelLaunchCommand from
// task-13), so it can only safely be called once per process - build it a
// single time here and share it across every describe block below.
const vercel = createVercelCommand();

describe("createVercelCommand", () => {
  test("returns a command named 'vercel'", () => {
    expect(vercel).toBeInstanceOf(Command);
    expect(vercel.name()).toBe("vercel");
  });

  test("registers setup, deploy and launch subcommands", () => {
    const subcommandNames = vercel.commands.map((cmd) => cmd.name());
    expect(subcommandNames).toEqual(
      expect.arrayContaining(["setup", "deploy", "launch"]),
    );
  });

  describe.each(["setup", "deploy", "launch"])("%s subcommand", (name) => {
    const subcommand = vercel.commands.find((cmd) => cmd.name() === name);

    test("exists", () => {
      expect(subcommand).toBeDefined();
    });

    test("accepts hidden --wasp-exe option", () => {
      const option = subcommand?.options.find(
        (opt) => opt.long === "--wasp-exe",
      );
      expect(option).toBeDefined();
      expect(option?.hidden).toBe(true);
    });

    test("accepts hidden --wasp-project-dir option", () => {
      const option = subcommand?.options.find(
        (opt) => opt.long === "--wasp-project-dir",
      );
      expect(option).toBeDefined();
      expect(option?.hidden).toBe(true);
    });

    test("accepts --vercel-exe option defaulting to 'vercel'", () => {
      const option = subcommand?.options.find(
        (opt) => opt.long === "--vercel-exe",
      );
      expect(option).toBeDefined();
      expect(option?.defaultValue).toBe("vercel");
    });
  });
});

describe("preflight warnings wired into command run (task-16)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // These subcommands' real actions are not implemented yet (task-14/15);
  // they always reject with a "not implemented yet" error. That rejection
  // is expected here and proves the preflight warning did NOT block the
  // command: the preAction hook ran, printed its warning, and let the
  // (currently unimplemented) action run next - warn-not-block.
  describe.each(["setup", "deploy", "launch"])("%s subcommand", (name) => {
    test("prints the job preflight warning before the not-implemented error", async () => {
      await expect(
        vercel.parseAsync(
          [
            name,
            "my-app",
            "--wasp-exe",
            "wasp",
            "--wasp-project-dir",
            path.join(fixturesDir, "appWithJob"),
            "--vercel-exe",
            stubVercelCliPath,
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("not implemented yet");

      const printed = warnSpy.mock.calls
        .map((call) => call.join(" "))
        .join("\n");
      expect(printed).toContain("sendEmailJob");
      expect(printed).toContain("Vercel Cron");
    });

    test("prints no preflight warning for a project with neither jobs nor webSockets", async () => {
      await expect(
        vercel.parseAsync(
          [
            name,
            "my-app",
            "--wasp-exe",
            "wasp",
            "--wasp-project-dir",
            path.join(fixturesDir, "appWithNeither"),
            "--vercel-exe",
            stubVercelCliPath,
          ],
          { from: "user" },
        ),
      ).rejects.toThrow("not implemented yet");

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
