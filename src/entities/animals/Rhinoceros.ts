import { Animal, AnimalConfig } from '../Animal';
import type { Game } from '../../core/Game';
import type { Gender } from '../../core/types';

/**
 * Black Rhinoceros species information
 */
export const RhinocerosInfo = {
    speciesName: 'Black Rhinoceros',
    scientificName: 'Diceros bicornis',
    description: 'The black rhinoceros is a critically endangered species native to Africa, known for its hooked lip and two horns.',
    preferredFood: ['vegetables'],
    lifespan: '35-50 years',
    size: 'Very Large',
    temperament: 'Solitary',
    biome: 'savanna_grass',
    waterAffinity: 0.1,  // Rhinos love mud wallows
    waterSpriteCutoff: 14,

    terrainNeeds: {
        savanna_grass: 0.4,
        grass: 0.2,
        dirt: 0.2,  // Rhinos like mud/dust
        fresh_water: 0.1,
    },

    foliageNeeds: {
        umbrella_thorn: 0.25,
        shrub: 0.2,
        tall_grass: 0.1,
    },

    socialNeeds: {
        minGroupSize: 1,
        maxGroupSize: 4,
        idealGroupSize: 2,
        idealMaleRatio: 0.5,
        spacePerAnimal: 14,  // Rhinos are territorial
    },

    breedingConfig: {
        gestationDays: 450,  // ~15 months
        breedingCooldown: 900,  // ~2.5 years
        minBreedingAge: 1825,  // 5 years
        breedingChance: 0.2,
        litterSizeProbabilities: { 1: 1.0 },  // Always single calf
        minBreedingHappiness: 80,
    },
};

/**
 * Black Rhinoceros class
 */
export class Rhinoceros extends Animal {
    public readonly scale: number = 2.0;

    // Rhino-specific colors
    public readonly bodyColor: number = 0x5a5a5a;  // Dark gray
    public readonly hornColor: number = 0x3a3a3a;
    public readonly earColor: number = 0x4a4a4a;

    constructor(game: Game, tileX: number, tileY: number, gender?: Gender) {
        const config: AnimalConfig = {
            speciesName: RhinocerosInfo.speciesName,
            species: 'rhinoceros',
            biome: RhinocerosInfo.biome,
            gender,
            speed: 1.0,
            hungerDecay: 0.6,
            preferredFood: RhinocerosInfo.preferredFood,
            terrainNeeds: RhinocerosInfo.terrainNeeds,
            foliageNeeds: RhinocerosInfo.foliageNeeds,
            socialNeeds: RhinocerosInfo.socialNeeds,
            needsShelter: false,
            maturityAge: 1825,  // 5 years
            breedingConfig: RhinocerosInfo.breedingConfig,
            waterAffinity: RhinocerosInfo.waterAffinity,
            waterSpriteCutoff: RhinocerosInfo.waterSpriteCutoff,
        };

        super(game, tileX, tileY, config);
    }

    getIcon(): string {
        return '🦏';
    }
}
