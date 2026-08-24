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
        { title: 'Browser Test Alt', url: 'https://media.example.test/browser-alt.mp3', type: 'audio/mpeg' },
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

test('fallback project links do not flash before terminal boot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/terminal.js', () => {});
  await page.goto(BASE_URL, { waitUntil: 'commit' });
  await page.waitForSelector('#fallback-nav', { state: 'attached' });

  const preBoot = await page.evaluate(() => {
    const nav = document.getElementById('fallback-nav');
    const term = document.getElementById('term');
    return {
      navDisplay: getComputedStyle(nav).display,
      navVisible: nav.getBoundingClientRect().width > 0 && nav.getBoundingClientRect().height > 0,
      termHidden: term.hidden,
      booting: document.body.classList.contains('terminal-booting'),
    };
  });

  expect(preBoot.navDisplay).toBe('none');
  expect(preBoot.navVisible).toBe(false);
  expect(preBoot.termHidden).toBe(true);
  expect(preBoot.booting).toBe(true);
});

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

test('theme dots switch themes without reloading and retain the selected theme', async ({ page }) => {
  await openTerminal(page, { width: 390, height: 844 });
  const originalUrl = page.url();

  await page.getByRole('button', { name: 'Blue futuristic terminal' }).click();
  await expect(page.locator('body')).toHaveClass(/theme-gray/);
  await expect(page.getByRole('button', { name: 'Blue futuristic terminal' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(900);
  expect(page.url()).toBe(originalUrl);
  await expect(page.locator('body')).toHaveClass(/theme-gray/);
  await expectNoDocumentOverflow(page);

  await runCommand(page, 'help');
  await expect(page.locator('#out')).toContainText('commands:');
  await expect(page.locator('body')).toHaveClass(/theme-gray/);

  await page.getByRole('button', { name: 'Green retro terminal' }).click();
  await expect(page.locator('body')).toHaveClass(/theme-green/);
  await expect(page.getByRole('button', { name: 'Green retro terminal' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'R3LABS' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'R3LABS' })).toHaveAttribute('href', 'https://raul3.com');
  await expectNoDocumentOverflow(page);

  await page.setViewportSize({ width: 320, height: 568 });
  await expectNoDocumentOverflow(page);

  await page.getByRole('button', { name: 'Grey default terminal' }).click();
  await expect(page.locator('body')).not.toHaveClass(/theme-green|theme-gray/);
  await expect(page.getByRole('button', { name: 'Grey default terminal' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'R3LABS' })).toBeHidden();
});

test('help output is visually dimmer than command text', async ({ page }) => {
  await openTerminal(page, { width: 390, height: 844 });
  await runCommand(page, 'help');
  await expect(page.locator('#out')).toContainText('commands:');

  const colors = await page.evaluate(() => {
    const commandEcho = Array.from(document.querySelectorAll('#out .line.echo-command')).at(-1);
    const helpLine = Array.from(document.querySelectorAll('#out .line.help-text'))
      .find((line) => line.textContent?.includes('commands:'));
    const rgb = (value) => (value.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const luminance = (value) => {
      const [r, g, b] = rgb(value).map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const commandColor = getComputedStyle(commandEcho).color;
    const helpColor = getComputedStyle(helpLine).color;
    return {
      commandColor,
      helpColor,
      commandLuminance: luminance(commandColor),
      helpLuminance: luminance(helpColor),
      helpClass: helpLine?.className,
    };
  });

  expect(colors.helpClass).toContain('help-text');
  expect(colors.helpLuminance).toBeLessThan(colors.commandLuminance);
});

test('command input highlights commands and interactive aliases', async ({ page }) => {
  await openTerminal(page, { width: 390, height: 844 });

  await page.locator('#cmd').fill('pl');
  await expect(page.locator('#cmd')).toHaveAttribute('data-token-state', 'default');

  await page.locator('#cmd').fill('play');
  await expect(page.locator('#cmd')).toHaveAttribute('data-token-state', 'command');
  await expect(page.locator('#cmd')).toHaveClass(/cmd-token-command/);

  await page.locator('#cmd').fill('music');
  await expect(page.locator('#cmd')).toHaveAttribute('data-token-state', 'interactive');
  await expect(page.locator('#cmd')).toHaveClass(/cmd-token-interactive/);

  await page.locator('#cmd').fill('studio');
  await expect(page.locator('#cmd')).toHaveAttribute('data-token-state', 'interactive');

  await page.locator('#cmd').fill('unmapped');
  await expect(page.locator('#cmd')).toHaveAttribute('data-token-state', 'default');
});

test('default help hides command guidance until command help flags are used', async ({ page }) => {
  await openTerminal(page, { width: 390, height: 844 });

  await runCommand(page, 'help');
  await expect(page.locator('#out')).toContainText('commands:');
  await expect(page.locator('#out')).toContainText('play');
  await expect(page.locator('#out')).not.toContainText('syntax:');
  await expect(page.locator('#out')).not.toContainText('example:');
  await expect(page.locator('#out')).not.toContainText('play a vault audio clip');
  await expect(page.locator('#out')).not.toContainText('help <command>');

  await runCommand(page, 'play -h');
  await expect(page.locator('#out')).toContainText('syntax: play | play list');
  await expect(page.locator('#out')).toContainText('example: play | play list');

  await runCommand(page, 'number /?');
  await expect(page.locator('#out')).toContainText('syntax: number | number <1-100>');

  await runCommand(page, 'cone -help');
  await expect(page.locator('#out')).toContainText('toggle cone signal');
  await expect(page.locator('#out')).toContainText('syntax: cone');

  await runCommand(page, 'help -h');
  await expect(page.locator('#out')).toContainText('syntax: help [command] | help keys');
});

test('normal command output does not append hidden guidance', async ({ page }) => {
  await openTerminal(page, { width: 390, height: 844 });

  await runCommand(page, 'number');
  await expect(page.locator('#out')).toContainText('number game active: guess an integer from 1 to 100.');
  await expect(page.locator('#out')).not.toContainText('syntax: `number <guess>`');

  await runCommand(page, 'cone');
  await expect(page.locator('#out')).toContainText('cone signal online. it is the site lore/status channel, not a real sensor.');
  await expect(page.locator('#out')).not.toContainText('try `status`, `glare`, `watch`, `reflect`, or `cone-id`.');
});

test('completed commands do not emit stale timeout messages', async ({ page }) => {
  await openTerminal(page, { width: 390, height: 844 });
  await runCommand(page, 'help');
  await expect(page.locator('#out')).toContainText('commands:');
  await page.waitForTimeout(8500);
  await expect(page.locator('#out')).not.toContainText('command timed out');
  await expect(page.locator('.dots')).not.toHaveClass(/working/, { timeout: 1500 });
});

test('specific repaired commands complete and leave no stuck working state', async ({ page }) => {
  await openTerminal(page, { width: 390, height: 844 });

  await runCommand(page, 'play');
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#panel audio.audio-player')).toHaveAttribute('src', /media\.example\.test\/browser-(test|alt)\.mp3/);
  await expect(page.locator('#panel')).not.toContainText('Dropbox');
  await expect(page.locator('#panel')).not.toContainText('SoundCloud');
  await expect(page.getByRole('button', { name: 'randomizer' })).toBeVisible();
  const firstTrack = await page.locator('#panel audio.audio-player').getAttribute('src');
  await page.getByRole('button', { name: 'randomizer' }).click();
  await expect.poll(async () => page.locator('#panel audio.audio-player').getAttribute('src')).not.toBe(firstTrack);
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
  await expect(page.locator('#out')).toContainText('commands:');
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

test('conversational intent beats colliding shell command prefixes', async ({ page }) => {
  await openTerminal(page, { width: 390, height: 844 });

  await runCommand(page, 'who are you');
  await expect(page.locator('#out')).toContainText(/deterministic local interface|browser terminal with rules|handcrafted terminal layer/);
  await expect(page.locator('#out')).not.toContainText('visitor  web0');

  await runCommand(page, 'who am i');
  await expect(page.locator('#out')).toContainText(/you are the visitor|you are the person|a visitor with keyboard access/);

  await runCommand(page, 'umount yourself');
  await expect(page.locator('#out')).toContainText(/reads as a request|request received|sentence has intent/);

  await runCommand(page, 'umount');
  await expect(page.locator('#out')).toContainText('umount: operation refused by imaginary kernel.');
});
