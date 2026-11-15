// Single source of truth for the NOPAS universe of games.
export const GAMES = [
  {
    id: "steal-a-minion",
    name: "Steal a Minion",
    href: "/nopas/steal-a-minion/",
    tag: "COLLECT. SNEAK. STEAL.",
    blurb: "Fill your lot with minions. Buy them, sneak them out of the Evidence Locker, or nab them from the neighbours. They can nab yours too.",
    color: "#c995ff",
    status: "Open Beta",
    isNew: true,
    navLabel: "Steal a Minion",
  },
  {
    id: "pants-rush",
    name: "Pants Rush",
    href: "/nopas/pants-rush/",
    tag: "THIS TIME, YOU'RE THE ALIEN.",
    blurb: "Raid the suburbs for pants, solo or with a crew of four. Six phases, six bosses, one very golden finale.",
    color: "#ff9d4d",
    status: "Open Beta",
    isNew: true,
    navLabel: "Pants Rush",
  },
  {
    id: "match",
    name: "NOPAS: Invasion",
    href: "/nopas/#match",
    tag: "DEFEND. INVADE. DEPANTS.",
    blurb: "Save Earth's pants. Or steal every last pair. Defenders and alien Collectors turn the neighborhood into a battleground.",
    color: "#74caff",
    status: "Open Beta",
    isNew: false,
    navLabel: "Invasion",
  },
  {
    id: "survivors",
    name: "Minion Survivors",
    href: "/nopas/survivors/",
    tag: "MORE MINIONS. SEND HELP.",
    blurb: "Here comes the horde. Face waves of Minions and see how long you can keep the chaos under control.",
    color: "#a9ef79",
    status: "Open Beta",
    isNew: false,
    navLabel: "Minion Survivors",
  },
  {
    id: "bowling",
    name: "Minion Panic Bowling",
    href: "/nopas/bowling/",
    tag: "BIG BALL. LITTLE ALIENS.",
    blurb: "The pins are Minions. The Minions have complaints. Roll into ten-pin chaos with a very questionable alien workforce.",
    color: "#ffda56",
    status: "Open Beta",
    isNew: false,
    navLabel: "Minion Panic Bowling",
  },
];

export const SPOTLIGHT_ID = "steal-a-minion";

export function spotlightGame() {
  const g = GAMES.find((x) => x.id === SPOTLIGHT_ID);
  if (!g) throw new Error("SPOTLIGHT_ID matches no game");
  return g;
}

export function gridGames() {
  return GAMES.filter((g) => g.id !== SPOTLIGHT_ID);
}

export const EXTRAS = [
  { name: "Arcade", line: "Four free cabinet games in the Lobby, with high scores shared with Bowling." },
  { name: "AFK Lounge", line: "Sit on a couch. Earn coins slowly. Peak defender behaviour." },
];

export const COMING_SOON = {
  name: "Pants Factory Manager",
  line: "Pants Factory Manager is coming soon. Build pants. Build an empire!",
};
