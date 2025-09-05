const HEADLINE = [
  'Breaking: ______ spotted doing cartwheels in Times Square',
  'Scientists confirm: ______ actually improves memory',
  'New law proposes mandatory ______ on Fridays'
]

const LAW = [
  'In Florida, it is illegal to ______ after 10pm',
  'You may not ______ within 50 feet of a mailbox',
  'Town ordinance bans ______ on Sundays'
]

const MEME = [
  'Caption this image: “Cat on a Roomba”',
  'Caption this image: “Grandma with VR headset”',
  'Caption this image: “Dog wearing sunglasses at the beach”'
]

export function getPrompt(category: string): string {
  const pools: Record<string, string[]> = {
    headline_hijack: HEADLINE,
    law_or_nah: LAW,
    meme_mash: MEME,
  }
  const arr = pools[category] || HEADLINE
  return arr[Math.floor(Math.random() * arr.length)]
}

