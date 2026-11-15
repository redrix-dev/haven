import { describe, expect, it } from "vitest";
import { dropIds, dropWhere, putRows, putRowsBy } from "../rows";

type Row = { id: string; text: string };
const a: Row = { id: "a", text: "first" };
const b: Row = { id: "b", text: "second" };

describe("rows by id", () => {
  it("writes rows over what is there and keeps the rest as they were", () => {
    const before = { a, b };
    const newer = { id: "b", text: "edited" };
    const after = putRows(before, [newer, { id: "c", text: "new" }]);

    expect(after).toEqual({ a, b: newer, c: { id: "c", text: "new" } });
    expect(after.a).toBe(a);
    expect(before).toEqual({ a, b });
  });

  it("files rows under the key it is told to", () => {
    const member = { user_id: "u1", nickname: null };
    expect(putRowsBy({}, [member], (row) => row.user_id)).toEqual({
      u1: member,
    });
  });

  it("removes rows by id and by test", () => {
    const before = { a, b };
    expect(dropIds(before, ["a", "missing"])).toEqual({ b });
    expect(dropWhere(before, (row) => row.text === "second")).toEqual({ a });
    expect(before).toEqual({ a, b });
  });

  it("hands back the same object when nothing changes", () => {
    const before = { a, b };
    expect(putRows(before, [])).toBe(before);
    expect(dropIds(before, ["missing"])).toBe(before);
    expect(dropWhere(before, () => false)).toBe(before);
  });
});
