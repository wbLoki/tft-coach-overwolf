/** Writes build/terms.txt, the plain-text copy of TERMS.md that the installer shows. Run by `npm run build`. */
import fs from "node:fs";

const blocks = []; // headings, paragraphs and list items, each on one line: the installer wraps them itself
let open = false; // the last block can still take the next line
for (const line of fs.readFileSync("TERMS.md", "utf8").split(/\r?\n/)) {
  const text = line.trim();
  if (!text) {
    open = false;
  } else if (text.startsWith("#")) {
    blocks.push(text.replace(/^#+\s*/, "").toUpperCase());
    open = false;
  } else if (open && !text.startsWith("- ")) {
    blocks[blocks.length - 1] += " " + text;
  } else {
    blocks.push(text);
    open = true;
  }
}
const plain = blocks.join("\r\n\r\n")
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // [text](url)
  .replace(/<(https?:[^>]+)>/g, "$1")
  .replace(/\*\*|`/g, "");

fs.mkdirSync("build", { recursive: true });
fs.writeFileSync("build/terms.txt", "﻿" + plain + "\r\n"); // the BOM tells the installer the text is UTF-8
