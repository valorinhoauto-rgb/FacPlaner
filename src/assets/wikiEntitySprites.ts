/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const WIKI_IMAGES_BASE = 'https://wiki.factorio.com/images/';

const WIKI_ENTITY_FILE_BY_ID: Record<string, string> = {
  // Crafting & Processing Machines (300x300 in-game visuals)
  'assembling-machine-1': 'Assembling_machine_1_entity.png',
  'assembling-machine-2': 'Assembling_machine_2_entity_anim.gif',
  'assembling-machine-3': 'Assembling_machine_3_entity_anim.gif',
  'stone-furnace': 'Stone_furnace_entity.png',
  'steel-furnace': 'Steel_furnace_entity.png',
  'electric-furnace': 'Electric_furnace_entity.png',
  'chemical-plant': 'Chemical_plant_entity_anim.gif',
  'oil-refinery': 'Oil_refinery_entity.png',
  centrifuge: 'Centrifuge_entity_anim.gif',
  lab: 'Lab_entity_anim.gif',
  biolab: 'Biolab_entity_anim.gif',
  'rocket-silo': 'Rocket_silo_entity.png',
  'electric-mining-drill': 'Electric_mining_drill_entity.png',
  'big-mining-drill': 'Big_mining_drill_entity_anim.gif',
  pumpjack: 'Pumpjack_entity_anim.gif',

  // Space Age Entities
  foundry: 'Foundry_entity_anim.gif',
  'electromagnetic-plant': 'Electromagnetic_plant_entity_anim.gif',
  'cryogenic-plant': 'Cryogenic_plant_entity_anim.gif',
  biochamber: 'Biochamber_entity_anim.gif',
  crusher: 'Crusher_entity_anim.gif',
  recycler: 'Recycler_entity_anim.gif',

  // Krastorio 2 Machines mapped to closest in-game Factorio visuals
  'kr-crusher': 'Crusher_entity_anim.gif',
  'kr-advanced-assembling-machine': 'Assembling_machine_3_entity_anim.gif',
  'kr-advanced-chemical-plant': 'Chemical_plant_entity_anim.gif',
  'kr-advanced-furnace': 'Foundry_entity_anim.gif',
  'kr-electrolysis-plant': 'Cryogenic_plant_entity_anim.gif',
  'kr-filtration-plant': 'Chemical_plant_entity_anim.gif',
  'kr-atmospheric-condenser': 'Cryogenic_plant_entity_anim.gif',
  'kr-fuel-refinery': 'Oil_refinery_entity.png',
  'kr-fluid-burner': 'Chemical_plant_entity_anim.gif',
  'kr-quantum-computer': 'Lab_entity_anim.gif',
  'kr-research-server': 'Lab_entity_anim.gif',
  'kr-fusion-reactor': 'Electromagnetic_plant_entity_anim.gif',
  'kr-antimatter-reactor': 'Electromagnetic_plant_entity_anim.gif',
  'kr-matter-associator': 'Electromagnetic_plant_entity_anim.gif',
  'kr-matter-plant': 'Electromagnetic_plant_entity_anim.gif',
  'kr-singularity-lab': 'Biolab_entity_anim.gif',
  'kr-greenhouse': 'Biochamber_entity_anim.gif',
  'kr-bio-lab': 'Biochamber_entity_anim.gif',
  'kr-singularity-beacon': 'Beacon_anim.gif',
  'kr-substation-mk2': 'Substation_entity.png',
  'kr-big-roboport': 'Roboport_entity_anim.gif',
  'kr-small-roboport': 'Roboport_entity_anim.gif',
  'kr-advanced-solar-panel': 'Solar_panel_entity.png',
  'kr-energy-storage': 'Accumulator_entity_anim.gif',
  'kr-medium-active-provider-container': 'Active_provider_chest_entity.png',
  'kr-big-active-provider-container': 'Active_provider_chest_entity.png',
  'kr-medium-passive-provider-container': 'Passive_provider_chest_entity.png',
  'kr-big-passive-provider-container': 'Passive_provider_chest_entity.png',
  'kr-medium-requester-container': 'Requester_chest_entity.png',
  'kr-big-requester-container': 'Requester_chest_entity.png',
  'kr-medium-storage-container': 'Storage_chest_entity.png',
  'kr-big-storage-container': 'Storage_chest_entity.png',
  'kr-medium-buffer-container': 'Buffer_chest_entity.png',
  'kr-big-buffer-container': 'Buffer_chest_entity.png',

  // Beacons, Power, Logistics & Infrastructure
  beacon: 'Beacon_anim.gif',
  roboport: 'Roboport_entity_anim.gif',
  radar: 'Radar_entity_anim.gif',
  'small-electric-pole': 'Small_electric_pole_entity.png',
  'medium-electric-pole': 'Medium_electric_pole_entity.png',
  'big-electric-pole': 'Big_electric_pole_entity.png',
  substation: 'Substation_entity.png',
  'solar-panel': 'Solar_panel_entity.png',
  accumulator: 'Accumulator_entity_anim.gif',
  'stone-wall': 'Stone_wall_entity.png',
  gate: 'Gate_entity_anim.gif',

  // Chests & Logistic Containers
  'wooden-chest': 'Steel_chest_entity.png',
  'iron-chest': 'Steel_chest_entity.png',
  'steel-chest': 'Steel_chest_entity.png',
  'passive-provider-chest': 'Passive_provider_chest_entity.png',
  'active-provider-chest': 'Active_provider_chest_entity.png',
  'requester-chest': 'Requester_chest_entity.png',
  'storage-chest': 'Storage_chest_entity.png',
  'buffer-chest': 'Buffer_chest_entity.png',

  // Rail & Fluid Ground Entities
  'storage-tank': 'Storage_tank_entity.png',
  'train-stop': 'Train_stop_entity.png',
};

export function getWikiEntitySpriteUrl(entityName: string): string | undefined {
  const clean = entityName.trim().toLowerCase();
  const exact = WIKI_ENTITY_FILE_BY_ID[clean];
  if (exact) return `${WIKI_IMAGES_BASE}${exact}`;

  const withoutKr = clean.replace(/^kr-/, '');
  const krFallback = WIKI_ENTITY_FILE_BY_ID[withoutKr];
  if (krFallback) return `${WIKI_IMAGES_BASE}${krFallback}`;

  // Pattern-based fallbacks for modded tiers (e.g. assembling-machine-4, electric-furnace-2)
  if (clean.includes('assembling-machine')) return `${WIKI_IMAGES_BASE}Assembling_machine_3_entity_anim.gif`;
  if (clean.includes('electric-furnace')) return `${WIKI_IMAGES_BASE}Electric_furnace_entity.png`;
  if (clean.includes('steel-furnace')) return `${WIKI_IMAGES_BASE}Steel_furnace_entity.png`;
  if (clean.includes('stone-furnace')) return `${WIKI_IMAGES_BASE}Stone_furnace_entity.png`;
  if (clean.includes('chemical-plant')) return `${WIKI_IMAGES_BASE}Chemical_plant_entity_anim.gif`;
  if (clean.includes('refinery')) return `${WIKI_IMAGES_BASE}Oil_refinery_entity.png`;
  if (clean.includes('substation')) return `${WIKI_IMAGES_BASE}Substation_entity.png`;
  if (clean.includes('roboport')) return `${WIKI_IMAGES_BASE}Roboport_entity_anim.gif`;
  if (clean.includes('beacon')) return `${WIKI_IMAGES_BASE}Beacon_anim.gif`;
  if (clean.includes('solar-panel')) return `${WIKI_IMAGES_BASE}Solar_panel_entity.png`;
  if (clean.includes('accumulator')) return `${WIKI_IMAGES_BASE}Accumulator_entity_anim.gif`;
  if (clean.includes('train-stop')) return `${WIKI_IMAGES_BASE}Train_stop_entity.png`;

  return undefined;
}

type Listener = () => void;

class WikiEntitySpriteCache {
  private imageByUrl = new Map<string, HTMLImageElement>();
  private failedUrls = new Set<string>();
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }

  resolveImage(entityName: string): HTMLImageElement | undefined {
    const url = getWikiEntitySpriteUrl(entityName);
    if (!url || this.failedUrls.has(url)) return undefined;

    let img = this.imageByUrl.get(url);
    if (!img) {
      if (typeof Image === 'undefined') return undefined;
      img = new Image();
      // Do NOT set crossOrigin so direct wiki.factorio.com image loading succeeds on canvas
      img.onload = () => this.notify();
      img.onerror = () => {
        this.failedUrls.add(url);
        this.notify();
      };
      img.src = url;
      this.imageByUrl.set(url, img);
    }

    return img.complete && img.naturalWidth > 0 ? img : undefined;
  }
}

export const wikiEntitySprites = new WikiEntitySpriteCache();
