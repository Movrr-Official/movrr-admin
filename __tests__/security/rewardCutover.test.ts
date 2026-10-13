import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const forbidden = new Set(['award_points_for_my_ride_session', 'award_movrr_points_for_ride_session', 'award_movrr_points_for_route_tracking', 'award_ride_session_bonus', 'award_reward_points_capped']);
function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(file);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [file] : [];
  });
}
it('Admin ingest preserves evidence without a parallel legacy reward writer', () => {
  const root = process.cwd();
  const violations: string[] = [];
  for (const file of ['app', 'lib', 'features'].flatMap(dir => sourceFiles(path.join(root, dir)))) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'rpc') {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument) && forbidden.has(argument.text)) violations.push(path.relative(root, file) + ':' + argument.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(violations).toEqual([]);
});
