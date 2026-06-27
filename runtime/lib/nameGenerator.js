// nameGenerator.js — GitHub-style funny names ("adjective-noun", e.g. "fuzzy-octopus").
// The WS exchange gives each connected client one as its address, so others can DM it
// by a human-friendly handle instead of an opaque id.

const ADJECTIVES = [
  'fuzzy', 'shiny', 'sleepy', 'witty', 'turbo', 'cosmic', 'salty', 'mellow', 'zesty',
  'bouncy', 'gentle', 'sneaky', 'jolly', 'brave', 'curly', 'dapper', 'fluffy', 'glowing',
  'humble', 'nifty', 'plucky', 'quirky', 'rusty', 'spicy', 'velvet', 'wobbly', 'zippy',
  'breezy', 'crispy', 'dizzy', 'feisty', 'groovy', 'snazzy', 'wandering', 'silent',
]

const NOUNS = [
  'octopus', 'walrus', 'narwhal', 'gecko', 'panda', 'otter', 'falcon', 'badger', 'lemur',
  'marmot', 'puffin', 'raccoon', 'wombat', 'yak', 'axolotl', 'koala', 'mantis', 'newt',
  'quokka', 'tapir', 'ferret', 'hedgehog', 'iguana', 'jackal', 'kiwi', 'llama', 'meerkat',
  'pelican', 'salamander', 'toucan', 'capybara', 'lynx', 'mongoose', 'pangolin', 'heron',
]

const pick = (list) => list[Math.floor(Math.random() * list.length)]

// A random "adjective-noun". The space is |ADJECTIVES| × |NOUNS| (~1200 combos).
export const randomName = () => `${pick(ADJECTIVES)}-${pick(NOUNS)}`

// A name that passes `isTaken(name) === false`. Tries random names first; if it keeps
// colliding (tiny space / many clients) it falls back to appending a numeric suffix so it
// always terminates with a free name.
export const uniqueName = (isTaken) => {
  for (let i = 0; i < 50; i += 1) {
    const name = randomName()
    if (!isTaken(name)) {
      return name
    }
  }
  let suffix = 2
  let candidate = `${randomName()}-${suffix}`
  while (isTaken(candidate)) {
    suffix += 1
    candidate = `${randomName()}-${suffix}`
  }
  return candidate
}
