import fs from "fs";
import path from "node:path";

import { $ } from "zx";

/**
 * Thin, non-interactive wrappers around the `vercel` CLI (the only process
 * boundary of the setup command - unit tests fake this interface instead of
 * spawning processes).
 *
 * Every command is invoked with `--token`/`--scope` when provided so it
 * works headless (CI, agents) without a `vercel login` session, and with
 * `--cwd` for the commands that operate on a linked project directory.
 * Secret values are always piped via stdin, never passed in argv.
 */
export interface VercelCli {
  doesProjectExist(projectName: string): Promise<boolean>;
  createProject(projectName: string): Promise<void>;
  linkProjectToDir(projectName: string, dir: string): Promise<void>;
  setEnvVar(
    linkedProjectDir: string,
    name: string,
    value: string,
    environment?: string,
  ): Promise<void>;
  pullEnvVars(
    linkedProjectDir: string,
    environment: string,
  ): Promise<Record<string, string>>;
  isIntegrationInstalled(integrationSlug: string): Promise<boolean>;
  addIntegrationResource(args: {
    integrationSlug: string;
    resourceName: string;
    linkedProjectDir: string;
  }): Promise<{ success: boolean; output: string }>;
  connectIntegrationResource(args: {
    resourceName: string;
    projectName: string;
    linkedProjectDir: string;
  }): Promise<{ success: boolean; output: string }>;
}

export interface VercelCliOptions {
  vercelExe: string;
  token?: string;
  scope?: string;
}

export function createVercelCli(options: VercelCliOptions): VercelCli {
  return new ZxVercelCli(options);
}

class ZxVercelCli implements VercelCli {
  private readonly vercelExe: string;
  private readonly authArgs: string[];

  constructor({ vercelExe, token, scope }: VercelCliOptions) {
    this.vercelExe = vercelExe;
    this.authArgs = [
      ...(token ? ["--token", token] : []),
      ...(scope ? ["--scope", scope] : []),
    ];
  }

  async doesProjectExist(projectName: string): Promise<boolean> {
    const result = await this.runVercelCommand(
      ["project", "inspect", projectName],
      { nothrow: true, quiet: true },
    );
    return result.exitCode === 0;
  }

  async createProject(projectName: string): Promise<void> {
    await this.runVercelCommand(["project", "add", projectName]);
  }

  async linkProjectToDir(projectName: string, dir: string): Promise<void> {
    await this.runVercelCommand([
      "link",
      "--yes",
      ...["--project", projectName],
      ...["--cwd", dir],
    ]);
  }

  async setEnvVar(
    linkedProjectDir: string,
    name: string,
    value: string,
    environment: string = "production",
  ): Promise<void> {
    // `--force` overwrites an existing variable for the same target, which
    // keeps re-runs of `setup` idempotent. The value is piped via stdin so
    // it never shows up in argv or logs.
    await this.runVercelCommand(
      [
        "env",
        "add",
        name,
        environment,
        "--force",
        ...["--cwd", linkedProjectDir],
      ],
      { input: value, quiet: true },
    );
  }

  async pullEnvVars(
    linkedProjectDir: string,
    environment: string,
  ): Promise<Record<string, string>> {
    // Pull into a throwaway file inside the (temporary) linked dir, parse
    // it, and delete it right away so no secret values linger on disk.
    const envFileName = `.env.wasp-vercel-setup.${environment}`;
    const envFilePath = path.join(linkedProjectDir, envFileName);
    try {
      await this.runVercelCommand(
        [
          "env",
          "pull",
          envFileName,
          ...["--environment", environment],
          "--yes",
          ...["--cwd", linkedProjectDir],
        ],
        { quiet: true },
      );
      return parseEnvFile(fs.readFileSync(envFilePath, "utf-8"));
    } finally {
      fs.rmSync(envFilePath, { force: true });
    }
  }

  async isIntegrationInstalled(integrationSlug: string): Promise<boolean> {
    const result = await this.runVercelCommand(
      [
        "integration",
        "installations",
        ...["--integration", integrationSlug],
        "--format=json",
      ],
      { nothrow: true, quiet: true },
    );
    if (result.exitCode !== 0) {
      return false;
    }
    return jsonOutputListsAnInstallation(result.stdout);
  }

  async addIntegrationResource({
    integrationSlug,
    resourceName,
    linkedProjectDir,
  }: {
    integrationSlug: string;
    resourceName: string;
    linkedProjectDir: string;
  }): Promise<{ success: boolean; output: string }> {
    // Connects the new resource to the project linked in `linkedProjectDir`.
    // `--no-claim` prevents blocking on the sandbox-claim prompt and
    // `--no-env-pull` keeps the CLI from writing an .env file as a side
    // effect (we pull env vars explicitly when we need them).
    const result = await this.runVercelCommand(
      [
        "integration",
        "add",
        integrationSlug,
        ...["--name", resourceName],
        ...["-e", "production", "-e", "preview", "-e", "development"],
        "--no-claim",
        "--no-env-pull",
        ...["--cwd", linkedProjectDir],
      ],
      { nothrow: true },
    );
    return {
      success: result.exitCode === 0,
      output: `${result.stdout}\n${result.stderr}`.trim(),
    };
  }

  async connectIntegrationResource({
    resourceName,
    projectName,
    linkedProjectDir,
  }: {
    resourceName: string;
    projectName: string;
    linkedProjectDir: string;
  }): Promise<{ success: boolean; output: string }> {
    const result = await this.runVercelCommand(
      [
        "integration",
        "resource",
        "connect",
        resourceName,
        projectName,
        ...["-e", "production", "-e", "preview", "-e", "development"],
        "--yes",
        ...["--cwd", linkedProjectDir],
      ],
      { nothrow: true },
    );
    return {
      success: result.exitCode === 0,
      output: `${result.stdout}\n${result.stderr}`.trim(),
    };
  }

  private runVercelCommand(
    commandArgs: string[],
    options: { nothrow?: boolean; quiet?: boolean; input?: string } = {},
  ) {
    return $({
      nothrow: options.nothrow ?? false,
      quiet: options.quiet ?? false,
      ...(options.input !== undefined ? { input: options.input } : {}),
    })`${this.vercelExe} ${[...commandArgs, ...this.authArgs]}`;
  }
}

/**
 * Parses the dotenv-style file `vercel env pull` writes
 * (`KEY="value"` lines, plus comments and blank lines).
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const envVars: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match === null) {
      continue;
    }
    const [, name, rawValue] = match;
    envVars[name] = stripSurroundingQuotes(rawValue.trim());
  }
  return envVars;
}

function stripSurroundingQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

function jsonOutputListsAnInstallation(stdout: string): boolean {
  try {
    const parsed: unknown = JSON.parse(stdout);
    const installations = Array.isArray(parsed)
      ? parsed
      : isObjectWithArrayField(parsed, "installations")
        ? parsed.installations
        : null;
    if (installations !== null) {
      return installations.length > 0;
    }
  } catch {
    // Not JSON - fall through to the textual heuristic below.
  }
  // Installation configuration IDs look like `icfg_...` - seeing one means
  // at least one installation exists even if the JSON shape changed.
  return stdout.includes("icfg_");
}

function isObjectWithArrayField<Field extends string>(
  value: unknown,
  field: Field,
): value is { [key in Field]: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>)[field])
  );
}
