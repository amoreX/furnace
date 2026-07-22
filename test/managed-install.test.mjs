import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"

const {
  bootstrapFromNpx,
  installManagedFurnace,
  managedInstallPaths,
  renderManagedInstallBanner,
  renderManagedLauncher,
  shouldBootstrapFromNpx,
  windowsUserPathScript,
} = await import("../dist/managed-install.js")

test("managed install uses a versioned user directory and persistent Unix launcher", async () => {
  const root = await mkdtemp(join(tmpdir(), "furnace-managed-"))
  const home = join(root, "home")
  const installRoot = join(root, "install")
  await mkdir(home, { recursive: true })
  let invocation
  let output = ""

  try {
    const result = installManagedFurnace({
      env: { HOME: home, PATH: "/usr/bin", SHELL: "/bin/bash" },
      homeDir: home,
      packageSpec: "cook-furnace@9.8.7",
      platform: "linux",
      root: installRoot,
      showBanner: true,
      spawn: (command, args, options) => {
        invocation = { args, command, options }
        const prefix = args[args.indexOf("--prefix") + 1]
        const packageRoot = join(prefix, "node_modules", "cook-furnace")
        mkdirSync(join(packageRoot, "dist"), { recursive: true })
        writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ version: "9.8.7" }))
        writeFileSync(join(packageRoot, "dist", "cli.js"), "#!/usr/bin/env node\n")
        return { status: 0 }
      },
      stdout: (message) => { output += message },
    })

    assert.equal(result.version, "9.8.7")
    assert.equal(result.pathChanged, true)
    assert.equal(invocation.command, "npm")
    assert.deepEqual(invocation.args.slice(0, 3), ["install", "--prefix", invocation.args[2]])
    assert.match(await readFile(result.launcherPath, "utf8"), /FURNACE_MANAGED_INSTALL=1/)
    assert.match(await readFile(result.launcherPath, "utf8"), /versions\/9\.8\.7/)
    assert.match(await readFile(join(home, ".bashrc"), "utf8"), /\.local\/bin/)
    assert.match(output, /Preparing your Furnace installation/)
    assert.match(output, /Furnace is ready/)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test("Windows paths and launcher use LOCALAPPDATA without administrator directories", () => {
  const paths = managedInstallPaths({
    env: { LOCALAPPDATA: "C:\\Users\\Nihal Rahman\\AppData\\Local" },
    homeDir: "C:\\Users\\Nihal Rahman",
    platform: "win32",
  })
  const launcher = renderManagedLauncher({
    cliPath: "C:\\Users\\Nihal Rahman\\AppData\\Local\\Furnace\\versions\\1.2.3\\node_modules\\cook-furnace\\dist\\cli.js",
    platform: "win32",
    root: paths.root,
  })
  const pathScript = windowsUserPathScript(paths.binDir)

  assert.equal(paths.launcherPath, "C:\\Users\\Nihal Rahman\\AppData\\Local\\Furnace\\bin\\furnace.cmd")
  assert.notEqual(paths.root, "C:\\Users\\Nihal Rahman\\.furnace")
  assert.match(launcher, /set "FURNACE_MANAGED_INSTALL=1"/)
  assert.match(launcher, /node "C:\\Users\\Nihal Rahman\\AppData\\Local\\Furnace\\versions/)
  assert.match(launcher, /%\*/)
  assert.match(pathScript, /SetEnvironmentVariable\('Path'/)
  assert.match(pathScript, /Nihal Rahman/)
  assert.doesNotMatch(paths.root, /Program Files/i)
})

test("npx setup banner identifies Furnace without touching user-state paths", () => {
  const banner = renderManagedInstallBanner()
  const paths = managedInstallPaths({
    env: { HOME: "/home/nihal" },
    homeDir: "/home/nihal",
    platform: "linux",
  })

  assert.match(banner, /██/)
  assert.match(banner, /FURNACE|███████/)
  assert.equal(paths.root, "/home/nihal/.local/share/furnace")
  assert.notEqual(paths.root, "/home/nihal/.furnace")
})

test("npx detection skips source and already-managed launches", () => {
  assert.equal(shouldBootstrapFromNpx({
    env: { npm_command: "exec" },
    packageRoot: "/tmp/npm-cache/_npx/abc/node_modules/cook-furnace",
  }), true)
  assert.equal(shouldBootstrapFromNpx({
    env: { FURNACE_MANAGED_INSTALL: "1", npm_command: "exec" },
    packageRoot: "/tmp/npm-cache/_npx/abc/node_modules/cook-furnace",
  }), false)
  assert.equal(shouldBootstrapFromNpx({
    env: {},
    packageRoot: process.cwd(),
  }), false)
})

test("bootstrap is idempotent when the managed launcher already exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "furnace-bootstrap-"))
  const home = join(root, "home")
  const installRoot = join(root, "install")
  const paths = managedInstallPaths({ homeDir: home, platform: "linux", root: installRoot })
  await mkdir(paths.binDir, { recursive: true })
  await writeFile(paths.launcherPath, "#!/bin/sh\n")
  const expectedCli = join(paths.versionsDir, "1.2.3", "node_modules", "cook-furnace", "dist", "cli.js")
  await mkdir(dirname(expectedCli), { recursive: true })
  await writeFile(expectedCli, "#!/usr/bin/env node\n")

  try {
    const result = bootstrapFromNpx({
      env: { HOME: home, PATH: `${paths.binDir}:/usr/bin`, npm_command: "exec" },
      homeDir: home,
      packageRoot: "/tmp/npm-cache/_npx/abc/node_modules/cook-furnace",
      platform: "linux",
      root: installRoot,
      spawn: () => {
        throw new Error("should not install twice")
      },
      version: "1.2.3",
    })
    assert.equal(result, undefined)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test("failed managed installs surface an actionable error", async () => {
  const root = await mkdtemp(join(tmpdir(), "furnace-failed-install-"))
  assert.throws(() => installManagedFurnace({
    env: { HOME: root, PATH: "/usr/bin" },
    homeDir: root,
    packageSpec: "cook-furnace@latest",
    platform: "linux",
    root: join(root, "install"),
    spawn: () => ({ status: 1 }),
  }), /npm installation failed/)
  await rm(root, { force: true, recursive: true })
})
