import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const inputFile = path.join(rootDir, "docs", "AUTO-TAX_도입제안서.html");
const outputFile = path.join(rootDir, "docs", "AUTO-TAX_도입제안서.pdf");

const browser = await chromium.launch({
  headless: true
});

try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(inputFile).href, {
    waitUntil: "networkidle"
  });

  await page.pdf({
    path: outputFile,
    format: "A4",
    printBackground: true,
    margin: {
      top: "10mm",
      right: "10mm",
      bottom: "10mm",
      left: "10mm"
    }
  });

  console.log(outputFile);
} finally {
  await browser.close();
}
