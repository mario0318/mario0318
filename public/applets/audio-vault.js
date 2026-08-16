export default {
  key: 'audio-vault',
  title: 'audio vault',
  ui: 'panel',
  async mount(el, ctx) {
    let track = ctx.args[0];
    if (!track?.url && !track?.audioUrl) return;

    const card = document.createElement('section');
    card.className = 'audio-card';

    const title = document.createElement('h3');
    card.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'audio-meta';
    card.appendChild(meta);

    const audio = document.createElement('audio');
    audio.className = 'audio-player';
    audio.controls = true;
    audio.autoplay = true;
    audio.preload = 'metadata';
    audio.addEventListener('error', () => {
      ctx.print?.(`audio vault could not play "${track.title || 'that track'}". use a direct .mp3, .wav, .m4a, or .ogg file url.`);
    });
    card.appendChild(audio);

    const actions = document.createElement('div');
    actions.className = 'audio-actions';
    const randomizer = document.createElement('button');
    randomizer.className = 'audio-randomizer';
    randomizer.type = 'button';
    randomizer.textContent = 'randomizer';
    randomizer.addEventListener('click', async () => {
      const next = await pickNextTrack(ctx.audioVault, track);
      if (!next) return;
      setTrack(next);
      audio.play?.().catch(() => {});
    });
    actions.appendChild(randomizer);
    card.appendChild(actions);

    const links = document.createElement('p');
    links.className = 'audio-links';
    card.appendChild(links);

    setTrack(track);
    el.appendChild(card);

    function setTrack(next) {
      track = next;
      title.textContent = track.title || 'untitled audio';
      const details = [track.artist, track.source].filter(Boolean).join(' · ');
      meta.textContent = details;
      meta.hidden = !details;
      audio.src = directAudioUrl(track);
      if (track.type) audio.type = track.type;
      else audio.removeAttribute('type');
      renderLinks(links, audio.src, track);
    }
  },
  unmount() {},
};

async function pickNextTrack(vault, currentTrack) {
  if (!vault) return null;
  const tracks = vault.tracks || await vault.load?.() || [];
  if (!tracks.length) return null;
  if (tracks.length === 1) return tracks[0];
  for (let i = 0; i < 8; i++) {
    const candidate = vault.pickRandom ? vault.pickRandom() : tracks[Math.floor(Math.random() * tracks.length)];
    if ((candidate?.url || candidate?.audioUrl) !== (currentTrack?.url || currentTrack?.audioUrl)) return candidate;
  }
  return tracks.find((candidate) => (candidate?.url || candidate?.audioUrl) !== (currentTrack?.url || currentTrack?.audioUrl)) || tracks[0];
}

function renderLinks(container, audioSrc, track) {
  container.replaceChildren();
  const direct = document.createElement('a');
  direct.href = audioSrc;
  direct.target = '_blank';
  direct.rel = 'noreferrer';
  direct.textContent = 'open direct file';
  container.appendChild(direct);

  if (track.pageUrl && track.pageUrl !== track.url) {
    container.appendChild(document.createTextNode(' · '));
    const page = document.createElement('a');
    page.href = track.pageUrl;
    page.target = '_blank';
    page.rel = 'noreferrer';
    page.textContent = 'source page';
    container.appendChild(page);
  }
}

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
