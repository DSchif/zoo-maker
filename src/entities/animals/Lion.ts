import { Animal, AnimalConfig } from '../Animal';
import type { Game } from '../../core/Game';
import type { Gender } from '../../core/types';

/**
 * Lion species information
 */
export const LionInfo = {
    speciesName: 'Lion',
    scientificName: 'Panthera leo',
    description: 'The lion is a large cat of the genus Panthera native to Africa and India.',
    preferredFood: ['meat'],
    lifespan: '15-20 years',
    size: 'Large',
    temperament: 'Territorial',
    biome: 'savanna_grass',

    terrainNeeds: {
        savanna_grass: 0.6,
        grass: 0.2,
        fresh_water: 0.1,  // Lions like some water for drinking
    },

    foliageNeeds: {
        acacia: 0.15,
        tall_grass: 0.2,
    },

    socialNeeds: {
        minGroupSize: 2,
        maxGroupSize: 8,
        idealGroupSize: 5,
        idealMaleRatio: 0.3,
        spacePerAnimal: 8,  // Each lion needs 8 tiles of space
    },

    breedingConfig: {
        gestationDays: 110,
        breedingCooldown: 365,
        minBreedingAge: 730,
        breedingChance: 0.3,
        litterSizeProbabilities: { 1: 0.3, 2: 0.4, 3: 0.25, 4: 0.05 },
        minBreedingHappiness: 75,  // Lions need 75% happiness to breed
    },
};

/**
 * Lion class
 */
export class Lion extends Animal {
    // Lion-specific colors for rendering
    public readonly bodyColor: number = 0xc9a227;
    public readonly maneColor: number = 0x8b6914;
    public readonly accentColor: number = 0xe8c547;

    constructor(game: Game, tileX: number, tileY: number, gender?: Gender) {
        const config: AnimalConfig = {
            speciesName: LionInfo.speciesName,
            species: 'lion',
            biome: LionInfo.biome,
            gender,
            speed: 1.5,
            hungerDecay: 0.4,
            preferredFood: LionInfo.preferredFood,
            terrainNeeds: LionInfo.terrainNeeds,
            foliageNeeds: LionInfo.foliageNeeds,
            socialNeeds: LionInfo.socialNeeds,
            needsShelter: true,  // Lions need shelter for happiness
            maturityAge: 730, // 2 years
            breedingConfig: LionInfo.breedingConfig,
        };

        super(game, tileX, tileY, config);
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return '🦁';
    }
}
