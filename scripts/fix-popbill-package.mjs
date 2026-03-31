import fs from "node:fs";
import path from "node:path";

const packagePath = path.resolve(process.cwd(), "node_modules", "popbill", "package.json");
const selfLinkPath = path.resolve(process.cwd(), "node_modules", "popbill", "node_modules", "popbill");
const baseServicePath = path.resolve(process.cwd(), "node_modules", "popbill", "lib", "BaseService.js");

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

if (fs.existsSync(baseServicePath)) {
  const source = fs.readFileSync(baseServicePath, "utf8");
  const patched = source.replace(
    "delete _this._Linkhub_Token_Cash[this._config.IsTest ? 'TEST_'+CorpNum : 'PROD_'+CorpNum]",
    "delete _this._Linkhub_Token_Cash[_this._config.IsTest ? 'TEST_'+CorpNum : 'PROD_'+CorpNum]"
  );

  if (patched !== source) {
    fs.writeFileSync(baseServicePath, patched, "utf8");
    console.log("Patched popbill quitMember token cache bug.");
  }
}
