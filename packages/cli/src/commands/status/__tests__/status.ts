import { defaultConfig } from "@cosm-changesets/config";
import * as git from "@cosm-changesets/git";
import { gitdir, silenceLogsInBlock } from "@cosm-changesets/test-utils";
import { ReleasePlan } from "@cosm-changesets/types";
import writeChangeset from "@cosm-changesets/write";
import fs from "fs-extra";
import path from "path";
import spawn from "spawndamnit";
import status from "..";

function replaceHumanIds(releaseObj: ReleasePlan | undefined) {
  if (!releaseObj) {
    return;
  }
  let counter = 0;
  const changesetNames = new Map<string, string>();

  return {
    ...releaseObj,
    changesets: releaseObj.changesets.map((changeset) => {
      if (changesetNames.get(changeset.id)) {
        throw new Error("Duplicate changeset id found: " + changeset.id);
      }
      const replacedId = `~changeset-${++counter}~`;
      changesetNames.set(changeset.id, replacedId);
      return {
        ...changeset,
        id: replacedId,
      };
    }),
    releases: releaseObj.releases.map((release) => ({
      ...release,
      changesets: release.changesets.map((id) => changesetNames.get(id) || id),
    })),
  };
}

describe("status", () => {
  silenceLogsInBlock();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should get the status for a simple changeset and return the release object", async () => {
    const cwd = await gitdir({
      "package.json": JSON.stringify({
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
      ".changeset/config.json": JSON.stringify({}),
    });

    await spawn("git", ["checkout", "-b", "new-branch"], { cwd });

    await fs.outputFile(
      path.join(cwd, "packages/pkg-a/a.js"),
      'export default "updated a"'
    );
    await writeChangeset(
      {
        summary: "This is a summary",
        releases: [{ name: "pkg-a", type: "minor" }],
      },
      cwd
    );
    await git.add(".", cwd);
    await git.commit("updated a", cwd);

    const releaseObj = await status(cwd, { since: "main" }, defaultConfig);
    expect(replaceHumanIds(releaseObj)).toMatchInlineSnapshot(`
      {
        "changesets": [
          {
            "id": "~changeset-1~",
            "releases": [
              {
                "name": "pkg-a",
                "type": "minor",
              },
            ],
            "summary": "This is a summary",
          },
        ],
        "preState": undefined,
        "releases": [
          {
            "changesets": [
              "~changeset-1~",
            ],
            "name": "pkg-a",
            "newVersion": "1.1.0",
            "oldVersion": "1.0.0",
            "type": "minor",
          },
        ],
      }
    `);
  });

  it("should exit early with a non-zero error code when there are changed packages but no changesets", async () => {
    const cwd = await gitdir({
      "package.json": JSON.stringify({
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
      ".changeset/config.json": JSON.stringify({}),
    });

    // @ts-ignore
    jest.spyOn(process, "exit").mockImplementation(() => {});

    await spawn("git", ["checkout", "-b", "new-branch"], { cwd });

    await fs.outputFile(
      path.join(cwd, "packages/pkg-a/a.js"),
      'export default "updated a"'
    );

    await git.add(".", cwd);
    await git.commit("updated a", cwd);

    await status(cwd, { since: "main" }, defaultConfig);

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("should not exit early with a non-zero error code when there are no changed packages", async () => {
    const cwd = await gitdir({
      "package.json": JSON.stringify({
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
      ".changeset/config.json": JSON.stringify({}),
    });

    // @ts-ignore
    jest.spyOn(process, "exit").mockImplementation(() => {});

    await spawn("git", ["checkout", "-b", "new-branch"], { cwd });

    const releaseObj = await status(cwd, { since: "main" }, defaultConfig);

    expect(process.exit).not.toHaveBeenCalled();
    expect(releaseObj).toEqual({
      changesets: [],
      releases: [],
      preState: undefined,
    });
  });

  it("should not exit early with a non-zero code when there are changed packages and also a changeset", async () => {
    const cwd = await gitdir({
      "package.json": JSON.stringify({
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
      ".changeset/config.json": JSON.stringify({}),
    });

    // @ts-ignore
    jest.spyOn(process, "exit").mockImplementation(() => {});

    await spawn("git", ["checkout", "-b", "new-branch"], { cwd });

    await fs.outputFile(
      path.join(cwd, "packages/pkg-a/a.js"),
      'export default "updated a"'
    );
    await writeChangeset(
      {
        summary: "This is a summary",
        releases: [{ name: "pkg-a", type: "minor" }],
      },
      cwd
    );

    await git.add(".", cwd);
    await git.commit("updated a", cwd);

    await status(cwd, { since: "main" }, defaultConfig);

    expect(process.exit).not.toHaveBeenCalled();
  });

  it.skip("should respect the verbose flag", () => false);

  it("should respect the output flag", async () => {
    const cwd = await gitdir({
      "package.json": JSON.stringify({
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
      ".changeset/config.json": JSON.stringify({}),
    });

    await spawn("git", ["checkout", "-b", "new-branch"], { cwd });

    await fs.outputFile(
      path.join(cwd, "packages/pkg-a/a.js"),
      'export default "updated a"'
    );

    await writeChangeset(
      {
        summary: "This is a summary",
        releases: [{ name: "pkg-a", type: "minor" }],
      },
      cwd
    );

    await git.add(".", cwd);
    await git.commit("updated a", cwd);

    const output = "nonsense.json";

    const probsUndefined = await status(
      cwd,
      { since: "main", output },
      defaultConfig
    );

    const releaseObj = await fs.readFile(path.join(cwd, output), "utf-8");

    expect(probsUndefined).toEqual(undefined);
    expect(replaceHumanIds(JSON.parse(releaseObj))).toMatchInlineSnapshot(`
      {
        "changesets": [
          {
            "id": "~changeset-1~",
            "releases": [
              {
                "name": "pkg-a",
                "type": "minor",
              },
            ],
            "summary": "This is a summary",
          },
        ],
        "releases": [
          {
            "changesets": [
              "~changeset-1~",
            ],
            "name": "pkg-a",
            "newVersion": "1.1.0",
            "oldVersion": "1.0.0",
            "type": "minor",
          },
        ],
      }
    `);
  });

  it("should not exit early with a non-zero error code when there are no changed packages matching the pattern", async () => {
    const cwd = await gitdir({
      "package.json": JSON.stringify({
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
      ".changeset/config.json": JSON.stringify({}),
    });

    // @ts-ignore
    jest.spyOn(process, "exit").mockImplementation(() => {});

    await spawn("git", ["checkout", "-b", "new-branch"], { cwd });

    await fs.outputFile(
      path.join(cwd, "packages/pkg-a/unrelated.json"),
      JSON.stringify({})
    );

    await git.add(".", cwd);
    await git.commit("add unrelated thing", cwd);

    const releaseObj = await status(
      cwd,
      { since: "main" },
      { ...defaultConfig, changedFilePatterns: ["src/**"] }
    );

    expect(process.exit).not.toHaveBeenCalled();
    expect(releaseObj).toEqual({
      changesets: [],
      releases: [],
      preState: undefined,
    });
  });

  it("should exit early with a non-zero error code when there are changed packages matching the pattern but no changesets", async () => {
    const cwd = await gitdir({
      "package.json": JSON.stringify({
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
      "packages/pkg-a/src/a.js": 'export default "a"',
      ".changeset/config.json": JSON.stringify({}),
    });

    // @ts-ignore
    jest.spyOn(process, "exit").mockImplementation(() => {});

    await spawn("git", ["checkout", "-b", "new-branch"], { cwd });

    await fs.outputFile(
      path.join(cwd, "packages/pkg-a/src/a.js"),
      'export default "updated a"'
    );

    await git.add(".", cwd);
    await git.commit("updated a", cwd);

    await status(
      cwd,
      { since: "main" },
      { ...defaultConfig, changedFilePatterns: ["src/**"] }
    );

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("should not exit early with a non-zero error code when there are changed packages matching the pattern and appropriate changeset", async () => {
    const cwd = await gitdir({
      "package.json": JSON.stringify({
        private: true,
        workspaces: ["packages/*"],
      }),
      "packages/pkg-a/package.json": JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
      "packages/pkg-a/src/a.js": 'export default "a"',
      ".changeset/config.json": JSON.stringify({}),
    });

    await spawn("git", ["checkout", "-b", "new-branch"], { cwd });

    await fs.outputFile(
      path.join(cwd, "packages/pkg-a/a.js"),
      'export default "updated a"'
    );
    await writeChangeset(
      {
        summary: "This is a summary",
        releases: [{ name: "pkg-a", type: "minor" }],
      },
      cwd
    );
    await git.add(".", cwd);
    await git.commit("updated a", cwd);

    const releaseObj = await status(
      cwd,
      { since: "main" },
      { ...defaultConfig, changedFilePatterns: ["src/**"] }
    );
    expect(replaceHumanIds(releaseObj)).toMatchInlineSnapshot(`
      {
        "changesets": [
          {
            "id": "~changeset-1~",
            "releases": [
              {
                "name": "pkg-a",
                "type": "minor",
              },
            ],
            "summary": "This is a summary",
          },
        ],
        "preState": undefined,
        "releases": [
          {
            "changesets": [
              "~changeset-1~",
            ],
            "name": "pkg-a",
            "newVersion": "1.1.0",
            "oldVersion": "1.0.0",
            "type": "minor",
          },
        ],
      }
    `);
  });
});
