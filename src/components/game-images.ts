// Card and spotlight art for each game in src/lib/games.mjs, keyed by game id.
// Images are Astro asset imports, so they live here rather than in the .mjs list.
// The *-card.png crops drop the player name, Roblox menu and cursor from the source screenshots.
import type { ImageMetadata } from "astro";
import stealTitle from "../assets/steal-a-minion/title.png";
import researchArena from "../assets/steal-a-minion/research-arena.png";
import commanderDeploy from "../assets/pants-rush/commander-deploy.png";
import match from "../assets/battle/2v2.png";
import survivors from "../assets/survivors/horde-card.png";
import bowling from "../assets/bowling/minion-pins-card.png";
import pantsFactoryManagerTitle from "../assets/brand/pants-factory-manager-title.png";

export interface GameImage {
  image: ImageMetadata;
  alt: string;
  label: string;
  logo?: ImageMetadata;
}

export const GAME_IMAGES: Record<string, GameImage> = {
  "steal-a-minion": {
    image: researchArena,
    alt: "Minions face off on numbered pads in the Steal a Minion Research Arena",
    label: "Development screenshot",
    logo: stealTitle,
  },
  "pants-rush": {
    image: commanderDeploy,
    alt: "The Commander's armoured mech lands in the street behind a group of green aliens",
    label: "Development screenshot",
  },
  match: {
    image: match,
    alt: "Defenders and aliens in a NOPAS: Invasion battle illustration",
    label: "Universe artwork",
  },
  survivors: {
    image: survivors,
    alt: "A defender faces a huge crowd of orange Minions charging across the grass",
    label: "Development screenshot",
  },
  bowling: {
    image: bowling,
    alt: "Orange Minion pins face a blue bowling ball on a Minion Panic Bowling lane",
    label: "Development screenshot",
  },
};

export const COMING_SOON_LOGO = pantsFactoryManagerTitle;

export function gameImage(id: string): GameImage {
  const entry = GAME_IMAGES[id];
  if (!entry) throw new Error(`No card art for game "${id}" in GAME_IMAGES`);
  return entry;
}
