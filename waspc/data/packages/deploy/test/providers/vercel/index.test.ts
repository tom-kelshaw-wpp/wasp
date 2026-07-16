import { Command } from "commander";
import { describe, expect, test } from "vitest";
import { createVercelCommand } from "../../../src/providers/vercel/index.js";

describe("createVercelCommand", () => {
  const vercel = createVercelCommand();

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
