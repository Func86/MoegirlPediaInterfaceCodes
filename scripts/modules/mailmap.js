import console from "./console.js";
import fs from "fs";
import { startGroup, endGroup } from "@actions/core";
const rawMailMap = await fs.promises.readFile(".mailmap", { encoding: "utf-8" });
startGroup("Raw .mailmap:");
console.info(rawMailMap);
endGroup();
const mailmap = Object.fromEntries(rawMailMap.replace(/#[^\n]*/g, "").match(/(?<=\n|$)[^>\n]+/g).map((l) => [l.split(" <").slice(1).join(" <").toLowerCase(), l.split(" <")[0]]));
startGroup("Parsed mailmap:");
console.info(mailmap);
endGroup();
export default mailmap;