// @vitest-environment jsdom
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { transpile, ScriptTarget, ModuleKind } from "typescript";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { cloudinaryPreviewUrl } from "@/lib/cloudinaryPreview";
it("strips every adjacent dangerous attribution attribute using installed MapLibre code", () => {
  const source=readFileSync("node_modules/maplibre-gl/src/util/dom.ts","utf8").replace(/^import Point.*$/m, "");
  const exports: Record<string, unknown>={};
  new Function("exports", transpile(source,{target:ScriptTarget.ES2022,module:ModuleKind.CommonJS}))(exports);
  const DOM=exports.DOM as {sanitize:(html:string)=>string};
  const holder=document.createElement("div");holder.innerHTML=DOM.sanitize('<details open onload="bad()" ontoggle="bad()"><a onclick="bad()" onmouseover="bad()" href="javascript:bad()">Attribution</a></details>');
  expect([...holder.querySelectorAll("*")].flatMap(element=>[...element.attributes]).filter(attribute=>attribute.name.startsWith("on")||attribute.value.includes("javascript:"))).toHaveLength(0);
  expect(holder.textContent).toBe("Attribution");
});
it("rejects oversized constrained collections before parsing their elements", () => {
  let visits=0;const result=z.array(z.string().superRefine(()=>{visits++;})).max(1).safeParse(Array(100).fill("isolated"));
  expect(result.success).toBe(false);expect(visits).toBe(0);
});
it("retains resolver coercion/defaults and arbitrary metadata records", async () => {
  const schema=z.object({points:z.coerce.number().int().min(0),enabled:z.boolean().default(true),metadata:z.record(z.string(),z.unknown())});
  const result=await zodResolver(schema)({points:"12",metadata:{source:"test"}},undefined,{fields:{},shouldUseNativeValidation:false});
  expect(result.values).toEqual({points:12,enabled:true,metadata:{source:"test"}});expect(result.errors).toEqual({});
});
it("preserves persisted asset URLs and supported Cloudinary public-id preview transformations", () => {
  const stored="https://res.cloudinary.com/test/image/upload/v123/folder/asset.jpg";
  expect(cloudinaryPreviewUrl(stored,"test")).toBe(stored);
  const url=cloudinaryPreviewUrl("folder/asset","test");expect(url).toContain("https://res.cloudinary.com/test/image/upload/");expect(url).toContain("c_limit,w_150");expect(url).toContain("f_auto");expect(url).toContain("q_auto");expect(url).toContain("folder/asset");
});
