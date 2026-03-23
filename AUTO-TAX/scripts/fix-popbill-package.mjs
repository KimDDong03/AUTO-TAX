import fs from "node:fs";
import path from "node:path";

const packagePath = path.resolve(process.cwd(), "node_modules", "popbill", "package.json");

if (!fs.existsSync(packagePath)) {
  process.exit(0);
}

const raw = fs.readFileSync(packagePath, "utf8");
const pkg = JSON.parse(raw);

if (pkg.dependencies?.popbill === "file:") {
  delete pkg.dependencies.popbill;
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  console.log("Fixed popbill self dependency for desktop packaging.");
}
