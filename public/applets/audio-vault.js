export default {
  key: 'audio-vault',
  title: 'audio vault',
  ui: 'panel',
  async mount(el, ctx) {
    const track = ctx.args[0];
    if (!track?.url && !track?.audioUrl) return;

    const card = document.createElement('section');
    card.className = 'audio-card';

    const title = document.createElement('h3');
    title.textContent = track.title || 'untitled audio';
    card.appendChild(title);

    if (track.artist || track.source) {
      const meta = document.createElement('p');
      meta.className = 'audio-meta';
      meta.textContent = [track.artist, track.source].filter(Boolean).join(' · ');
      card.appendChild(meta);
    }

    const audio = document.createElement('audio');
    audio.className = 'audio-player';
    audio.controls = true;
    audio.autoplay = true;
    audio.preload = 'metadata';
    audio.src = directAudioUrl(track);
    if (track.type) audio.type = track.type;
    audio.addEventListener('error', () => {
      ctx.print?.(`audio vault could not play "${track.title || 'that track'}". use a direct .mp3, .wav, .m4a, or .ogg file url.`);
    });
    card.appendChild(audio);

    const links = document.createElement('p');
    links.className = 'audio-links';
    const direct = document.createElement('a');
    direct.href = audio.src;
    direct.target = '_blank';
    direct.rel = 'noreferrer';
    direct.textContent = 'open direct file';
    links.appendChild(direct);

    if (track.pageUrl && track.pageUrl !== track.url) {
      links.appendChild(document.createTextNode(' · '));
      const page = document.createElement('a');
      page.href = track.pageUrl;
      page.target = '_blank';
      page.rel = 'noreferrer';
      page.textContent = 'source page';
      links.appendChild(page);
    }
    card.appendChild(links);

    const note = document.createElement('p');
    note.className = 'audio-note';
    note.textContent = 'This player uses the browser audio element. It does not load Dropbox, Google Drive, OneDrive, Box, Mega, or SoundCloud embeds.';
    card.appendChild(note);

    el.appendChild(card);
  },
  unmount() {},
};

function directAudioUrl(track) {
  const raw = track.audioUrl || track.url;
  try {
    const url = new URL(raw, window.location.href);
    if (/(\.|^)dropbox\.com$/i.test(url.hostname)) {
      url.searchParams.delete('dl');
      url.searchParams.set('raw', '1');
      return url.toString();
    }
    const driveMatch = url.hostname === 'drive.google.com' && url.pathname.match(/\/file\/d\/([^/]+)/);
    if (driveMatch) {
      return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveMatch[1])}`;
    }
    return url.toString();
  } catch {
    return raw;
  }
}
