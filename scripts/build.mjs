import { copyFile, cp, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('site-build/', root);
const texlyre = new URL('vendor/texlyre/', output);
const busytex = new URL('vendor/busytex/', output);

await mkdir(texlyre, { recursive: true });
await mkdir(busytex, { recursive: true });
await Promise.all([
  ...['index.html', 'style.css', 'app.js', 'compiler.js'].map(path =>
    copyFile(new URL(path, root), new URL(path, output))),
  copyFile(new URL('node_modules/texlyre-busytex/dist/index.js', root), new URL('index.js', texlyre)),
  copyFile(new URL('node_modules/texlyre-busytex/LICENSE', root), new URL('LICENSE.txt', texlyre)),
  copyFile(new URL('node_modules/texlyre-busytex/README.md', root), new URL('README.md', texlyre)),
  cp(new URL('.tex-assets/busytex/', root), busytex, { recursive: true })
]);
console.log('Site pronto em site-build/.');
