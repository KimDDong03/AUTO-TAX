import fs from "node:fs";
import path from "node:path";

const packagePath = path.resolve(process.cwd(), "node_modules", "popbill", "package.json");
const selfLinkPath = path.resolve(process.cwd(), "node_modules", "popbill", "node_modules", "popbill");

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

if (fs.existsSync(selfLinkPath)) {
  fs.rmSync(selfLinkPath, { recursive: true, force: true });
  console.log("Removed popbill self-linked node_modules entry.");
}
