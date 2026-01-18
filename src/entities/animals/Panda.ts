import { Animal, AnimalConfig } from '../Animal';
import type { Game } from '../../core/Game';
import type { Gender } from '../../core/types';

/**
 * Panda species information
 */
export const PandaInfo = {
    speciesName: 'Giant Panda',
    scientificName: 'Ailuropoda melanoleuca',
    description: 'The giant panda is a bear species endemic to China, known for its distinctive black and white coat.',
    preferredFood: ['vegetables'],
    lifespan: '20-30 years',
    size: 'Large',
    temperament: 'Solitary',
    biome: 'deciduous_floor',
    waterAffinity: 0.02,  // ~2% of time in water, pandas can swim but rarely do
    waterSpriteCutoff: 12,  // Pixels to cut from bottom when in water

    terrainNeeds: {
        deciduous_floor: 0.4,
        grass: 0.3,
        coniferous_floor: 0.2,
    },

    foliageNeeds: {
        bamboo: 0.4,
        deciduous_tree: 0.2,
        shrub: 0.1,
    },

    socialNeeds: {
        minGroupSize: 1,
        maxGroupSize: 3,
        idealGroupSize: 1,  // Pandas are mostly solitary
        idealMaleRatio: 0.5,
        spacePerAnimal: 12,  // Pandas need more personal space
    },

    breedingConfig: {
        gestationDays: 135,
        breedingCooldown: 730,  // Pandas breed infrequently
        minBreedingAge: 1460,  // 4 years
        breedingChance: 0.15,  // Low breeding success rate
        litterSizeProbabilities: { 1: 0.85, 2: 0.15 },  // Usually single cubs, rarely twins
        minBreedingHappiness: 90,  // Pandas need high happiness to breed
    },
};

/**
 * Panda class
 */
export class Panda extends Animal {
    // Panda-specific colors for rendering
    public readonly bodyColor: number = 0xf5f5f5;  // White body
    public readonly patchColor: number = 0x1a1a1a;  // Black patches
    public readonly eyeColor: number = 0x1a1a1a;

    constructor(game: Game, tileX: number, tileY: number, gender?: Gender) {
        const config: AnimalConfig = {
            speciesName: PandaInfo.speciesName,
            species: 'panda',
            biome: PandaInfo.biome,
            gender,
            speed: 0.8,  // Pandas are slow movers
            hungerDecay: 0.7,  // Pandas eat a lot of bamboo
            preferredFood: PandaInfo.preferredFood,
            terrainNeeds: PandaInfo.terrainNeeds,
            foliageNeeds: PandaInfo.foliageNeeds,
            socialNeeds: PandaInfo.socialNeeds,
            needsShelter: true,  // Pandas need shelter
            maturityAge: 1460, // 4 years
            breedingConfig: PandaInfo.breedingConfig,
            waterAffinity: PandaInfo.waterAffinity,
            waterSpriteCutoff: PandaInfo.waterSpriteCutoff,
        };

        super(game, tileX, tileY, config);
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return '🐼';
    }
}
