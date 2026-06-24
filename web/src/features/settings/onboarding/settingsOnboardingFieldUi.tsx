import React from "react";

export function getOnboardingRequiredFieldClassName(hasError: boolean) {
  return hasError
    ? "onboarding-required-field is-missing"
    : "onboarding-required-field";
}

export function getOnboardingRequiredLabelClassName(hasError: boolean) {
  return hasError
    ? "onboarding-required-label is-missing"
    : "onboarding-required-label";
}

export function getOnboardingRequiredInputClassName(hasError: boolean) {
  return hasError
    ? "onboarding-required-input is-missing"
    : "onboarding-required-input";
}

export function getOnboardingRequiredHintClassName(hasError: boolean) {
  return hasError
    ? "field-hint onboarding-required-hint is-missing"
    : "field-hint onboarding-required-hint";
}

export function getOnboardingPasswordFieldClassName(hasError: boolean) {
  return hasError
    ? "onboarding-password-field is-missing"
    : "onboarding-password-field";
}

export function renderOnboardingRequiredHint(
  hintId: string,
  options: {
    missing: boolean;
    invalid?: boolean;
    invalidText?: string;
    defaultText?: string;
  }
) {
  const hasError = options.missing || Boolean(options.invalid);
  const hintText = options.missing
    ? "필수 입력 사항입니다."
    : options.invalid
      ? options.invalidText
      : options.defaultText;

  if (!hintText) {
    return null;
  }

  return (
    <span id={hintId} className={getOnboardingRequiredHintClassName(hasError)}>
      {hintText}
    </span>
  );
}
