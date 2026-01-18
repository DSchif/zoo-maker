import { Animal, AnimalConfig } from '../Animal';
import type { Game } from '../../core/Game';
import type { Gender } from '../../core/types';

/**
 * African Elephant species information
 */
export const ElephantInfo = {
    speciesName: 'African Elephant',
    scientificName: 'Loxodonta africana',
    description: 'The African elephant is the largest living terrestrial animal, known for its large ears and long trunk.',
    preferredFood: ['vegetables', 'hay'],
    lifespan: '60-70 years',
    size: 'Very Large',
    temperament: 'Social',
    biome: 'savanna_grass',
    waterAffinity: 0.15,  // Elephants love water and mud baths
    waterSpriteCutoff: 16,  // Large animal, more to hide

    terrainNeeds: {
        savanna_grass: 0.5,
        grass: 0.2,
        dirt: 0.15,  // Elephants like dust baths
        fresh_water: 0.1,
    },

    foliageNeeds: {
        baobab: 0.3,
        umbrella_thorn: 0.2,
        tall_grass: 0.1,
    },

    socialNeeds: {
        minGroupSize: 2,
        maxGroupSize: 10,
        idealGroupSize: 5,
        idealMaleRatio: 0.2,  // Matriarchal herds
        spacePerAnimal: 15,  // Elephants need lots of space
    },

    breedingConfig: {
        gestationDays: 660,  // ~22 months, longest of any land animal
        breedingCooldown: 1460,  // 4 years between calves
        minBreedingAge: 3650,  // 10 years
        breedingChance: 0.25,
        litterSizeProbabilities: { 1: 0.99, 2: 0.01 },  // Almost always single calf
        minBreedingHappiness: 75,
    },
};

/**
 * African Elephant class
 */
export class Elephant extends Animal {
    public readonly scale: number = 2.5;  // Elephants are huge

    // Elephant-specific colors
    public readonly bodyColor: number = 0x7a7a7a;  // Gray
    public readonly earColor: number = 0x8a8a8a;
    public readonly tuskColor: number = 0xf5f5dc;  // Ivory

    constructor(game: Game, tileX: number, tileY: number, gender?: Gender) {
        const config: AnimalConfig = {
            speciesName: ElephantInfo.speciesName,
            species: 'elephant',
            biome: ElephantInfo.biome,
            gender,
            speed: 0.9,  // Slow but steady
            hungerDecay: 0.8,  // Elephants eat a lot
            preferredFood: ElephantInfo.preferredFood,
            terrainNeeds: ElephantInfo.terrainNeeds,
            foliageNeeds: ElephantInfo.foliageNeeds,
            socialNeeds: ElephantInfo.socialNeeds,
            needsShelter: false,  // Elephants don't need shelter
            maturityAge: 3650,  // 10 years
            breedingConfig: ElephantInfo.breedingConfig,
            waterAffinity: ElephantInfo.waterAffinity,
            waterSpriteCutoff: ElephantInfo.waterSpriteCutoff,
        };

        super(game, tileX, tileY, config);
    }

    getIcon(): string {
        return '🐘';
    }
}
