import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test.use({ browserName: 'chromium', channel: 'msedge' });
const base = 'https://sungolog.test';
const fixture = { id:'test-entry',kind:'archive',title:'a thought worth keeping',text:'<script>window.injected=true</script>\nThe captured wording.',visibility:'public',publishedAt:'2026-10-20T12:00:00Z',capturedAt:'2026-10-22T12:00:00Z',source:{platform:'bluesky',url:'https://bsky.app/profile/example.test/post/123'},media:[],revisionCount:2,revisions:[{text:'earlier captured wording',capturedAt:'2026-10-21T12:00:00Z'},{text:'The captured wording.',capturedAt:'2026-10-22T12:00:00Z'}] };
async function setup(page, posts = []) {
  await page.route(base + '/**',async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/sungolog/posts') return route.fulfill({json:{posts,nextCursor:null}});
    if (url.pathname === '/api/sungolog/posts/test-entry') return route.fulfill({json:fixture});
    if (url.pathname.startsWith('/api/')) return route.fulfill({status:503,json:{error:'not configured'}});
    const relative = url.pathname === '/sungolog/' ? 'sungolog/index.html' : url.pathname.slice(1);
    const file = path.join(process.cwd(),'public',relative);
    try { const body = await fs.readFile(file); const ext = path.extname(file); return route.fulfill({body,contentType:ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'text/html'}); }
    catch { return route.fulfill({status:404,body:'not found'}); }
  });
}
test('empty publication works at desktop and phone widths',async ({page}) => {
  await setup(page);
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:900}); await page.goto(base + '/sungolog/');
    await expect(page.getByRole('heading',{name:'a new chapter. a clean page.'})).toBeVisible();
    await expect(page.locator('#status')).toHaveText('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({path:`output/playwright/sungolog-${width}.png`,fullPage:true});
  }
});
test('archive shows captured versions, text is inert, search and deep links work',async ({page}) => {
  await setup(page,[fixture]); await page.goto(base + '/sungolog/');
  await expect(page.locator('.entry')).toHaveCount(1); expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await page.getByRole('button',{name:'from here',exact:true}).click(); await expect(page.locator('.entry')).toHaveCount(0);
  await page.getByRole('button',{name:'from elsewhere',exact:true}).click(); await page.locator('#search').fill('not a match'); await expect(page.locator('.entry')).toHaveCount(0);
  await page.locator('#search').fill(''); await page.getByRole('link',{name:'a thought worth keeping'}).click();
  await expect(page.locator('#reader')).toBeVisible(); await expect(page.getByText('2 preserved versions')).toBeVisible();
  await page.locator('summary').click(); await expect(page.getByText('earlier captured wording')).toBeVisible();
  await page.getByRole('button',{name:'Close entry'}).click(); await expect(page.locator('#reader')).not.toBeVisible();
  await page.goto(base + '/sungolog/?post=test-entry'); await expect(page.locator('#reader')).toBeVisible();
});
test('desk fails closed when owner sign-in is not configured',async ({page}) => {
  await setup(page); await page.goto(base + '/sungolog/desk.html');
  await expect(page.locator('#workspace')).toBeHidden(); await expect(page.locator('#sign-in')).toBeDisabled();
  await expect(page.locator('#desk-status')).toContainText('configuration');
});
