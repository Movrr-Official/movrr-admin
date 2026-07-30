import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { highlightMatch } from "@/lib/search/highlight";

describe("highlightMatch", () => {
  it("returns plain text when query is empty", () => {
    expect(highlightMatch("Ada Lovelace", "")).toBe("Ada Lovelace");
  });

  it("wraps case-insensitive matches in mark elements", () => {
    const nodes = highlightMatch("Ada Lovelace", "ada") as ReactNode[];
    expect(Array.isArray(nodes)).toBe(true);
    const marks = nodes.filter(
      (node) => isValidElement(node) && node.type === "mark",
    ) as ReactElement<{ children?: ReactNode }>[];
    expect(marks).toHaveLength(1);
    expect(marks[0]?.props.children).toBe("Ada");
  });
});
