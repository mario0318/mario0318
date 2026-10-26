const $ = id => document.getElementById(id);
let auth, user, signOutFn, posts = [], objectUrls = [];
const status = text => { $('desk-status').textContent = text; };
async function request(path, options = {}) {
  if (!user) throw new Error('Sign in with the owner account first.');
  const response = await fetch('/api/sungolog/' + path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer ' + await user.getIdToken(),...options.headers}});
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The request failed. Nothing has been published.'); return data;
}
async function run(button, action) { button.disabled = true; try { await action(); } catch(error) { status(error.message); } finally { button.disabled = false; } }
function node(tag,text) { const element = document.createElement(tag); if (text) element.textContent = text; return element; }
function renderPosts() {
  const root = $('owner-entries'); root.replaceChildren();
  const term = $('owner-search').value.toLowerCase();
  for (const post of posts.filter(p => (p.title + ' ' + p.text).toLowerCase().includes(term))) {
    const item = node('div'); item.className = 'owner-item'; item.append(node('strong',post.title || (post.text || '').slice(0,80) || 'image entry'),node('p',`${post.visibility} · ${post.kind} · ${post.revisionCount || 1} version(s)`));
    const visibility = node('button',post.visibility === 'public' ? 'make private' : 'publish publicly');
    visibility.onclick = () => run(visibility,async () => { if (post.visibility !== 'public' && !confirm('Publish this entry and its captured revisions to everyone?')) return; await request('posts/' + post.id,{method:'PATCH',body:JSON.stringify({visibility:post.visibility === 'public' ? 'private' : 'public'})}); status('Visibility saved.'); await refresh(); }); item.append(visibility);
    if (post.kind === 'original') { const edit = node('button','revise entry'); edit.onclick = () => { $('entry-id').value = post.id; $('title').value = post.title || ''; $('text').value = post.text || ''; $('visibility').value = post.visibility; $('compose-heading').textContent = 'revise an entry'; $('compose').scrollIntoView({block:'start',behavior:'instant'}); status('Existing images stay attached unless you select replacements.'); }; item.append(edit); }
    const inspect = node('button','view saved record'); inspect.onclick = () => run(inspect,async () => {
      const data = await request('posts/' + post.id); const record = data.post || data;
      const old = item.querySelector('.saved-record'); if (old) { old.remove(); return; }
      const saved = node('div'); saved.className = 'saved-record'; saved.append(node('p',record.text || ''));
      for (const media of record.media || []) {
        if (media.status === 'not-copied') saved.append(node('p','Media was not copied: ' + (media.reason || 'the source did not provide a downloadable file.')));
        if (!(media.url || media.hash)) continue;
        const url = media.url || '/api/sungolog/media/' + media.hash;
        if (!url.startsWith('/api/sungolog/media/')) continue;
        const response = await fetch(url,{headers:{Authorization:'Bearer ' + await user.getIdToken()}});
        if (!response.ok) { saved.append(node('p','This media copy could not be loaded.')); continue; }
        const image = node((media.type || '').startsWith('video/') ? 'video' : (media.type || '').startsWith('audio/') ? 'audio' : 'img'); const blobUrl = URL.createObjectURL(await response.blob()); objectUrls.push(blobUrl); image.src = blobUrl; image.alt = media.alt || ''; image.className = 'reader-media'; if (image.tagName === 'VIDEO' || image.tagName === 'AUDIO') image.controls = true; saved.append(image);
      }
      const revisions = node('details'); revisions.append(node('summary',`${(record.revisions || []).length} preserved versions`)); for (const revision of record.revisions || []) revisions.append(node('p',(revision.capturedAt || revision.savedAt || '') + '\n' + (revision.text || ''))); saved.append(revisions); item.append(saved);
    }); item.append(inspect); root.append(item);
  }
  if (!posts.length) root.append(node('p','No entries yet. Your first entry can stay private while you try the desk.'));
}
async function refresh() {
  const data = await request('posts?owner=1&limit=100'); posts = data.posts || []; let cursor = data.nextCursor;
  for (let page = 0; cursor && page < 19; page++) { const next = await request('posts?owner=1&limit=100&cursor=' + encodeURIComponent(cursor)); posts.push(...(next.posts || [])); cursor = next.nextCursor; }
  renderPosts();
  if (cursor) status('Showing the first 2,000 entries. The records download includes the full archive.');
  const health = await request('status');
  $('storage-status').textContent = health.storage === 'local' ? 'Local preview storage. Cloud storage must be configured before deployment.' : `${Math.round((health.bytesUsed || 0)/1048576)} MiB stored. Imports pause at the configured archive limit.`;
  $('source-status').textContent = (health.sources || []).map(source => `${source.platform}: ${source.handle || source.actor || source.id}`).join('\n') || 'No accounts connected yet.';
}
function reset() { $('compose').reset(); $('entry-id').value = ''; $('compose-heading').textContent = 'a new entry'; $('preview').hidden = true; }
function fileData(file) { return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); }
$('compose').onsubmit = event => { event.preventDefault(); run(event.submitter, async () => {
  const files = [...$('media').files]; if (files.length > 4 || files.some(file => file.size > 10*1024*1024) || files.reduce((sum,file) => sum + file.size,0) > 20*1024*1024) throw new Error('Use up to four images, each no larger than 10 MiB and no more than 20 MiB combined.');
  const payload = {title:$('title').value,text:$('text').value,visibility:$('visibility').value};
  if (files.length) payload.media = await Promise.all(files.map(async file => ({data:await fileData(file),type:file.type,name:file.name,alt:$('alt').value})));
  const id = $('entry-id').value;
  await request(id ? 'posts/' + id : 'posts',{method:id ? 'PATCH' : 'POST',body:JSON.stringify(payload)});
  status(payload.visibility === 'public' ? 'Published to sungolog.' : 'Saved privately.'); reset(); await refresh();
}); };
$('preview-button').onclick = () => { $('preview').hidden = false; $('preview').textContent = [$('title').value,$('text').value].filter(Boolean).join('\n\n') || 'Add a thought or an image first.'; };
$('reset-compose').onclick = reset; $('owner-search').oninput = renderPosts;
$('connect').onsubmit = event => { event.preventDefault(); run(event.submitter,async () => { await request('sources',{method:'POST',body:JSON.stringify({platform:'bluesky',handle:$('handle').value.trim().replace(/^@/,'')})}); status('Account connected. New captures will stay private.'); await refresh(); }); };
$('sync').onclick = () => run($('sync'),async () => { const result = await request('sync',{method:'POST',body:'{}'}); const reports = result.reports || []; const changed = reports.reduce((total,report) => total + (report.changed || 0),0); const errors = reports.flatMap(report => (report.errors || []).map(error => (report.handle ? report.handle + ': ' : '') + error)); status(result.skipped ? 'Another source check is already running.' : reports.length ? `Source check finished. ${changed} new or updated captures saved privately.` + (errors.length ? '\n' + errors.join('\n') : '') : 'Connect an account before checking for changes.'); await refresh(); });
$('export').onclick = () => run($('export'),async () => { const data = await request('export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); const a = node('a'); a.href = url; a.download = 'sungolog-' + new Date().toISOString().slice(0,10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),30000); status('Archive downloaded. Media metadata is included; media files remain in archive storage.'); });
$('import').onclick = () => run($('import'),async () => { const file = $('import-file').files[0]; if (!file) throw new Error('Choose a JSON post first.'); if (file.size > 8*1024*1024) throw new Error('Import files must be smaller than 8 MiB.'); const payload = JSON.parse(await file.text()); await request('import',{method:'POST',body:JSON.stringify(payload)}); status('Imported privately. Any earlier captures remain in the record.'); await refresh(); });
$('sign-out').onclick = () => run($('sign-out'),async () => { await signOutFn(auth); });
try {
  const response = await fetch('/api/sungolog/config'); if (!response.ok) throw new Error('Owner sign-in needs its Firebase configuration. Public reading is still available.'); const config = await response.json();
  if (!config.apiKey) throw new Error('Owner sign-in is not configured in this preview.');
  const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut}] = await Promise.all([import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js')]);
  auth = getAuth(initializeApp(config)); signOutFn = signOut;
  $('sign-in').onclick = () => run($('sign-in'),async () => { const provider = new GoogleAuthProvider(); provider.setCustomParameters({login_hint:'mario0318@gmail.com'}); await signInWithPopup(auth,provider); });
  onAuthStateChanged(auth,async current => { user = current; const owner = current?.email === 'mario0318@gmail.com' && current?.emailVerified; $('workspace').hidden = !owner; $('sign-out').hidden = !current; $('sign-in').hidden = !!current; $('auth-state').textContent = owner ? current.email : current ? 'This account cannot access the writing desk.' : 'sign in to publish and see your private archive'; for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls=[]; if (owner) { try { await refresh(); } catch(error) { status(error.message); } } else { posts=[]; $('owner-entries').replaceChildren(); } });
} catch(error) { status(error.message); $('sign-in').disabled = true; }
