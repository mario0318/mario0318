export default {
  key: 'analemma',
  title: 'analemma studio',
  ui: 'panel',
  async mount(el) {
    const card = document.createElement('div');
    card.className = 'applet-card';
    const heading = document.createElement('p');
    heading.textContent = "the studio's catching up.";
    const link = document.createElement('a');
    link.href = 'mailto:hi@mario0318.com?subject=Analemma%20Studio';
    link.textContent = 'notify me';
    card.append(heading, link); el.appendChild(card);
  },
  unmount() {},
};
