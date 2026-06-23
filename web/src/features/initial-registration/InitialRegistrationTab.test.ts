import assert from "node:assert/strict";
import test from "node:test";
import {
  getInitialRegistrationChecklistSelectionPatch,
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
