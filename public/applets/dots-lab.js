const defaults = { '--dot-cycle': '4s', '--dot-gap': '8px', '--dot-hue': '0deg' };
let root;

export default {
  key: 'dots-lab',
  title: 'dots lab',
  ui: 'inline-applet',
  async mount(el) {
    root = document.documentElement;
    const wrap = document.createElement('div');
    wrap.className = 'dots-lab';
    const controls = [
      ['speed', '--dot-cycle', 1, 8, 0.25, 's'],
      ['gap', '--dot-gap', 2, 24, 1, 'px'],
      ['hue', '--dot-hue', 0, 360, 1, 'deg'],
    ];
    for (const [name, variable, min, max, step, unit] of controls) {
      const label = document.createElement('label');
      label.className = 'lab-row';
      label.textContent = name;
      const input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = step;
      input.value = parseFloat(getComputedStyle(root).getPropertyValue(variable)) || parseFloat(defaults[variable]);
      input.addEventListener('input', () => root.style.setProperty(variable, input.value + unit));
      label.appendChild(input); wrap.appendChild(label);
    }
    el.appendChild(wrap);
  },
  unmount() {
    if (!root) return;
    for (const [key, value] of Object.entries(defaults)) root.style.setProperty(key, value);
    root = null;
  },
};
