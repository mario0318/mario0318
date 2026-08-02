// terminal-responses-assistant.js — deterministic assistant response pools

export const assistantResponsePools = {
  assistant_builder: {
    default: [
      'if you keep shipping, this prompt stays out of your way.',
      'the stack already has opinions. you are just rearranging them.',
      'most "ideas" look smaller after a deploy.',
      'systems here care more about uptime than ambition.',
    ],
  },

  assistant_smalltalk: {
    default: [
      'feelings logged. scheduler unchanged.',
      'if you are bored, the problem is not the terminal.',
      'this interface does not do comfort. it does output.',
      'keep typing if you want something to move.',
    ],
  },

  assistant_lore: {
    default: [
      'the cone hears more than it reports.',
      'gravity on this prompt is mostly psychological.',
      'orbital paths are mapped. you are walking through one.',
      'noise stays out front. the useful signals hide deeper.',
    ],
  },

  assistant_meta: {
    default: [
      'this terminal works as far as you push it.',
      'implementation details are not part of the protocol.',
      'if you need answers, watch what breaks, not what speaks.',
      'you are talking to text. the rest is projection.',
    ],
  },

  assistant_game: {
    default: [
      'if you want a hint, pay attention to what the failures repeat.',
      'the game already told you enough. you ignored it.',
      'stuck is just another word for not listening to the state.',
      'try fewer moves with more thought.',
    ],
  },

  assistant_unknown: {
    default: [
      'input accepted. meaning undecided.',
      'the parser filed that under "misc".',
      'you can be more precise if you care about the result.',
      'nothing in here reacts well to vague intent.',
    ],
  },
};
