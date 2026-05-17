import assert from "node:assert/strict";
import test from "node:test";
import {
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
