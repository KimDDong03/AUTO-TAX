import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAddress, toRoadAddress } from "./utils.js";

test("address normalization ignores spacing, punctuation, and parenthesized lot address", () => {
  const roadAddress = "경상북도 의성군 중하길 397-3 (안사면 중하리522-0)";

  assert.equal(toRoadAddress(roadAddress), "경상북도 의성군 중하길 397-3");
  assert.equal(
    normalizeAddress(roadAddress),
    normalizeAddress("경상북도 의성군 중하길397 3")
  );
});
