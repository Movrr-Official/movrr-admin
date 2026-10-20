// Execute the existing canonical Shop regression unchanged except its diagnostic destination.
// The Mobile application and its test sources remain byte-for-byte unchanged.
const Module = require("node:module"),
  path = require("node:path"),
  fs = require("node:fs");
const file = path.resolve(
  __dirname,
  "../../movrr-mobile/scripts/test-shop-lifecycle.cjs",
);
const source = fs
  .readFileSync(file, "utf8")
  .replace(
    "const output='.tmp/shop-post-verification-20261019'",
    `const output=${JSON.stringify(path.resolve(__dirname, "../.tmp/enterprise-alignment/shop-preservation"))}`,
  );
process.env.SHOP_OPERATING_BASELINE = "1";
const run = new Module(file, module);
run.filename = file;
run.paths = Module._nodeModulePaths(path.dirname(file));
run._compile(source, file);
