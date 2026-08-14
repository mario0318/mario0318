export default {
  key: 'analemma',
  title: 'analemma studio',
  ui: 'panel',
  async mount(el) {
    const frame = document.createElement('div');
    frame.className = 'applet-frame applet-frame-tall';

    const iframe = document.createElement('iframe');
    iframe.title = 'Analemma Studio';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';
    iframe.src = 'https://raul3.com/analemma/';

    frame.appendChild(iframe);
    el.appendChild(frame);
  },
  unmount() {},
};
