import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicFiles = [
  'index.html', 'styles.css', 'account.css',
  'ui.js', 'icons.js', 'store.js', 'cloud.js', 'account.js', 'demo.js', 'config.js',
  'register.js', 'manifest.webmanifest',
  'assets/japon.webp', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable.png',
];

export function compileWorker(template, files) {
  const assets = files.map(({ path, content }) => ({
    path,
    integrity: 'sha256-' + createHash('sha256').update(content).digest('base64'),
  }));
  const revision = createHash('sha256').update(template).update(JSON.stringify(assets)).digest('hex');
  return template.replace('/* PRECACHE */ null', JSON.stringify({ revision, assets }));
}

export async function build(root) {
  const output = join(root, 'dist');
  const template = await readFile(join(root, 'sw.js'), 'utf8');
  const files = await Promise.all(publicFiles.map(async path => ({
    path,
    content: await readFile(join(root, path)),
  })));

  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, 'assets'), { recursive: true });
  for (const { path, content } of files) {
    await writeFile(join(output, path), content);
  }
  await writeFile(join(output, 'sw.js'), compileWorker(template, files));
  // GitHub Pages should serve the compiled directory as plain static files.
  await writeFile(join(output, '.nojekyll'), '');
}

const script = fileURLToPath(import.meta.url);
if (process.argv[1] === script) await build(dirname(script));
