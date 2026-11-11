import { execFile } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const root = new URL('../', import.meta.url);
const output = new URL('site-build/', root);
const texlyre = new URL('vendor/texlyre/', output);
const busytex = new URL('vendor/busytex/', output);
const portuguese = new URL('vendor/babel-portuges/', output);
const run = promisify(execFile);

async function copyPortuguese() {
  const temporary = await mkdtemp(join(tmpdir(), 'atelie-tex-'));
  try {
    const source = 'https://ctan.math.illinois.edu/systems/texlive/tlnet/archive/babel-portuges.tar.xz';
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('Falha ao baixar babel-portuges (HTTP ' + response.status + ').');
    const archive = join(temporary, 'babel-portuges.tar.xz');
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
    await run('tar', ['-xf', archive, '-C', temporary]);
    await cp(join(temporary, 'tex', 'generic', 'babel-portuges'), portuguese, {
      recursive: true,
      dereference: true
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

await mkdir(texlyre, { recursive: true });
await mkdir(busytex, { recursive: true });
await Promise.all([
  ...['index.html', 'style.css', 'app.js', 'compiler.js'].map(path =>
    copyFile(new URL(path, root), new URL(path, output))),
  copyFile(new URL('node_modules/texlyre-busytex/dist/index.js', root), new URL('index.js', texlyre)),
  copyFile(new URL('node_modules/texlyre-busytex/LICENSE', root), new URL('LICENSE.txt', texlyre)),
  copyFile(new URL('node_modules/texlyre-busytex/README.md', root), new URL('README.md', texlyre)),
  cp(new URL('.tex-assets/busytex/', root), busytex, { recursive: true }),
  copyPortuguese()
]);
console.log('Site pronto em site-build/.');
