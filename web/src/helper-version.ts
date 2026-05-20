import type { LocalRenewalHelperReleaseMetadata } from "./local-renewal-helper";

export type LocalRenewalHelperUpgradeState = "unknown" | "up-to-date" | "upgrade-available" | "upgrade-required";

export type LocalRenewalHelperUpgradeEvaluation = {
  latestVersion: string | null;
  minSupportedVersion: string | null;
  upgradeState: LocalRenewalHelperUpgradeState;
  upgradeMessage: string | null;
};

function parseVersionSegments(version: string): number[] | null {
  const normalized = version.trim();
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    return null;
  }

  const segments = normalized.split(".").map((segment) => Number.parseInt(segment, 10));
  return segments.every((segment) => Number.isInteger(segment) && segment >= 0) ? segments : null;
}

export function compareVersionStrings(leftVersion: string, rightVersion: string): number | null {
  const leftSegments = parseVersionSegments(leftVersion);
  const rightSegments = parseVersionSegments(rightVersion);
  if (!leftSegments || !rightSegments) {
    return null;
  }

  const maxLength = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < maxLength; index += 1) {
    const left = leftSegments[index] ?? 0;
    const right = rightSegments[index] ?? 0;
    if (left !== right) {
      return left > right ? 1 : -1;
    }
  }

  return 0;
}

export function evaluateLocalRenewalHelperUpgrade(
  helperVersion: string | null,
  metadata: LocalRenewalHelperReleaseMetadata | null
): LocalRenewalHelperUpgradeEvaluation {
  if (!metadata) {
    return {
      latestVersion: null,
      minSupportedVersion: null,
      upgradeState: "unknown",
      upgradeMessage: null
    };
  }

  const latestVersion = metadata.latestVersion.trim() || null;
  const minSupportedVersion = metadata.minSupportedVersion.trim() || null;
  if (!helperVersion || !latestVersion || !minSupportedVersion) {
    return {
      latestVersion,
      minSupportedVersion,
      upgradeState: "unknown",
      upgradeMessage: null
    };
  }

  const latestComparison = compareVersionStrings(helperVersion, latestVersion);
  const minimumComparison = compareVersionStrings(helperVersion, minSupportedVersion);
  if (latestComparison === null || minimumComparison === null) {
    return {
      latestVersion,
      minSupportedVersion,
      upgradeState: "unknown",
      upgradeMessage: null
    };
  }

  if (minimumComparison < 0) {
    return {
      latestVersion,
      minSupportedVersion,
      upgradeState: "upgrade-required",
      upgradeMessage: "업데이트 필요"
    };
  }

  if (latestComparison < 0) {
    return {
      latestVersion,
      minSupportedVersion,
      upgradeState: "upgrade-available",
      upgradeMessage: "업데이트 필요"
    };
  }

  return {
    latestVersion,
    minSupportedVersion,
    upgradeState: "up-to-date",
    upgradeMessage: null
  };
}
