import { expect, test } from "bun:test";
import { HTTP_SESSION_VERSION } from "../../src/index";

test("loads the ESM entry point in Bun", () => {
  expect(HTTP_SESSION_VERSION).toBe("0.1.0");
});
