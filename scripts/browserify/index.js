"use strict";
const console = require("../modules/console.js");
console.info("Start initialization...");
const mkdtmp = require("../modules/mkdtmp.js");
const browserify = require("browserify");
const minifyStream = require("minify-stream");
const uglify = require("uglify-js");
const browserifyTargets = require("./targets.js");
const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const createCommit = require("../modules/createCommit.js");
const exec = require("../modules/exec.js");

(async () => {
    console.info("browserifyTargets:", browserifyTargets);
    const tempPath = await mkdtmp(true);
    const inputPath = path.join(tempPath, "input.js");
    exec("npm ls").then((output) => console.info("npm ls:", output));
    const localPackageVersions = JSON.parse(await exec("npm ls --json")).dependencies;
    const fileList = [];
    for (const browserifyTarget of browserifyTargets) {
        console.info("target:", browserifyTarget);
        const { module, entry, gadget: { name, fileName }, exports, removePlugins, prependCode } = browserifyTarget;
        const file = path.join("src/gadgets", name, fileName);
        fileList.push(file);
        await fs.promises.rm(inputPath, {
            recursive: true,
            force: true,
        });
        const hasExports = Array.isArray(exports) && exports.length > 0;
        const reference = hasExports ? `{ ${exports.join(", ")} }` : "m";
        await fs.promises.writeFile(inputPath, [
            `import ${reference} from "${module}";`,
            `global["${entry}"] = ${reference};`,
        ].join("\n"));
        const codes = await new Promise((res, rej) => {
            console.info(`[${module}]`, "start generating...");
            const plugins = new Set([
                "esmify",
                "common-shakeify",
                "browser-pack-flat/plugin",
            ]);
            if (Array.isArray(removePlugins)) {
                for (const removePlugin of removePlugins) {
                    plugins.delete(removePlugin);
                }
            }
            let codeObject = browserify(inputPath).transform("unassertify", { global: true }).transform("envify", { global: true });
            for (const plugin of plugins) {
                codeObject = codeObject.plugin(plugin);
            }
            const codeStream = codeObject.bundle().pipe(minifyStream({
                sourceMap: false,
                uglify,
                mangle: false,
                output: {
                    beautify: true,
                    width: 1024 * 10,
                },
            }));
            const chunks = [];
            codeStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
            codeStream.on("error", (err) => rej(err));
            codeStream.on("end", () => res(Buffer.concat(chunks).toString("utf8")));
        });
        const output = [
            "/**",
            " * Generated by scripts/browserify/index.js",
            " * Options:",
        ];
        for (const [k, v] of Object.entries(browserifyTarget)) {
            output.push(` *     ${k}: ${JSON.stringify(v, null, 1).replace(/\n */g, " ")}`);
        }
        output.push(" */");
        if (typeof prependCode === "string") {
            output.push(prependCode);
        }
        output.push(codes.trim(), "");
        const code = output.join("\n");
        const oldCode = await fs.promises.readFile(file, {
            encoding: "utf-8",
        }).catch(() => undefined);
        if (code === oldCode) {
            console.info(`[${module}]`, "No change, continue to next one.");
            continue;
        }
        await fs.promises.writeFile(file, code);
        if (path.extname(file) === ".js") {
            const filename = path.basename(file);
            const eslintrcName = path.join(path.dirname(file), ".eslintrc");
            const eslintrc = JSON.parse(await fs.promises.readFile(eslintrcName, "utf-8").catch(() => "{}"));
            if (!Array.isArray(eslintrc.ignorePatterns)) {
                eslintrc.ignorePatterns = [];
            }
            if (!eslintrc.ignorePatterns.includes(filename)) {
                eslintrc.ignorePatterns.push(filename);
                await fs.promises.writeFile(eslintrcName, JSON.stringify(eslintrc, null, 4));
            }
        }
        console.info(`[${module}]`, "generated successfully.");
        await createCommit(`auto(Gadget-${name}): bump ${module} to ${localPackageVersions[module].version} by browserify`);
    }
    core.exportVariable("linguist-generated-browserify", JSON.stringify(fileList));
    console.info("Done.");
    process.exit(0);
})();
