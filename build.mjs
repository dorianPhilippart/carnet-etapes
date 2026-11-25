import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicFiles = [
  'index.html', 'styles.css', 'account.css',
  'ui.js', 'icons.js', 'store.js', 'cloud.js', 'account.js', 'demo.js', 'config.js',
  'legacy.js', 'register.js', 'sw.js', 'manifest.webmanifest',
  'assets/japon.webp', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable.png',
];

export async function build(root) {
  const output = join(root, 'dist');
  const files = await Promise.all(publicFiles.map(async path => ({
    path,
    content: await readFile(join(root, path)),
  })));

  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, 'assets'), { recursive: true });
  for (const { path, content } of files) {
    await writeFile(join(output, path), content);
  }
  // GitHub Pages should serve the compiled directory as plain static files.
  await writeFile(join(output, '.nojekyll'), '');
}

const script = fileURLToPath(import.meta.url);
if (process.argv[1] === script) await build(dirname(script));
