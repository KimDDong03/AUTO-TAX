type XlsxModule = typeof import("@e965/xlsx");

const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_SHEETS = 12;
const DEFAULT_MAX_ROWS = 5000;
const DEFAULT_MAX_CELLS = 60000;

type SpreadsheetBoundsOptions = {
  maxSheets?: number;
  maxRows?: number;
  maxCells?: number;
};

export function assertSafeSpreadsheetFile(file: File, options: { maxBytes?: number } = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (file.size > maxBytes) {
    throw new Error(`파일 크기는 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하만 업로드할 수 있습니다.`);
  }
}

export function assertSafeSpreadsheetWorkbook(
  XLSX: XlsxModule,
  workbook: { SheetNames: string[]; Sheets: Record<string, unknown> },
  options: SpreadsheetBoundsOptions = {}
) {
  const maxSheets = options.maxSheets ?? DEFAULT_MAX_SHEETS;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;

  if (workbook.SheetNames.length > maxSheets) {
    throw new Error(`시트는 최대 ${maxSheets}개까지만 업로드할 수 있습니다.`);
  }

  let totalCells = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName] as Record<string, unknown> | undefined;
    if (!sheet) {
      continue;
    }

    const rangeRef = typeof sheet["!ref"] === "string" ? sheet["!ref"] : "";
    if (rangeRef) {
      const range = XLSX.utils.decode_range(rangeRef);
      const rowCount = range.e.r - range.s.r + 1;
      const columnCount = range.e.c - range.s.c + 1;
      totalCells += rowCount * columnCount;

      if (rowCount > maxRows) {
        throw new Error(`시트당 행은 최대 ${maxRows}행까지만 업로드할 수 있습니다.`);
      }
      if (totalCells > maxCells) {
        throw new Error(`파일 전체 셀은 최대 ${maxCells.toLocaleString("ko-KR")}개까지만 업로드할 수 있습니다.`);
      }
    }

    for (const [cellAddress, cellValue] of Object.entries(sheet)) {
      if (cellAddress.startsWith("!")) {
        continue;
      }
      if (cellValue && typeof cellValue === "object" && "f" in cellValue) {
        throw new Error("수식이 포함된 엑셀 파일은 업로드할 수 없습니다. 값을 붙여넣은 파일로 다시 업로드하세요.");
      }
    }
  }
}
