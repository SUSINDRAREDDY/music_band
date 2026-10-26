import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory()
          ? sourceFiles(target)
          : target.endsWith('.mjs')
            ? [target]
            : [];
      }),
    )
  ).flat();
}
const files = [
  path.join(root, 'server.mjs'),
  ...(
    await Promise.all(
      ['src', 'public', 'tests', 'scripts'].map((name) =>
        sourceFiles(path.join(root, name)),
      ),
    )
  ).flat(),
];
for (const file of files) {
  const syntax = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  });
  if (syntax.status !== 0)
    throw Error(syntax.stderr || `Invalid syntax: ${file}`);
  const text = await readFile(file, 'utf8');
  const imports = text.matchAll(
    /(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g,
  );
  for (const [, specifier] of imports) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue;
    const target = specifier.startsWith('/')
      ? path.join(root, 'public', specifier)
      : path.resolve(path.dirname(file), specifier);
    await access(target).catch(() => {
      throw Error(
        `Missing import ${specifier} in ${path.relative(root, file)}`,
      );
    });
  }
}
console.log(
  `Checked syntax and local imports in ${files.length} JavaScript files.`,
);
