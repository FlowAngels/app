export const HEADLINE_PROMPTS = [
  'Local council apologizes after ____ statue is installed upside down.',
  'Man detained at airport for attempting to ____ a vending machine.',
  'Scientists baffled after neighbourhood cat learns to ____.',
  'New study finds people who ____ before breakfast may live longer.',
  'Wedding interrupted when best man accidentally ____ during his speech.',
  'Small town names ____ as its official emergency preparedness plan.',
  'Museum asks visitors to stop ____ the dinosaur exhibit.',
  'Local teacher wins award for using ____ to explain mathematics.',
  'Airline launches premium service that lets passengers ____ at 30,000 feet.',
  'Experts warn that the latest wellness trend, ____, may be getting out of hand.',
  'Neighbourhood watch formed after mysterious person keeps ____ at midnight.',
  'Restaurant goes viral for serving every meal with a side of ____.',
  'Mayor declares public holiday after resident successfully ____.',
  'Family discovers the “rare antique” in their attic is actually ____.',
  'Tech company apologizes after its new AI begins recommending ____ to everyone.',
  'World record attempt abandoned when organizers forget to bring ____.',
  'Zoo introduces new rule banning visitors from ____ near the penguins.',
  'Commuters stunned as train conductor announces ____ instead of the next stop.',
  'Police called after inflatable ____ blocks traffic for three hours.',
  'Local hero rescues birthday party using only ____ and a roll of tape.',
] as const

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
    headline_hijack: [...HEADLINE_PROMPTS],
    law_or_nah: LAW,
    meme_mash: MEME,
  }
  const arr = pools[category] || HEADLINE_PROMPTS
  return arr[Math.floor(Math.random() * arr.length)]
}
