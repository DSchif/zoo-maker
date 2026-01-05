import { Animal, AnimalConfig } from '../Animal';
import type { Game } from '../../core/Game';
import type { Gender } from '../../core/types';

/**
 * Bison species information
 */
export const BisonInfo = {
    speciesName: 'American Bison',
    scientificName: 'Bison bison',
    description: 'The American bison is a species of bison native to North America.',
    preferredFood: ['hay'],
    lifespan: '15-25 years',
    size: 'Large',
    temperament: 'Herd Animal',
    biome: 'prairie',
    waterAffinity: 0.05,  // ~5% of time in water, will wade and cross rivers
    waterSpriteCutoff: 12,  // Pixels to cut from bottom when in water (bison are larger)

    terrainNeeds: {
        prairie: 0.5,
        grass: 0.3,
        dirt: 0.1,  // Bison like some dusty areas for wallowing
    },

    foliageNeeds: {
        prairie_grass: 0.25,
        shrub: 0.1,
        wildflowers: 0.05,  // Some wildflowers in prairie
    },

    socialNeeds: {
        minGroupSize: 3,
        maxGroupSize: 15,
        idealGroupSize: 8,
        idealMaleRatio: 0.25,
        spacePerAnimal: 6,  // Bison are herd animals, need less space each
    },

    breedingConfig: {
        gestationDays: 285,
        breedingCooldown: 400,
        minBreedingAge: 730,
        breedingChance: 0.35,
        litterSizeProbabilities: { 1: 0.95, 2: 0.05 },
        minBreedingHappiness: 80,  // Bison need 80% happiness to breed
    },
};

/**
 * Bison class
 */
export class Bison extends Animal {
    // Bison are larger than other animals
    public readonly scale: number = 2;

    // Bison-specific colors for rendering
    public readonly bodyColor: number = 0x4a3728;
    public readonly headColor: number = 0x2d2015;
    public readonly hornColor: number = 0x1a1a1a;

    constructor(game: Game, tileX: number, tileY: number, gender?: Gender) {
        const config: AnimalConfig = {
            speciesName: BisonInfo.speciesName,
            species: 'bison',
            biome: BisonInfo.biome,
            gender,
            speed: 1.2,
            hungerDecay: 0.6,
            preferredFood: BisonInfo.preferredFood,
            terrainNeeds: BisonInfo.terrainNeeds,
            foliageNeeds: BisonInfo.foliageNeeds,
            socialNeeds: BisonInfo.socialNeeds,
            maturityAge: 730, // 2 years
            breedingConfig: BisonInfo.breedingConfig,
            waterAffinity: BisonInfo.waterAffinity,
            waterSpriteCutoff: BisonInfo.waterSpriteCutoff,
        };

        super(game, tileX, tileY, config);
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return '🦬';
    }
}
