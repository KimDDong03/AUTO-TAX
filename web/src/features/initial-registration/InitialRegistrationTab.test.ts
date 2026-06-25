import assert from "node:assert/strict";
import test from "node:test";
import {
  getInitialRegistrationChecklistDragSelectionPatch,
  getInitialRegistrationChecklistSearchMatches,
  buildInitialRegistrationPasswordPasteUpdates,
  getInitialRegistrationChecklistSelectionPatch,
  getInitialRegistrationPasswordClearRowIndexes,
  parseInitialRegistrationPasswordPasteText,
  shouldShowInitialRegistrationTemplateActions,
  type InitialRegistrationStage
} from "./InitialRegistrationTab";

test("initial registration keeps template actions available after upload completion", () => {
  for (const registrationStage of ["commit", "certificate", "done"] satisfies InitialRegistrationStage[]) {
    assert.equal(
      shouldShowInitialRegistrationTemplateActions({
        mode: "registration",
        registrationStage,
        uploadCompleted: true,
        templateStepSelected: true
      }),
      true
    );
  }
});

test("initial registration does not keep template actions always visible after upload completion", () => {
  assert.equal(
    shouldShowInitialRegistrationTemplateActions({
      mode: "registration",
      registrationStage: "commit",
      uploadCompleted: true,
      templateStepSelected: false
    }),
    false
  );
});

test("initial registration hides template actions outside registration mode", () => {
  assert.equal(
    shouldShowInitialRegistrationTemplateActions({
      mode: "exceptions",
      registrationStage: "commit",
      uploadCompleted: true,
      templateStepSelected: true
    }),
    false
  );
});

const checklistRows = [
  { rowIndex: 2, certificateIndex: "1", certificateName: "A", plantName: "A", certificatePassword: "" },
  { rowIndex: 3, certificateIndex: "2", certificateName: "B", plantName: "B", certificatePassword: "" },
  { rowIndex: 4, certificateIndex: "3", certificateName: "C", plantName: "C", certificatePassword: "" },
  { rowIndex: 5, certificateIndex: "4", certificateName: "D", plantName: "D", certificatePassword: "" }
];

test("initial registration checklist selection toggles a single row without shift", () => {
  const patch = getInitialRegistrationChecklistSelectionPatch(checklistRows, {
    rowIndex: 4,
    selected: true,
    anchorRowIndex: 2,
    shiftKey: false
  });

  assert.deepEqual(patch, { rowIndexes: [4], selected: true });
});

test("initial registration checklist selection expands through the anchor with shift", () => {
  const patch = getInitialRegistrationChecklistSelectionPatch(checklistRows, {
    rowIndex: 5,
    selected: true,
    anchorRowIndex: 3,
    shiftKey: true
  });

  assert.deepEqual(patch, { rowIndexes: [3, 4, 5], selected: true });
});

test("initial registration checklist selection falls back to one row without an anchor", () => {
  const patch = getInitialRegistrationChecklistSelectionPatch(checklistRows, {
    rowIndex: 5,
    selected: false,
    anchorRowIndex: null,
    shiftKey: true
  });

  assert.deepEqual(patch, { rowIndexes: [5], selected: false });
});

test("initial registration drag selection shrinks back to the active range", () => {
  const rowsAfterDraggingDown = checklistRows.map((row) => ({
    ...row,
    selected: row.rowIndex >= 2 && row.rowIndex <= 5
  }));

  const patch = getInitialRegistrationChecklistDragSelectionPatch(rowsAfterDraggingDown, {
    anchorRowIndex: 2,
    currentRowIndex: 3,
    selected: true,
    initialSelectedRowIndexes: []
  });

  assert.deepEqual(patch, {
    selectedRowIndexes: [],
    deselectedRowIndexes: [4, 5]
  });
});

test("initial registration drag selection preserves rows selected before the drag", () => {
  const rowsAfterDraggingDown = checklistRows.map((row) => ({
    ...row,
    selected: row.rowIndex >= 2 && row.rowIndex <= 5
  }));

  const patch = getInitialRegistrationChecklistDragSelectionPatch(rowsAfterDraggingDown, {
    anchorRowIndex: 2,
    currentRowIndex: 3,
    selected: true,
    initialSelectedRowIndexes: [4]
  });

  assert.deepEqual(patch, {
    selectedRowIndexes: [],
    deselectedRowIndexes: [5]
  });
});

test("initial registration drag deselection restores rows outside the active range", () => {
  const rowsAfterDraggingDown = checklistRows.map((row) => ({
    ...row,
    selected: false
  }));

  const patch = getInitialRegistrationChecklistDragSelectionPatch(rowsAfterDraggingDown, {
    anchorRowIndex: 2,
    currentRowIndex: 3,
    selected: false,
    initialSelectedRowIndexes: [2, 3, 4, 5]
  });

  assert.deepEqual(patch, {
    selectedRowIndexes: [4, 5],
    deselectedRowIndexes: []
  });
});

test("initial registration password clear targets only selected rows with entered passwords", () => {
  const rows = checklistRows.map((row) => ({
    ...row,
    selected: row.rowIndex !== 5,
    certificatePassword:
      row.rowIndex === 2
        ? "pw-a"
        : row.rowIndex === 3
          ? ""
          : row.rowIndex === 4
            ? "pw-c"
            : "pw-d"
  }));

  assert.deepEqual(getInitialRegistrationPasswordClearRowIndexes(rows), [2, 4]);
});

test("initial registration checklist search matches names and compact business numbers", () => {
  const rows = [
    {
      rowIndex: 2,
      certificateIndex: "1",
      certificateName: "김부연()001168820231011111001399",
      plantName: "김부연발전소",
      corpName: "김부연 태양광",
      businessNumber: "123-45-67890",
      certificatePassword: ""
    },
    {
      rowIndex: 3,
      certificateIndex: "2",
      certificateName: "원승태()001168720231104111000570",
      plantName: "원승태발전소",
      corpName: "원승태 에너지",
      businessNumber: "987-65-43210",
      certificatePassword: ""
    }
  ];

  assert.deepEqual(
    getInitialRegistrationChecklistSearchMatches(rows, "김부연").map((row) => row.rowIndex),
    [2]
  );
  assert.deepEqual(
    getInitialRegistrationChecklistSearchMatches(rows, "1234567890").map((row) => row.rowIndex),
    [2]
  );
  assert.deepEqual(
    getInitialRegistrationChecklistSearchMatches(rows, "  승태  ").map((row) => row.rowIndex),
    [3]
  );
});

test("initial registration password paste parses spreadsheet rows", () => {
  assert.deepEqual(
    parseInitialRegistrationPasswordPasteText("pw-1\r\npw-2\npw-3\tignored\n"),
    ["pw-1", "pw-2", "pw-3"]
  );
});

test("initial registration password paste applies one value to selected rows", () => {
  const updates = buildInitialRegistrationPasswordPasteUpdates({
    rows: checklistRows,
    selectedRowIndexes: [3, 5],
    startRowIndex: 3,
    text: "same-password"
  });

  assert.deepEqual(updates, [
    { rowIndex: 3, value: "same-password" },
    { rowIndex: 5, value: "same-password" }
  ]);
});

test("initial registration password paste fills selected rows in table order", () => {
  const updates = buildInitialRegistrationPasswordPasteUpdates({
    rows: checklistRows,
    selectedRowIndexes: [5, 3],
    startRowIndex: 3,
    text: "pw-b\npw-d"
  });

  assert.deepEqual(updates, [
    { rowIndex: 3, value: "pw-b" },
    { rowIndex: 5, value: "pw-d" }
  ]);
});

test("initial registration password paste fills downward from the focused row without selection", () => {
  const updates = buildInitialRegistrationPasswordPasteUpdates({
    rows: checklistRows,
    selectedRowIndexes: [],
    startRowIndex: 4,
    text: "pw-c\npw-d\nignored"
  });

  assert.deepEqual(updates, [
    { rowIndex: 4, value: "pw-c" },
    { rowIndex: 5, value: "pw-d" }
  ]);
});
