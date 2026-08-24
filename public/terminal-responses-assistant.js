// terminal-responses-assistant.js — deterministic assistant response pools

export const assistantResponsePools = {
  assistant_identity_user: {
    default: [
      'you are the visitor in this session. the terminal knows a prompt, not a biography.',
      'you are the person asking it to do better. that is enough for this screen.',
      'a visitor with keyboard access and a reasonable objection.',
    ],
  },

  assistant_identity_terminal: {
    default: [
      'mario0318 web terminal. a deterministic local interface, not a person and not a hidden model.',
      'a browser terminal with rules, state, and a limited memory of this session. no remote brain attached.',
      'this is a handcrafted terminal layer. it can recognize intent, but it does not pretend to be conscious.',
    ],
  },

  assistant_capability: {
    default: [
      'it can route commands, remember this tab\'s recent input, open site tools, and react to common intent locally. no paid inference involved.',
      'the useful part is local: command routing, compact intent rules, session context, and honest limits. it will not invent a capability it does not have.',
      'this terminal is a rules engine with a conversational front door. type a command, ask a question, or test the boundary.',
    ],
  },

  assistant_critique: {
    default: [
      'fair. that response missed the intent.',
      'correct. the parser matched a word when it should have read the sentence.',
      'noted. a terminal that only recognizes prefixes is not doing enough.',
    ],
  },

  assistant_directive: {
    default: [
      'that reads as a request, not a shell command. name the result you want and the terminal will route what it actually supports.',
      'request received. this page can simulate commands and open its tools, but it will say when an action is only figurative.',
      'the sentence has intent. the terminal is checking whether it has a real local action before it pretends otherwise.',
    ],
  },

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
