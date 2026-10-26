import { afterEach, expect, it, vi } from "vitest";
import { createCourseId } from "../../src/utils/id";

afterEach(() => vi.unstubAllGlobals());

it("uses native randomUUID when available", () => {
  const randomUUID = vi.fn(() => "native-id");
  vi.stubGlobal("crypto", { randomUUID });
  expect(createCourseId()).toBe("native-id");
  expect(randomUUID).toHaveBeenCalledOnce();
});

it("creates distinct v4 IDs when randomUUID is unavailable", () => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(
    globalThis.crypto,
  );
  vi.stubGlobal("crypto", { getRandomValues });
  const ids = Array.from({ length: 100 }, createCourseId);
  for (const id of ids) {
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  }
  expect(new Set(ids).size).toBe(ids.length);
});
