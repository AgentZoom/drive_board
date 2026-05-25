import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build, transform } from "esbuild";
import { minify as minifyHtml } from "html-minifier-terser";
import JavaScriptObfuscator from "javascript-obfuscator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "drive_board", "web");
const staticDir = path.join(webDir, "static");
const distDir = path.join(webDir, "dist");

const jsEntries = [
  ["login.js", path.join(staticDir, "login.js")],
  ["app.js", path.join(staticDir, "app.js")],
  ["admin.js", path.join(staticDir, "admin.js")],
];

const cssEntries = ["login.css", "styles.css", "admin.css"];

const htmlEntries = [
  ["login.html", path.join(webDir, "login.html")],
  ["app.html", path.join(webDir, "app.html")],
];

const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.2,
  deadCodeInjection: false,
  disableConsoleOutput: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 1,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 1,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

async function buildJavaScript() {
  for (const [outName, entryPoint] of jsEntries) {
    const outfile = path.join(distDir, outName);
    await build({
      entryPoints: [entryPoint],
      bundle: true,
      format: "esm",
      minify: true,
      treeShaking: true,
      sourcemap: false,
      legalComments: "none",
      charset: "utf8",
      target: ["es2020"],
      define: {
        "process.env.NODE_ENV": '"production"',
        __DEV__: "false",
      },
      outfile,
    });

    const source = await readFile(outfile, "utf8");
    const obfuscated = JavaScriptObfuscator.obfuscate(source, obfuscationOptions).getObfuscatedCode();
    await writeFile(outfile, obfuscated, "utf8");
  }
}

async function buildStylesheets() {
  for (const sourceName of cssEntries) {
    const inputPath = path.join(staticDir, sourceName);
    const outputName = sourceName === "styles.css" ? "app.css" : sourceName;
    const source = await readFile(inputPath, "utf8");
    const result = await transform(source, {
      loader: "css",
      minify: true,
      sourcemap: false,
      legalComments: "none",
    });
    await writeFile(path.join(distDir, outputName), result.code, "utf8");
  }
}

async function buildHtml() {
  for (const [outName, inputPath] of htmlEntries) {
    const source = await readFile(inputPath, "utf8");
    const minified = await minifyHtml(source, {
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      minifyCSS: true,
      minifyJS: false,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
    });
    await writeFile(path.join(distDir, outName), minified, "utf8");
  }
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await Promise.all([buildJavaScript(), buildStylesheets(), buildHtml()]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});