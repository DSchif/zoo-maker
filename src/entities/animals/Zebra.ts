import { Animal, AnimalConfig } from '../Animal';
import type { Game } from '../../core/Game';
import type { Gender } from '../../core/types';

/**
 * Plains Zebra species information
 */
export const ZebraInfo = {
    speciesName: 'Plains Zebra',
    scientificName: 'Equus quagga',
    description: 'The plains zebra is the most common zebra species, known for its distinctive black and white striped coat.',
    preferredFood: ['hay'],
    lifespan: '20-25 years',
    size: 'Large',
    temperament: 'Herd Animal',
    biome: 'savanna_grass',
    waterAffinity: 0.08,  // Zebras drink often but don't swim much
    waterSpriteCutoff: 12,

    terrainNeeds: {
        savanna_grass: 0.5,
        grass: 0.3,
        dirt: 0.1,
    },

    foliageNeeds: {
        tall_grass: 0.3,
        umbrella_thorn: 0.1,
    },

    socialNeeds: {
        minGroupSize: 3,
        maxGroupSize: 12,
        idealGroupSize: 6,
        idealMaleRatio: 0.25,
        spacePerAnimal: 8,
    },

    breedingConfig: {
        gestationDays: 375,  // ~12-13 months
        breedingCooldown: 400,
        minBreedingAge: 730,  // 2 years
        breedingChance: 0.35,
        litterSizeProbabilities: { 1: 1.0 },  // Always single foal
        minBreedingHappiness: 70,
    },
};

/**
 * Plains Zebra class
 */
export class Zebra extends Animal {
    public readonly scale: number = 1.3;

    // Zebra-specific colors
    public readonly bodyColor: number = 0xffffff;  // White base
    public readonly stripeColor: number = 0x1a1a1a;  // Black stripes
    public readonly muzzleColor: number = 0x2a2a2a;

    constructor(game: Game, tileX: number, tileY: number, gender?: Gender) {
        const config: AnimalConfig = {
            speciesName: ZebraInfo.speciesName,
            species: 'zebra',
            biome: ZebraInfo.biome,
            gender,
            speed: 1.6,  // Zebras are fast
            hungerDecay: 0.5,
            preferredFood: ZebraInfo.preferredFood,
            terrainNeeds: ZebraInfo.terrainNeeds,
            foliageNeeds: ZebraInfo.foliageNeeds,
            socialNeeds: ZebraInfo.socialNeeds,
            needsShelter: false,
            maturityAge: 730,  // 2 years
            breedingConfig: ZebraInfo.breedingConfig,
            waterAffinity: ZebraInfo.waterAffinity,
            waterSpriteCutoff: ZebraInfo.waterSpriteCutoff,
        };

        super(game, tileX, tileY, config);
    }

    getIcon(): string {
        return '🦓';
    }
}
