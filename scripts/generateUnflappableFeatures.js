"use strict";
const console = require("./console.js");
console.info("Start initialization...");
const exec = require("./exec.js");
const axios = require("./axios.js");
const fsPromises = require("fs/promises");

const targetChromiumVersion = "70.0.3538.0";
const targetUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${targetChromiumVersion} Safari/537.36`;

(async () => {
    try {
        const unflappableFeatures = [];
        await fsPromises.mkdir("tmp", {
            recursive: true,
        });
        console.info("Start compile src/ to temporary bundle file...");
        await exec("npx tsc --project tsconfig.json --outFile tmp/bundle.js");
        console.info("\tDone.");
        console.info("Start analyse the temporary bundle file...");
        const analysisReport = [...new Set(JSON.parse(await exec("npx @financial-times/js-features-analyser analyse --file tmp/bundle.js")))];
        const clone = [...analysisReport];
        console.info("\tDone.");
        let i = 0;
        while (analysisReport.length > 0) {
            const piece = [];
            while (analysisReport.length > 0 && piece.join(",").length <= 1973) {
                piece.push(analysisReport.splice(0, 1));
            }
            console.info(`Start download polyfill file #${i}...`);
            const url = new URL("https://polyfill.io/v3/polyfill.js");
            url.searchParams.set("features", piece.join(","));
            url.searchParams.set("ua", targetUA);
            const { data } = await axios.get(`${url}`);
            console.info("\tDone.");
            const match = data.match(/(?<=\n \* These features were not recognised:\n \* - )[^\n]+?(?=\s*\*\/)/)?.[0]?.split?.(/,-\s*/);
            unflappableFeatures.push(...match);
            i++;
        }
        await fsPromises.writeFile("tmp/unflappableFeatures.json", `${JSON.stringify(unflappableFeatures, null, 4)}\n`);
        console.info("left", clone.length - unflappableFeatures.length);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();