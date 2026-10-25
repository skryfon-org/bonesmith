import { describe, expect, it } from "vitest";
import { BonesmithError } from "../../src/errors.ts";
import { anchorLine, insertAtAnchor, stripAnchors, substitute } from "../../src/merge.ts";
import { catchError } from "../helpers/fixtures.ts";

const ctx = (anchor: string) => ({ file: "src/main.tsx", anchor, from: "ui/u" });

describe("anchors", () => {
  it.each(["// bonesmith:x", "# bonesmith:x", "/* bonesmith:x */", "{/* bonesmith:x */}", "<!-- bonesmith:x -->", "  // bonesmith:x"])(
    "recognises %s",
    (line) => {
      expect(anchorLine("x").test(line)).toBe(true);
    },
  );

  it("does not match a longer anchor name or inline text", () => {
    expect(anchorLine("app").test("// bonesmith:app-imports")).toBe(false);
    expect(anchorLine("x").test("const a = 1; // bonesmith:x")).toBe(false);
  });

  it("inserts before (stacking in order) and after (stacking in reverse), with indent", () => {
    let text = "<>\n  {/* bonesmith:open */}\n  <App />\n  {/* bonesmith:close */}\n</>";
    text = insertAtAnchor(text, "before", "<A>", ctx("open"));
    text = insertAtAnchor(text, "before", "<B>\n\n<C>\n", ctx("open"));
    text = insertAtAnchor(text, "after", "</A>", ctx("close"));
    text = insertAtAnchor(text, "after", "</B>", ctx("close"));
    expect(stripAnchors(text)).toBe("<>\n  <A>\n  <B>\n\n  <C>\n  <App />\n  </B>\n  </A>\n</>");
  });

  it("fails on a missing anchor, naming anchor, file and layer", () => {
    const err = catchError(() => insertAtAnchor("nothing", "before", "x", ctx("imports"))) as BonesmithError;
    expect(err.code).toBe("ANCHOR_MISSING");
    expect(err.message).toBe("No anchor `bonesmith:imports` in `src/main.tsx` (patched by `ui/u`).");
  });

  it("fails on a duplicate anchor", () => {
    const err = catchError(() => insertAtAnchor("// bonesmith:imports\n// bonesmith:imports", "before", "x", ctx("imports"))) as BonesmithError;
    expect(err.code).toBe("ANCHOR_DUPLICATE");
    expect(err.message).toContain("appears 2 times (lines 1, 2)");
  });

  it("strips every anchor line and nothing else", () => {
    expect(stripAnchors("a\n// bonesmith:one\nb\n  <!-- bonesmith:two -->\nc")).toBe("a\nb\nc");
  });
});

describe("placeholders", () => {
  const vars = { name: "demo", pm: "pnpm", pmRun: "pnpm", pmExec: "pnpm exec" };

  it("substitutes known placeholders", () => {
    expect(substitute("{{name}}: {{pmRun}} dev, {{pmExec}} x, {{pm}}", vars, "f")).toBe("demo: pnpm dev, pnpm exec x, pnpm");
  });

  it("leaves JSX object literals with spaces alone", () => {
    expect(substitute("style={{ color: 'red' }}", vars, "f")).toBe("style={{ color: 'red' }}");
  });

  it("rejects unknown placeholders, naming the file", () => {
    const err = catchError(() => substitute("{{version}}", vars, "README.md")) as BonesmithError;
    expect(err.code).toBe("UNKNOWN_PLACEHOLDER");
    expect(err.message).toContain("`{{version}}` in `README.md`");
    expect((catchError(() => substitute("{{toString}}", vars, "f")) as BonesmithError).code).toBe("UNKNOWN_PLACEHOLDER");
  });
});
