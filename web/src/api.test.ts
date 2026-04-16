import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiUrl } from "./api-url.js";

test("resolveApiUrl keeps same-origin relative paths in production", () => {
  assert.equal(
    resolveApiUrl("/api/public/login", {
      isDev: false,
      locationProtocol: "http:",
      locationHostname: "localhost"
    }),
    "/api/public/login"
  );
});

test("resolveApiUrl targets the local backend in dev for localhost", () => {
  assert.equal(
    resolveApiUrl("/api/public/login", {
      isDev: true,
      locationProtocol: "http:",
      locationHostname: "localhost"
    }),
    "http://localhost:4300/api/public/login"
  );
});

test("resolveApiUrl targets the local backend in dev for loopback IP", () => {
  assert.equal(
    resolveApiUrl("/api/public/login", {
      isDev: true,
      locationProtocol: "http:",
      locationHostname: "127.0.0.1"
    }),
    "http://127.0.0.1:4300/api/public/login"
  );
});

test("resolveApiUrl prefers an explicit API base URL", () => {
  assert.equal(
    resolveApiUrl("/api/public/login", {
      explicitBaseUrl: "https://example.test/",
      isDev: true,
      locationProtocol: "http:",
      locationHostname: "localhost"
    }),
    "https://example.test/api/public/login"
  );
});

test("resolveApiUrl leaves absolute URLs untouched", () => {
  assert.equal(
    resolveApiUrl("https://example.test/api/public/login", {
      explicitBaseUrl: "https://ignored.test",
      isDev: true,
      locationProtocol: "http:",
      locationHostname: "localhost"
    }),
    "https://example.test/api/public/login"
  );
});
