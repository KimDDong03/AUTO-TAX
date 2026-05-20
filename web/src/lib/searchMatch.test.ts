import assert from "node:assert/strict";
import test from "node:test";
import { matchesAnySearchText, matchesSearchText } from "./searchMatch";

test("matchesSearchText supports Korean initial consonant queries", () => {
  assert.equal(matchesSearchText("강성기 발전소", "ㄱㅅㄱ"), true);
  assert.equal(matchesSearchText("강성기 발전소", "ㄳㄱ"), true);
  assert.equal(matchesSearchText("강성기 발전소", "ㄱ ㅅ ㄱ"), true);
  assert.equal(matchesSearchText("강성기 발전소", "ㄱㅅㅈ"), false);
});

test("matchesSearchText keeps direct and compact matching", () => {
  assert.equal(matchesSearchText("5001046208", "5001046208"), true);
  assert.equal(matchesSearchText("123-45-67890", "1234567890"), true);
  assert.equal(matchesSearchText("전자세금 공동인증서", "공동인증서"), true);
});

test("matchesAnySearchText checks all candidate values", () => {
  assert.equal(matchesAnySearchText("ㅇㅇㅁ", ["강성기", "이은미태양광"]), true);
  assert.equal(matchesAnySearchText("ㅊㅈㅇ", ["강성기", "이은미태양광"]), false);
});
