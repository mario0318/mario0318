const $ = id => document.getElementById(id);
const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : 'date unavailable';
let posts = [], filter = 'all', cursor = null;
async function api(path) { const response = await fetch('/api/sungolog/' + path); if (!response.ok) throw new Error('The record could not be loaded. Try again in a moment.'); return response.json(); }
function safeLink(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }
function mediaElement(media) {
  const url = media.url || (media.hash ? '/api/sungolog/media/' + media.hash : null);
  if (!url || !url.startsWith('/api/sungolog/media/')) return null;
  const node = make((media.type || '').startsWith('video/') ? 'video' : (media.type || '').startsWith('audio/') ? 'audio' : 'img', 'reader-media');
  node.src = url; node.setAttribute('alt', media.alt || ''); node.loading = 'lazy'; if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') { node.controls = true; node.preload = 'metadata'; }
  return node;
}
function render() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const visible = posts.filter(post => (filter === 'all' || post.kind === filter) && (post.title + ' ' + post.text + ' ' + (post.source?.platform || '')).toLocaleLowerCase().includes(query));
  $('count').textContent = `${posts.length} ${posts.length === 1 ? 'entry' : 'entries'} loaded`;
  $('entries').replaceChildren();
  if (!visible.length) {
    const empty = make('div','empty'); empty.append(make('span','symbol','✳'), make('h3','',posts.length ? 'no thoughts match that search.' : 'a new chapter. a clean page.'),make('p','',posts.length ? 'Try another word or a different view.' : 'sungolog is back. Original entries and selected social posts will appear here when published.'));
    $('entries').append(empty); return;
  }
  for (const post of visible) {
    const row = make('article','entry'); const meta = make('div','entry-meta');
    const time = make('time','',date(post.publishedAt || post.createdAt || post.capturedAt)); time.dateTime = post.publishedAt || post.createdAt || post.capturedAt || '';
    meta.append(time,make('span','entry-kind',post.kind === 'archive' ? (post.source?.platform || 'social archive') : 'from here'));
    if (post.revisionCount > 1) meta.append(make('span','badge',`${post.revisionCount} captured versions`));
    const content = make('div','entry-content'), heading = make('h3'), link = make('a','',post.title || (post.text || '').slice(0,100) || 'an image, a moment.');
    link.href = '?post=' + encodeURIComponent(post.id); link.onclick = event => { event.preventDefault(); openPost(post.id); }; heading.append(link);
    content.append(heading,make('p','',(post.text || '').slice(0,320) + ((post.text || '').length > 320 ? '…' : '')));
    const open = make('a','open-entry',post.kind === 'archive' ? 'open the record ↗' : 'keep reading ↗'); open.href = link.href; open.onclick = link.onclick; content.append(open);
    row.append(meta,content);
    const image = (post.media || []).find(item => (item.type || '').startsWith('image/'));
    if (image) { const thumb = mediaElement(image); if (thumb) { thumb.className = 'entry-thumb'; row.append(thumb); } }
    $('entries').append(row);
  }
}
async function openPost(id, push = true) {
  try {
    const data = await api('posts/' + encodeURIComponent(id)); const post = data.post || data;
    const body = $('reader-body'); body.replaceChildren();
    body.append(make('div','entry-meta',`${post.kind === 'archive' ? post.source?.platform || 'social archive' : 'from here'} · ${date(post.publishedAt || post.createdAt || post.capturedAt)}`));
    const title = make('h2','reader-title',post.title || 'an entry in the record.'); title.id = 'reader-title'; body.append(title,make('div','reader-text',post.text || ''));
    for (const media of post.media || []) { const node = mediaElement(media); if (node) body.append(node); if (media.status && media.status !== 'copied' && media.status !== 'stored') body.append(make('p','reader-note','Media capture status: ' + media.status)); }
    if (post.kind === 'archive') {
      if (post.provenance === 'owner-import') body.append(make('p','reader-note','Owner-imported record. This wording has not been independently checked against the platform API.'));
      if (post.sourceAvailability === 'unavailable') body.append(make('p','reader-note','The source was unavailable at its latest check. That does not establish that the post was deleted.'));
      body.append(make('p','reader-note',`First captured ${date(post.capturedAt)}. This preserves what was observed, including source edits detected after capture. Earlier unseen versions cannot be reconstructed.`));
      const url = safeLink(post.source?.url); if (url) { const source = make('a','reader-note','view on ' + (post.source.platform || 'the source') + ' ↗'); source.href = url; source.target = '_blank'; source.rel = 'noopener noreferrer'; body.append(source); }
    }
    if ((post.revisions || []).length > 1) {
      const history = make('details','revisions'); history.append(make('summary','',`${post.revisions.length} preserved versions`));
      for (const revision of post.revisions) { const item = make('div','revision'); item.append(make('p','entry-meta','captured ' + (revision.capturedAt || revision.savedAt || 'date unavailable') + (revision.provenance === 'media-recovery' ? ' · media recovered' : revision.provenance === 'owner-import' ? ' · owner import' : '')), make('div','reader-text',revision.text || revision.content?.text || '')); for (const media of revision.media || []) { const node = mediaElement(media); if (node) item.append(node); } history.append(item); }
      body.append(history);
    }
    if (!$('reader').open) $('reader').showModal();
    if (push) history.pushState({post:id},'', '?post=' + encodeURIComponent(id));
  } catch (error) { $('status').textContent = error.message; }
}
async function load() {
  try { const data = await api('posts' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')); posts.push(...(data.posts || [])); cursor = data.nextCursor || null; $('more').hidden = !cursor; $('status').textContent = ''; render(); }
  catch (error) { $('status').textContent = error.message; }
}
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed',String(item === button))); render(); });
$('search').oninput = render; $('more').onclick = load;
document.querySelector('.dialog-close').onclick = () => $('reader').close();
$('reader').addEventListener('close', () => { if (new URLSearchParams(location.search).has('post')) history.pushState({},'',location.pathname); });
window.onpopstate = () => { const id = new URLSearchParams(location.search).get('post'); if (id) openPost(id,false); else if ($('reader').open) $('reader').close(); };
await load(); const id = new URLSearchParams(location.search).get('post'); if (id) await openPost(id,false);
