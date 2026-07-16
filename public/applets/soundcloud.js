export default {
  key: 'soundcloud',
  title: 'the vault',
  ui: 'panel',
  async mount(el, ctx) {
    const track = ctx.args[0];
    if (!track?.url) return;
    const frame = document.createElement('div');
    frame.className = 'applet-frame';
    const iframe = document.createElement('iframe');
    iframe.title = track.title || 'SoundCloud player';
    iframe.loading = 'lazy';
    iframe.height = '166';
    iframe.allow = 'autoplay';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-popups allow-forms';
    const query = new URLSearchParams({ url: track.url, color: '4dd8c7', auto_play: 'true', show_comments: 'false' });
    iframe.src = `https://w.soundcloud.com/player/?${query}`;
    frame.appendChild(iframe); el.appendChild(frame);
  },
  unmount() {},
};
