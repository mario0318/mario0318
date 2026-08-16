import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

const PORT = 31818;
const BASE_URL = `http://127.0.0.1:${PORT}`;
let server;

test.use({
  browserName: 'chromium',
  channel: 'msedge',
});

test.beforeAll(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server did not start')), 10000);
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes(`listening on ${PORT}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.once('error', reject);
    server.once('exit', (code) => {
      if (code != null) reject(new Error(`server exited early with ${code}`));
    });
  });
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise((resolve) => {
    server.once('exit', resolve);
    server.kill();
    setTimeout(resolve, 1000);
  });
});

async function openTerminal(page, viewport) {
  await page.setViewportSize(viewport);
  await page.route('https://firestore.googleapis.com/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/tracks.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { title: 'Browser Test Clip', url: 'https://media.example.test/browser-test.mp3', type: 'audio/mpeg' },
      ]),
    }),
  );
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#term')).toBeVisible();
  await expect(page.locator('#cmd')).toBeFocused();
}

async function runCommand(page, text) {
  await page.locator('#cmd').fill(text);
  await page.locator('#cmd').press('Enter');
}

async function expectNoDocumentOverflow(page) {
  const metrics = await page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    const body = document.body;
    const term = document.getElementById('term');
    return {
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      rootClientHeight: root.clientHeight,
      rootScrollHeight: root.scrollHeight,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyOverflowX: getComputedStyle(body).overflowX,
      bodyOverflowY: getComputedStyle(body).overflowY,
      rootOverflowX: getComputedStyle(document.documentElement).overflowX,
      rootOverflowY: getComputedStyle(document.documentElement).overflowY,
      termBottom: term?.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.rootScrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.rootClientWidth + 1);
  expect(metrics.bodyScrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.bodyClientWidth + 1);
  expect(metrics.rootScrollHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.rootClientHeight + 1);
  expect(metrics.bodyScrollHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.bodyClientHeight + 1);
  expect(metrics.rootOverflowY).toBe('hidden');
  expect(metrics.bodyOverflowY).toBe('hidden');
  expect(metrics.termBottom, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewportHeight + 1);
}

test('document has no page-level overflow across representative viewports', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 640 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await openTerminal(page, viewport);
    await expectNoDocumentOverflow(page);
  }
});

test('long terminal output scrolls only inside the terminal output area', async ({ page }) => {
  await openTerminal(page, { width: 320, height: 568 });
  await runCommand(page, 'help');

  await expect.poll(async () => page.locator('#out .line').count()).toBeGreaterThan(40);

  const metrics = await page.evaluate(() => {
    const out = document.getElementById('out');
    const beforeWindowY = window.scrollY;
    out.scrollTop = out.scrollHeight;
    return {
      outScrollHeight: out.scrollHeight,
      outClientHeight: out.clientHeight,
      outScrollWidth: out.scrollWidth,
      outClientWidth: out.clientWidth,
      outScrollTop: out.scrollTop,
      outOverflowY: getComputedStyle(out).overflowY,
      outScrollbarWidth: getComputedStyle(out).scrollbarWidth,
      windowY: window.scrollY,
      beforeWindowY,
    };
  });

  expect(metrics.outScrollHeight).toBeGreaterThan(metrics.outClientHeight);
  expect(metrics.outScrollWidth).toBeLessThanOrEqual(metrics.outClientWidth + 1);
  expect(metrics.outScrollTop).toBeGreaterThan(0);
  expect(metrics.outOverflowY).toBe('auto');
  expect(metrics.outScrollbarWidth).not.toBe('none');
  expect(metrics.windowY).toBe(metrics.beforeWindowY);
  await expectNoDocumentOverflow(page);
});

test('specific repaired commands complete and leave no stuck working state', async ({ page }) => {
  await openTerminal(page, { width: 390, height: 844 });

  await runCommand(page, 'play');
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#panel audio.audio-player')).toHaveAttribute('src', /media\.example\.test\/browser-test\.mp3/);
  await expect(page.locator('.dots')).not.toHaveClass(/working/, { timeout: 1500 });
  await runCommand(page, 'close');
  await expect(page.locator('#panel')).toBeHidden();

  await runCommand(page, 'number');
  await expect(page.locator('#out')).toContainText('1 to 100');
  await runCommand(page, 'number 37');
  await expect(page.locator('#out')).toContainText(/higher|lower|correct/);
  await expect(page.locator('.dots')).not.toHaveClass(/working/, { timeout: 1500 });

  await runCommand(page, 'cone');
  await expect(page.locator('#out')).toContainText(/lore\/status channel|lore channel/);
  await expect(page.locator('.dots')).not.toHaveClass(/working/, { timeout: 1500 });

  await runCommand(page, 'help');
  await expect(page.locator('#out')).toContainText('guest command index:');
  await expect(page.locator('#out')).not.toContainText("there's more");
  await expect(page.locator('.dots')).not.toHaveClass(/working/, { timeout: 1500 });

  await runCommand(page, 'analemma');
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#panel iframe[title="Analemma Studio"]')).toHaveAttribute('src', 'https://raul3.com/analemma/');
  await expect(page.locator('.dots')).not.toHaveClass(/working/, { timeout: 1500 });

  await expectNoDocumentOverflow(page);
});

test('unsupported guest input gets varied bounded smart responses', async ({ page }) => {
  await openTerminal(page, { width: 1024, height: 640 });
  for (const input of ['unmapped alpha', 'unmapped beta', 'unmapped gamma', 'unmapped delta']) {
    await runCommand(page, input);
  }

  const assistantLines = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#out .line:not(.echo)'))
      .map((line) => line.textContent)
      .filter((text) => [
        'input accepted. meaning undecided.',
        'the parser filed that under "misc".',
        'you can be more precise if you care about the result.',
        'nothing in here reacts well to vague intent.',
      ].includes(text)),
  );

  expect(assistantLines.length).toBe(4);
  expect(new Set(assistantLines).size).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.dots')).not.toHaveClass(/working/, { timeout: 1500 });
});
