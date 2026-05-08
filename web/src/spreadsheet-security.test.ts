import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "@e965/xlsx";
import { assertSafeSpreadsheetFile, assertSafeSpreadsheetWorkbook } from "./spreadsheet-security";

test("assertSafeSpreadsheetFile rejects oversized files", () => {
  const file = { size: 6 * 1024 * 1024 } as File;
  assert.throws(() => assertSafeSpreadsheetFile(file), /5MB 이하/);
});

test("assertSafeSpreadsheetWorkbook rejects formulas", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["이름"], ["허문행"]]);
  sheet.A2 = { t: "n", f: "1+1" };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "발전소");

  assert.throws(() => assertSafeSpreadsheetWorkbook(XLSX, workbook), /수식이 포함/);
});

test("assertSafeSpreadsheetWorkbook rejects excessive row ranges", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["이름"]]);
  sheet["!ref"] = "A1:A5002";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "발전소");

  assert.throws(() => assertSafeSpreadsheetWorkbook(XLSX, workbook, { maxRows: 5000 }), /최대 5000행/);
});
