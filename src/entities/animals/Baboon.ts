import { Animal, AnimalConfig } from '../Animal';
import type { Game } from '../../core/Game';
import type { Gender } from '../../core/types';

/**
 * Olive Baboon species information
 */
export const BaboonInfo = {
    speciesName: 'Olive Baboon',
    scientificName: 'Papio anubis',
    description: 'The olive baboon is a large Old World monkey found across central Africa, known for its olive-green coat.',
    preferredFood: ['fruit', 'vegetables'],
    lifespan: '25-30 years',
    size: 'Medium',
    temperament: 'Social',
    biome: 'savanna_grass',
    waterAffinity: 0.05,  // Baboons occasionally swim
    waterSpriteCutoff: 8,

    terrainNeeds: {
        savanna_grass: 0.4,
        grass: 0.3,
        brown_stone: 0.2,  // Baboons like rocky outcrops
    },

    foliageNeeds: {
        baobab: 0.2,
        umbrella_thorn: 0.15,
        tall_grass: 0.1,
    },

    socialNeeds: {
        minGroupSize: 4,
        maxGroupSize: 20,
        idealGroupSize: 10,
        idealMaleRatio: 0.3,
        spacePerAnimal: 5,  // Baboons are social, need less space each
    },

    breedingConfig: {
        gestationDays: 180,  // 6 months
        breedingCooldown: 365,
        minBreedingAge: 1095,  // 3 years
        breedingChance: 0.4,
        litterSizeProbabilities: { 1: 0.95, 2: 0.05 },
        minBreedingHappiness: 65,
    },
};

/**
 * Olive Baboon class
 */
export class Baboon extends Animal {
    public readonly scale: number = 0.8;

    // Baboon-specific colors
    public readonly bodyColor: number = 0x6b7b3a;  // Olive green-brown
    public readonly faceColor: number = 0x4a3a2a;  // Dark face
    public readonly muzzleColor: number = 0x3a2a1a;

    constructor(game: Game, tileX: number, tileY: number, gender?: Gender) {
        const config: AnimalConfig = {
            speciesName: BaboonInfo.speciesName,
            species: 'baboon',
            biome: BaboonInfo.biome,
            gender,
            speed: 1.4,  // Baboons are quick
            hungerDecay: 0.5,
            preferredFood: BaboonInfo.preferredFood,
            terrainNeeds: BaboonInfo.terrainNeeds,
            foliageNeeds: BaboonInfo.foliageNeeds,
            socialNeeds: BaboonInfo.socialNeeds,
            needsShelter: false,
            maturityAge: 1095,  // 3 years
            breedingConfig: BaboonInfo.breedingConfig,
            waterAffinity: BaboonInfo.waterAffinity,
            waterSpriteCutoff: BaboonInfo.waterSpriteCutoff,
        };

        super(game, tileX, tileY, config);
    }

    getIcon(): string {
        return '🐒';
    }
}
