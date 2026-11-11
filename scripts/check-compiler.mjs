import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

const server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
try {
  await Promise.race([
    once(server.stdout, 'data'),
    once(server, 'exit').then(([code]) => { throw new Error('Servidor local encerrou com código ' + code); })
  ]);
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4179/');
  await page.getByRole('button', { name: /Compilar PDF/ }).click();
  await page.waitForFunction(() => {
    const status = document.getElementById('preview-status').textContent;
    return /PDF compilado|consulte o log/.test(status);
  }, undefined, { timeout: 180_000 });

  const status = await page.locator('#preview-status').textContent();
  if (status !== 'PDF compilado no navegador') {
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    throw new Error(await page.locator('#log-output').textContent());
  }

  const signature = await page.locator('#pdf').evaluate(async frame => {
    const pdf = await fetch(frame.src);
    return (await pdf.text()).slice(0, 5);
  });
  assert.equal(signature, '%PDF-');
  console.log('O exemplo em português compilou para um PDF no navegador.');
} finally {
  await browser?.close();
  server.kill();
}
