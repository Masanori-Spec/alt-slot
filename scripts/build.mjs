import {
  readFile,
  writeFile,
  mkdir,
  rm,
  copyFile,
  readdir,
} from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist/src", { recursive: true });
await mkdir("dist/fixtures", { recursive: true });
for (const f of await readdir("src"))
  if (f.endsWith(".mjs")) await copyFile("src/" + f, "dist/src/" + f);
for (const f of ["index.html", "styles.css"])
  await copyFile("web/" + f, "dist/" + f);
await writeFile(
  "dist/app.mjs",
  (await readFile("web/app.mjs", "utf8")).replace(
    /(["'])\.\.\/src\//g,
    "$1./src/",
  ),
);
for (const f of await readdir("fixtures"))
  if (f.endsWith(".docx"))
    await copyFile("fixtures/" + f, "dist/fixtures/" + f);
console.log("Built AltSlot with subpath-safe local assets.");
