import { Entity } from './Entity';
import type { Game } from '../core/Game';
import type { EntityType, Gender, AnimalState, AnimalSpecies } from '../core/types';
import type { Placeable } from './Placeable';

/**
 * Animal configuration interface
 */
export interface AnimalConfig {
    speciesName: string;
    species: string;
    biome: string;
    gender?: Gender;
    speed?: number;
    hungerDecay?: number;
    preferredFood?: string[];
    terrainNeeds?: Record<string, number>;
    foliageNeeds?: Record<string, number>;
    socialNeeds?: {
        minGroupSize: number;
        maxGroupSize: number;
        idealGroupSize: number;
        idealMaleRatio: number;
        solitary?: boolean;
        spacePerAnimal?: number;  // Tiles needed per animal
    };
    needsShelter?: boolean;  // Whether this animal needs shelter for happiness
    maturityAge?: number;
    breedingConfig?: BreedingConfig;
    waterAffinity?: number;  // 0-1: How much the animal likes water (0 = avoids, 1 = loves)
    waterSpriteCutoff?: number;  // Pixels to cut from bottom of sprite when in water
}

export interface BreedingConfig {
    gestationDays: number;
    breedingCooldown: number;
    minBreedingAge: number;
    breedingChance: number;
    litterSizeProbabilities: Record<number, number>;
    minBreedingHappiness?: number;  // Minimum happiness % to breed (default 30)
}

/**
 * Base Animal class - handles animal behavior, stats, and breeding
 */
export abstract class Animal extends Entity {
    public readonly type: EntityType = 'animal';

    // Identity
    public name: string;
    public readonly speciesName: string;
    public readonly species: string;
    public readonly biome: string;
    public gender: Gender;

    // Visual scale (for rendering - can be overridden by subclasses)
    public readonly scale: number = 1;

    // Stats (0-100)
    public hunger: number = 100;
    public happiness: number = 100;
    public health: number = 100;
    public energy: number = 100;

    // Decay rates
    protected hungerDecay: number;
    protected energyDecay: number = 0.3;  // Energy decays slower than hunger
    protected energyRestore: number = 5;  // Energy restored per second while resting

    // Age (in game days)
    public age: number = 0;
    protected ageTimer: number = 0;
    protected maturityAge: number;

    // State
    public state: AnimalState = 'idle';
    protected stateTimer: number = 0;
    protected stateDuration: number = 0;

    // Eating
    protected targetFoodPile: any = null; // Will be typed properly when FoodPile is created
    protected eatTimer: number = 0;
    protected eatDuration: number = 2;

    // Shelter/Resting
    protected targetShelter: Placeable | null = null;
    protected shelterInteractionIndex: number = -1;
    protected shelterEntranceX: number = 0;  // The entrance tile (inside shelter)
    protected shelterEntranceY: number = 0;
    protected shelterApproachX: number = 0;  // The tile in front of entrance (outside shelter)
    protected shelterApproachY: number = 0;
    protected restingTimer: number = 0;
    protected restingDuration: number = 0;
    public insideShelter: boolean = false;  // True when hidden inside a shelter

    // Swimming
    protected swimCheckTimer: number = 0;
    protected swimCheckInterval: number = 30;  // Will be randomized 20-40 seconds
    protected swimTimer: number = 0;
    protected swimDuration: number = 0;
    protected targetWaterX: number = 0;
    protected targetWaterY: number = 0;

    // Breeding
    protected isPregnant: boolean = false;
    protected pregnancyTimer: number = 0;
    protected lastBirthDay: number = -999;
    protected mateId: number | null = null;
    protected mateName: string | null = null;
    protected breedingConfig: BreedingConfig;

    // Parent info
    public mother: { name: string; speciesName: string } | null = null;
    public father: { name: string; speciesName: string } | null = null;

    // Needs/preferences
    public preferredFood: string[];
    public terrainNeeds: Record<string, number>;
    public foliageNeeds: Record<string, number>;
    public socialNeeds: AnimalConfig['socialNeeds'];
    public needsShelter: boolean;
    public waterAffinity: number;  // 0-1: How much the animal likes water
    public waterSpriteCutoff: number;  // Pixels to cut from bottom of sprite when in water

    // Happiness calculation
    protected happinessCheckTimer: number = 0;
    protected happinessCheckInterval: number = 2;

    // Happiness factors for breakdown display (value and reason if not 100%)
    public happinessFactors: {
        hunger: { value: number; reason: string };
        health: { value: number; reason: string };
        energy: { value: number; reason: string };
        space: { value: number; reason: string };
        social: { value: number; reason: string };
        terrain: { value: number; reason: string };
        foliage: { value: number; reason: string };
        shelter: { value: number; reason: string };
    } = {
        hunger: { value: 100, reason: '' },
        health: { value: 100, reason: '' },
        energy: { value: 100, reason: '' },
        space: { value: 100, reason: '' },
        social: { value: 100, reason: '' },
        terrain: { value: 100, reason: '' },
        foliage: { value: 100, reason: '' },
        shelter: { value: 100, reason: '' },
    };

    constructor(game: Game, tileX: number, tileY: number, config: AnimalConfig) {
        super(game, tileX, tileY);

        this.speciesName = config.speciesName;
        this.species = config.species;
        this.biome = config.biome;
        this.gender = config.gender || (Math.random() > 0.5 ? 'male' : 'female');
        this.speed = config.speed || 1.2;
        this.hungerDecay = config.hungerDecay || 0.5;
        this.maturityAge = config.maturityAge || 365;

        // Generate name
        this.name = `${this.speciesName} #${this.id}`;

        // Needs
        this.preferredFood = config.preferredFood || ['meat'];
        this.terrainNeeds = config.terrainNeeds || {};
        this.foliageNeeds = config.foliageNeeds || {};
        this.socialNeeds = config.socialNeeds;
        this.needsShelter = config.needsShelter || false;
        this.waterAffinity = config.waterAffinity || 0;
        this.waterSpriteCutoff = config.waterSpriteCutoff || 8;  // Default 8 pixels

        // Breeding config with defaults
        this.breedingConfig = config.breedingConfig || {
            gestationDays: 110,
            breedingCooldown: 365,
            minBreedingAge: 730,
            breedingChance: 0.3,
            litterSizeProbabilities: { 1: 0.6, 2: 0.3, 3: 0.1 },
        };

        // Start with a random initial behavior
        this.chooseNextAction();
    }

    /**
     * Update animal
     */
    update(dt: number): void {
        this.updateStats(dt);
        this.updateAging(dt);
        this.updateBreeding(dt);
        this.updateState(dt);
        this.updateEating(dt);
        this.updateResting(dt);
        this.updateSwimming(dt);
        this.updateMovement(dt);
    }

    /**
     * Update stats (hunger decay, energy decay, happiness calculation)
     */
    protected updateStats(dt: number): void {
        // Hunger decay
        this.hunger = Math.max(0, this.hunger - this.hungerDecay * dt);

        // Energy decay (only when not resting inside shelter)
        if (!this.insideShelter) {
            this.energy = Math.max(0, this.energy - this.energyDecay * dt);
        }

        // Health affected by hunger
        if (this.hunger < 20) {
            this.health = Math.max(0, this.health - dt * 0.5);
        } else if (this.hunger > 50 && this.health < 100) {
            this.health = Math.min(100, this.health + dt * 0.2);
        }

        // Periodic happiness recalculation
        this.happinessCheckTimer += dt;
        if (this.happinessCheckTimer >= this.happinessCheckInterval) {
            this.happinessCheckTimer = 0;
            this.calculateHappiness();
        }
    }

    /**
     * Calculate happiness based on needs using subtractive penalty system.
     * Starts at 100% and subtracts penalties for each deficient factor.
     * This makes it harder to achieve 100% happiness - requires all needs met.
     */
    protected calculateHappiness(): void {
        // Penalty weights - how much each factor can subtract at worst (factor = 0)
        const penaltyWeights = {
            hunger: 0.25,   // Max 25% penalty
            health: 0.20,   // Max 20% penalty
            energy: 0.10,   // Max 10% penalty
            terrain: 0.15,  // Max 15% penalty
            social: 0.15,   // Max 15% penalty
            foliage: 0.10,  // Max 10% penalty
            space: 0.10,    // Max 10% penalty
            shelter: 0.10,  // Max 10% penalty (only if needed)
        };

        let totalPenalty = 0;
        const exhibit = this.game.getExhibitAtTile?.(this.tileX, this.tileY);

        // Hunger - penalty based on how hungry
        const hungerFactor = this.hunger;
        let hungerReason = '';
        if (hungerFactor < 100) {
            if (hungerFactor < 30) hungerReason = 'Starving! Needs food urgently';
            else if (hungerFactor < 60) hungerReason = 'Very hungry';
            else hungerReason = 'Getting hungry';
        }
        totalPenalty += (100 - hungerFactor) * penaltyWeights.hunger;

        // Health - penalty based on health level
        const healthFactor = this.health;
        let healthReason = '';
        if (healthFactor < 100) {
            if (healthFactor < 30) healthReason = 'Critically ill!';
            else if (healthFactor < 60) healthReason = 'Sick - needs medical attention';
            else healthReason = 'Minor health issue';
        }
        totalPenalty += (100 - healthFactor) * penaltyWeights.health;

        // Energy - penalty based on tiredness
        const energyFactor = this.energy;
        let energyReason = '';
        if (energyFactor < 100) {
            if (energyFactor < 30) energyReason = 'Exhausted! Needs rest';
            else if (energyFactor < 60) energyReason = 'Very tired';
            else energyReason = 'Getting tired';
        }
        totalPenalty += (100 - energyFactor) * penaltyWeights.energy;

        // Space satisfaction - check exhibit size
        let spaceFactor = 70;
        let spaceReason = 'Not in an exhibit';
        if (exhibit) {
            const exhibitSize = exhibit.getTileCount?.() || 50;
            const animalsInExhibit = this.game.getAnimalsInExhibit?.(exhibit)?.length || 1;
            const spacePerAnimal = exhibitSize / animalsInExhibit;
            spaceFactor = Math.min(100, Math.round(spacePerAnimal * 10));
            if (spaceFactor >= 100) {
                spaceReason = '';
            } else if (spacePerAnimal < 5) {
                spaceReason = 'Exhibit very overcrowded';
            } else if (spacePerAnimal < 8) {
                spaceReason = 'Exhibit too small';
            } else {
                spaceReason = 'Could use more space';
            }
        }
        totalPenalty += (100 - spaceFactor) * penaltyWeights.space;

        // Social needs - check group composition and exhibit capacity
        let socialFactor = 70;
        let socialReason = 'Not in an exhibit';
        if (this.socialNeeds && exhibit) {
            const animalsInExhibit = this.game.getAnimalsInExhibit?.(exhibit) || [];
            const sameSpecies = animalsInExhibit.filter((a: Animal) => a.speciesName === this.speciesName);
            const groupSize = sameSpecies.length;

            // Calculate exhibit capacity based on spacePerAnimal
            const exhibitSize = exhibit.getTileCount?.() || 50;
            const spacePerAnimal = this.socialNeeds.spacePerAnimal || 8;
            const maxCapacity = Math.floor(exhibitSize / spacePerAnimal);

            // Scale ideal/max group sizes based on exhibit capacity
            const { minGroupSize, maxGroupSize, idealGroupSize } = this.socialNeeds;
            const effectiveMaxGroup = Math.min(maxGroupSize, maxCapacity);
            const effectiveIdealGroup = Math.min(idealGroupSize, maxCapacity);

            if (this.socialNeeds.solitary) {
                socialFactor = groupSize === 1 ? 100 : Math.max(20, 100 - (groupSize - 1) * 20);
                socialReason = groupSize === 1 ? '' : `Too many companions (${groupSize - 1} extra)`;
            } else {
                // Check if overcrowded based on exhibit capacity
                if (groupSize > maxCapacity) {
                    const overcrowded = groupSize - maxCapacity;
                    socialFactor = Math.max(20, 60 - overcrowded * 10);
                    socialReason = `Exhibit overcrowded (${overcrowded} too many for space)`;
                } else if (groupSize < minGroupSize) {
                    socialFactor = Math.round((groupSize / minGroupSize) * 60);
                    socialReason = `Needs ${minGroupSize - groupSize} more companions`;
                } else if (groupSize > effectiveMaxGroup) {
                    socialFactor = Math.max(30, 100 - (groupSize - effectiveMaxGroup) * 15);
                    socialReason = `Group too large for exhibit (${groupSize - effectiveMaxGroup} extra)`;
                } else if (groupSize === effectiveIdealGroup) {
                    socialFactor = 100;
                    socialReason = '';
                } else if (groupSize >= minGroupSize && groupSize <= effectiveMaxGroup) {
                    // Within acceptable range
                    const distanceFromIdeal = Math.abs(groupSize - effectiveIdealGroup);
                    socialFactor = Math.max(75, 100 - distanceFromIdeal * 5);
                    socialReason = groupSize < effectiveIdealGroup
                        ? `Would prefer ${effectiveIdealGroup - groupSize} more companions`
                        : 'Group slightly large for exhibit';
                } else {
                    socialFactor = 80;
                    socialReason = groupSize < minGroupSize
                        ? `Needs ${minGroupSize - groupSize} more companions`
                        : 'Group composition not ideal';
                }
            }
        }
        totalPenalty += (100 - socialFactor) * penaltyWeights.social;

        // Terrain satisfaction - check terrain composition vs needs
        let terrainFactor = 70;
        let terrainReason = 'Not in an exhibit';
        if (exhibit && Object.keys(this.terrainNeeds).length > 0) {
            const result = this.calculateTerrainSatisfaction(exhibit);
            terrainFactor = result.value;
            terrainReason = result.reason;
        }
        totalPenalty += (100 - terrainFactor) * penaltyWeights.terrain;

        // Foliage satisfaction - check foliage in exhibit vs needs
        let foliageFactor = 70;
        let foliageReason = 'Not in an exhibit';
        if (exhibit && Object.keys(this.foliageNeeds).length > 0) {
            const result = this.calculateFoliageSatisfaction(exhibit);
            foliageFactor = result.value;
            foliageReason = result.reason;
        }
        totalPenalty += (100 - foliageFactor) * penaltyWeights.foliage;

        // Shelter satisfaction (only if animal needs shelter)
        let shelterFactor = 100;
        let shelterReason = '';
        if (this.needsShelter) {
            if (exhibit) {
                const result = this.calculateShelterSatisfaction(exhibit);
                shelterFactor = result.value;
                shelterReason = result.reason;
            } else {
                shelterFactor = 0;
                shelterReason = 'Not in an exhibit';
            }
            totalPenalty += (100 - shelterFactor) * penaltyWeights.shelter;
        }

        // Store individual factors with reasons
        this.happinessFactors = {
            hunger: { value: Math.round(hungerFactor), reason: hungerReason },
            health: { value: Math.round(healthFactor), reason: healthReason },
            energy: { value: Math.round(energyFactor), reason: energyReason },
            space: { value: Math.round(spaceFactor), reason: spaceReason },
            social: { value: Math.round(socialFactor), reason: socialReason },
            terrain: { value: Math.round(terrainFactor), reason: terrainReason },
            foliage: { value: Math.round(foliageFactor), reason: foliageReason },
            shelter: { value: Math.round(shelterFactor), reason: shelterReason },
        };

        // Final happiness = 100 minus all penalties, clamped to 0-100
        this.happiness = Math.round(Math.max(0, Math.min(100, 100 - totalPenalty)));
    }

    /**
     * Calculate terrain satisfaction based on exhibit composition
     * Animals have a sweet spot (±5%) for each terrain type
     * Any terrain NOT in their needs is considered disliked
     */
    protected calculateTerrainSatisfaction(exhibit: any): { value: number; reason: string } {
        const interiorTiles = exhibit.interiorTiles || [];
        if (interiorTiles.length === 0) return { value: 50, reason: 'Empty exhibit' };

        const terrainNames: Record<string, string> = {
            grass: 'Grass', prairie: 'Prairie', savanna_grass: 'Savannah Grass', sand: 'Sand', dirt: 'Dirt',
            rainforest_floor: 'Rainforest Floor', brown_stone: 'Brown Stone', gray_stone: 'Gray Stone',
            gravel: 'Gravel', snow: 'Snow', fresh_water: 'Fresh Water', salt_water: 'Salt Water',
            deciduous_floor: 'Deciduous Floor', coniferous_floor: 'Coniferous Floor'
        };

        // Count terrain types in exhibit
        const terrainCounts: Record<string, number> = {};
        for (const tilePos of interiorTiles) {
            const tile = this.game.world.getTile(tilePos.x, tilePos.y);
            if (tile) {
                const terrain = tile.terrain || 'grass';
                terrainCounts[terrain] = (terrainCounts[terrain] || 0) + 1;
            }
        }

        const reasons: string[] = [];
        let totalPenalty = 0;

        // Check for terrain NOT in needs (any terrain not listed is disliked)
        const likedTerrains = Object.keys(this.terrainNeeds);
        for (const [terrain, count] of Object.entries(terrainCounts)) {
            if (!likedTerrains.includes(terrain) && count > 0) {
                const ratio = count / interiorTiles.length;
                const penalty = ratio * 50; // Up to 50% penalty based on how much disliked terrain
                totalPenalty += penalty;
                const name = terrainNames[terrain] || terrain;
                reasons.push(`Dislikes ${name} (${Math.round(ratio * 100)}%)`);
            }
        }

        // Calculate satisfaction for each needed terrain (with ±5% sweet spot)
        let satisfaction = 0;
        let totalWeight = 0;
        const SWEET_SPOT = 0.05; // ±5%

        for (const [terrain, neededRatio] of Object.entries(this.terrainNeeds)) {
            const ratio = neededRatio as number;
            const actualCount = terrainCounts[terrain] || 0;
            const actualRatio = actualCount / interiorTiles.length;

            let terrainSatisfaction: number;
            const minIdeal = ratio - SWEET_SPOT;
            const maxIdeal = ratio + SWEET_SPOT;

            if (actualRatio >= minIdeal && actualRatio <= maxIdeal) {
                // Within sweet spot - 100% satisfaction
                terrainSatisfaction = 1;
            } else if (actualRatio < minIdeal) {
                // Too little of this terrain
                terrainSatisfaction = actualRatio / ratio;
                const name = terrainNames[terrain] || terrain;
                const needed = Math.round(ratio * 100);
                const actual = Math.round(actualRatio * 100);
                reasons.push(`Needs more ${name} (${actual}%/${needed}%)`);
            } else {
                // Too much of this terrain (beyond sweet spot)
                const excess = actualRatio - maxIdeal;
                terrainSatisfaction = Math.max(0.5, 1 - excess * 2);
                const name = terrainNames[terrain] || terrain;
                reasons.push(`Too much ${name} (${Math.round(actualRatio * 100)}%)`);
            }

            satisfaction += terrainSatisfaction * ratio;
            totalWeight += ratio;
        }

        if (totalWeight === 0) {
            // No terrain preferences, check if there's disliked terrain
            return { value: Math.max(0, Math.round(100 - totalPenalty)), reason: reasons.join(', ') };
        }

        let value = Math.round((satisfaction / totalWeight) * 100);
        value = Math.max(0, value - totalPenalty);

        return { value, reason: reasons.join(', ') };
    }

    /**
     * Calculate foliage satisfaction based on exhibit foliage
     * Animals want a certain number of each foliage type based on exhibit size
     * foliageNeeds values represent how many per tile (e.g., 0.15 = 15% of tiles)
     * Animals have a sweet spot (±5%) - too much foliage also makes them unhappy
     * Any foliage NOT in their needs is considered disliked
     */
    protected calculateFoliageSatisfaction(exhibit: any): { value: number; reason: string } {
        const interiorTiles = exhibit.interiorTiles || [];
        if (interiorTiles.length === 0) return { value: 50, reason: 'Empty exhibit' };

        const foliageNames: Record<string, string> = {
            acacia: 'Acacia', tall_grass: 'Tall Grass',
            prairie_grass: 'Prairie Grass', shrub: 'Shrubs', wildflowers: 'Wildflowers'
        };

        // Get foliage in exhibit
        const foliageInExhibit = this.game.getFoliageInExhibit?.(exhibit) || [];

        // Count foliage types
        const foliageCounts: Record<string, number> = {};
        for (const foliage of foliageInExhibit) {
            const type = foliage.foliageType;
            foliageCounts[type] = (foliageCounts[type] || 0) + 1;
        }

        const reasons: string[] = [];
        let totalPenalty = 0;

        // Check for foliage NOT in needs (any foliage not listed is disliked)
        const likedFoliage = Object.keys(this.foliageNeeds);
        for (const [foliageType, count] of Object.entries(foliageCounts)) {
            if (!likedFoliage.includes(foliageType) && count > 0) {
                const penalty = Math.min(50, count * 10); // Up to 50% penalty
                totalPenalty += penalty;
                const name = foliageNames[foliageType] || foliageType;
                reasons.push(`Dislikes ${name} (${count} in exhibit)`);
            }
        }

        // Calculate satisfaction for each needed foliage (with ±5% sweet spot)
        let totalSatisfaction = 0;
        let totalWeight = 0;
        const SWEET_SPOT = 0.05; // ±5%

        for (const [foliageType, needRatio] of Object.entries(this.foliageNeeds)) {
            const ratio = needRatio as number;
            const actualCount = foliageCounts[foliageType] || 0;

            // Calculate ideal count based on exhibit size
            const neededCount = Math.max(1, Math.ceil(ratio * interiorTiles.length));
            const actualRatio = actualCount / interiorTiles.length;

            // Calculate sweet spot bounds
            const minIdeal = ratio - SWEET_SPOT;
            const maxIdeal = ratio + SWEET_SPOT;

            let typeSatisfaction: number;

            if (actualRatio >= minIdeal && actualRatio <= maxIdeal) {
                // Within sweet spot - 100% satisfaction
                typeSatisfaction = 1;
            } else if (actualRatio < minIdeal) {
                // Too little of this foliage
                typeSatisfaction = ratio > 0 ? actualRatio / ratio : 1;
                const name = foliageNames[foliageType] || foliageType;
                const needed = neededCount - actualCount;
                if (actualCount === 0) {
                    reasons.push(`Needs ${needed} ${name}`);
                } else {
                    reasons.push(`Needs ${needed} more ${name}`);
                }
            } else {
                // Too much of this foliage (beyond sweet spot)
                const excess = actualRatio - maxIdeal;
                typeSatisfaction = Math.max(0.5, 1 - excess * 2);
                const name = foliageNames[foliageType] || foliageType;
                reasons.push(`Too much ${name} (${actualCount})`);
            }

            // Weight by the need ratio (higher needs count more)
            totalSatisfaction += typeSatisfaction * ratio;
            totalWeight += ratio;
        }

        let value: number;

        if (totalWeight === 0) {
            // No foliage needs defined, check if there's disliked foliage
            value = Math.max(0, Math.round(100 - totalPenalty));
        } else {
            value = Math.round((totalSatisfaction / totalWeight) * 100);
            value = Math.max(0, value - totalPenalty);
        }

        return { value, reason: reasons.join(', ') };
    }

    /**
     * Calculate shelter satisfaction based on shelter capacity vs animal count
     */
    protected calculateShelterSatisfaction(exhibit: any): { value: number; reason: string } {
        // Get shelters in the exhibit
        const shelters = this.game.getSheltersInExhibit?.(exhibit) || [];

        if (shelters.length === 0) {
            return { value: 0, reason: 'No shelter in exhibit' };
        }

        // Calculate total shelter capacity
        let totalCapacity = 0;
        for (const shelter of shelters) {
            // Get capacity from the shelter's interaction points
            const interactions = shelter.getInteractionPoints();
            for (const point of interactions) {
                if (point.type === 'enter') {
                    totalCapacity += point.capacity || 1;
                }
            }
        }

        // Count animals that need shelter in this exhibit
        const animalsInExhibit = this.game.getAnimalsInExhibit?.(exhibit) || [];
        const animalsNeedingShelter = animalsInExhibit.filter((a: Animal) => a.needsShelter).length;

        if (animalsNeedingShelter === 0) {
            return { value: 100, reason: '' };
        }

        // Calculate satisfaction based on capacity vs need
        const ratio = totalCapacity / animalsNeedingShelter;

        if (ratio >= 1) {
            // Enough shelter for everyone
            return { value: 100, reason: '' };
        } else if (ratio >= 0.75) {
            // Almost enough
            const shortage = animalsNeedingShelter - totalCapacity;
            return {
                value: 75,
                reason: `Shelter space for ${shortage} more animal${shortage > 1 ? 's' : ''} needed`
            };
        } else if (ratio >= 0.5) {
            // Half capacity
            const shortage = animalsNeedingShelter - totalCapacity;
            return {
                value: 50,
                reason: `Not enough shelter (need space for ${shortage} more)`
            };
        } else {
            // Severe shortage
            const shortage = animalsNeedingShelter - totalCapacity;
            return {
                value: Math.round(ratio * 50),
                reason: `Shelter critically insufficient (need ${shortage} more spaces)`
            };
        }
    }

    /**
     * Update aging
     */
    protected updateAging(dt: number): void {
        this.ageTimer += dt;
        const dayLength = this.game.config.simTickRate > 0
            ? (10000 / this.game.speed) / 1000
            : 10;

        if (this.ageTimer >= dayLength) {
            this.ageTimer -= dayLength;
            this.age++;
            this.checkBreeding();
        }
    }

    /**
     * Update breeding
     */
    protected updateBreeding(_dt: number): void {
        // Breeding is checked daily in updateAging
    }

    /**
     * Check breeding conditions
     */
    protected checkBreeding(): void {
        if (this.gender !== 'female') return;
        if (!this.isAdult()) return;

        if (this.isPregnant) {
            this.pregnancyTimer++;
            if (this.pregnancyTimer >= this.breedingConfig.gestationDays) {
                this.giveBirth();
            }
            return;
        }

        // Check cooldown
        const daysSinceLastBirth = this.age - this.lastBirthDay;
        if (daysSinceLastBirth < this.breedingConfig.breedingCooldown) return;
        if (this.age < this.breedingConfig.minBreedingAge) return;

        // Check for compatible male in exhibit
        const exhibit = this.game.getExhibitAtTile?.(this.tileX, this.tileY);
        if (!exhibit) return;

        const animals = this.game.getAnimalsInExhibit?.(exhibit);
        if (!animals) return;

        const compatibleMale = animals.find((a: Animal) =>
            a.speciesName === this.speciesName &&
            a.gender === 'male' &&
            a.isAdult() &&
            a.health > 30
        );

        if (!compatibleMale) return;

        // Check health and happiness thresholds
        const minHappiness = this.breedingConfig.minBreedingHappiness ?? 30;
        if (this.health < 30 || this.happiness < minHappiness) return;

        // Roll for breeding
        if (Math.random() < this.breedingConfig.breedingChance) {
            this.isPregnant = true;
            this.pregnancyTimer = 0;
            this.mateId = compatibleMale.id;
            this.mateName = compatibleMale.name;
        }
    }

    /**
     * Give birth
     */
    protected giveBirth(): void {
        this.isPregnant = false;
        this.lastBirthDay = this.age;
        this.pregnancyTimer = 0;

        const litterSize = this.rollLitterSize();

        for (let i = 0; i < litterSize; i++) {
            this.spawnBaby();
        }
    }

    /**
     * Roll for litter size
     */
    protected rollLitterSize(): number {
        const probs = this.breedingConfig.litterSizeProbabilities;
        const roll = Math.random();
        let cumulative = 0;

        for (const [size, prob] of Object.entries(probs)) {
            cumulative += prob;
            if (roll < cumulative) {
                return parseInt(size);
            }
        }

        return 1;
    }

    /**
     * Spawn a baby animal
     */
    protected spawnBaby(): void {
        const gender: Gender = Math.random() > 0.5 ? 'male' : 'female';

        // Find valid spawn position in exhibit
        const exhibit = this.game.getExhibitAtTile?.(this.tileX, this.tileY);
        let babyX = this.tileX;
        let babyY = this.tileY;

        if (exhibit) {
            for (let attempt = 0; attempt < 5; attempt++) {
                const offsetX = Math.round((Math.random() - 0.5) * 2);
                const offsetY = Math.round((Math.random() - 0.5) * 2);
                const testX = this.tileX + offsetX;
                const testY = this.tileY + offsetY;

                if (exhibit.containsTile?.(testX, testY)) {
                    const tile = this.game.world.getTile(testX, testY);
                    if (tile && tile.terrain !== 'fresh_water' && tile.terrain !== 'salt_water') {
                        babyX = testX;
                        babyY = testY;
                        break;
                    }
                }
            }
        }

        // Spawn the baby
        this.game.spawnBabyAnimal?.(this.species as AnimalSpecies, babyX, babyY, gender);
    }

    /**
     * Update state machine
     */
    protected updateState(dt: number): void {
        this.stateTimer += dt;

        if (this.stateTimer >= this.stateDuration) {
            this.chooseNextAction();
        }
    }

    /**
     * Choose next action based on needs
     */
    protected chooseNextAction(): void {
        // Priority 1: Eat if hungry
        if (this.hunger < 50 && this.state !== 'eating') {
            const foodPile = this.findNearbyFood();
            if (foodPile) {
                this.targetFoodPile = foodPile;
                this.eatTimer = 0;
                this.setState('eating', 30);
                return;
            }
        }

        // Priority 2: Seek shelter when energy is low, or occasionally (10% chance)
        const needsRest = this.energy < 40;
        const wantsRest = Math.random() < 0.10;
        if ((needsRest || wantsRest) && this.state !== 'resting') {
            if (needsRest) {
                console.log(`${this.name} (${this.species}) is tired (energy: ${Math.round(this.energy)}%), seeking shelter...`);
            }
            const shelter = this.findNearbyShelter();
            if (shelter) {
                console.log(`${this.name} found shelter, heading to rest!`);
                this.targetShelter = shelter.shelter;
                this.shelterInteractionIndex = shelter.interactionIndex;
                this.shelterEntranceX = shelter.entranceX;
                this.shelterEntranceY = shelter.entranceY;
                this.shelterApproachX = shelter.approachX;
                this.shelterApproachY = shelter.approachY;
                this.restingDuration = 5 + Math.random() * 10; // 5-15 seconds inside
                this.setState('resting', 60); // Long timeout to reach shelter
                return;
            } else if (needsRest) {
                console.log(`${this.name} could not find shelter to rest`);
            }
        }

        // Priority 3: Random behavior
        if (Math.random() < 0.6) {
            this.setState('walking', 3 + Math.random() * 2);
            this.pickRandomTarget();
        } else {
            this.setState('idle', 2 + Math.random() * 3);
        }
    }

    /**
     * Set state with duration
     */
    protected setState(state: AnimalState, duration: number): void {
        this.state = state;
        this.stateTimer = 0;
        this.stateDuration = duration;
    }

    /**
     * Update eating behavior
     */
    protected updateEating(dt: number): void {
        if (this.state !== 'eating' || !this.targetFoodPile) return;

        // Check if at food pile
        if (this.tileX === this.targetFoodPile.tileX &&
            this.tileY === this.targetFoodPile.tileY) {
            this.clearPath();
            this.eatTimer += dt;

            if (this.eatTimer >= this.eatDuration) {
                this.eatTimer = 0;

                const consumed = this.targetFoodPile.consume?.(20) || 20;
                if (consumed > 0) {
                    this.hunger = Math.min(100, this.hunger + consumed * 0.5);
                }

                if (this.hunger >= 80 || this.targetFoodPile.isEmpty?.()) {
                    this.targetFoodPile = null;
                    this.setState('idle', 2);
                }
            }
        } else {
            // Move towards food
            this.moveTowardsFoodPile();
        }
    }

    /**
     * Update resting behavior (heading to and staying in shelter)
     */
    protected updateResting(dt: number): void {
        if (this.state !== 'resting' || !this.targetShelter) return;

        // Get the interaction point position
        const interactionPoint = this.targetShelter.getEntityReservation(this.id);
        if (!interactionPoint) {
            // Lost our reservation, cancel resting
            console.log(`${this.name} lost shelter reservation, canceling rest`);
            this.exitShelter();
            return;
        }

        // If already inside the shelter
        if (this.insideShelter) {
            this.restingTimer += dt;

            // Restore energy while resting
            this.energy = Math.min(100, this.energy + this.energyRestore * dt);

            // Stay still while inside
            this.clearPath();

            // Check if done resting (when energy is full or time is up)
            if (this.energy >= 100 || this.restingTimer >= this.restingDuration) {
                console.log(`${this.name} done resting (energy: ${Math.round(this.energy)}%), exiting shelter`);
                this.exitShelter();
            }
            return;
        }

        // Check if we've reached the entrance tile
        if (this.tileX === this.shelterEntranceX && this.tileY === this.shelterEntranceY) {
            // Enter the shelter
            console.log(`${this.name} reached shelter entrance, entering!`);
            this.enterShelter();
            return;
        }

        // Check if we're at the approach tile - step into the entrance
        if (this.tileX === this.shelterApproachX && this.tileY === this.shelterApproachY) {
            if (!this.isMoving) {
                console.log(`${this.name} at approach tile, stepping into entrance`);
                // Directly move to entrance tile
                this.targetTileX = this.shelterEntranceX;
                this.targetTileY = this.shelterEntranceY;
                this.isMoving = true;
            }
            return;
        }

        // Move towards the approach tile (outside the shelter)
        if (!this.isMoving && !this.pathPending) {
            // Check if we need a new path
            if (this.currentPath.length === 0 ||
                !this.pathTarget ||
                this.pathTarget.x !== this.shelterApproachX ||
                this.pathTarget.y !== this.shelterApproachY) {

                // Debug: check if approach tile is valid
                const approachTile = this.game.world.getTile(this.shelterApproachX, this.shelterApproachY);
                console.log(`${this.name} requesting path to approach tile (${this.shelterApproachX}, ${this.shelterApproachY}) from (${this.tileX}, ${this.tileY})`);
                console.log(`  - Approach tile terrain: ${approachTile?.terrain}, path: ${approachTile?.path}, fences: N=${approachTile?.fences?.north}, S=${approachTile?.fences?.south}, E=${approachTile?.fences?.east}, W=${approachTile?.fences?.west}`);

                this.requestPath(this.shelterApproachX, this.shelterApproachY, false, false, undefined, this.waterAffinity).then(success => {
                    if (!success) {
                        // Can't reach shelter, give up
                        console.log(`${this.name} FAILED to path to shelter approach, giving up`);
                        this.exitShelter();
                    } else {
                        console.log(`${this.name} got path to approach tile, length: ${this.currentPath.length}`);
                    }
                });
            }
        }
    }

    /**
     * Enter a shelter (become hidden)
     */
    protected enterShelter(): void {
        this.insideShelter = true;
        this.restingTimer = 0;
        this.clearPath();
    }

    /**
     * Exit a shelter (become visible again)
     */
    protected exitShelter(): void {
        this.insideShelter = false;
        this.restingTimer = 0;

        // Release the shelter reservation
        if (this.targetShelter) {
            this.targetShelter.releaseInteraction(this.id);
        }

        this.targetShelter = null;
        this.shelterInteractionIndex = -1;
        this.setState('idle', 2);
    }

    /**
     * Update swimming behavior
     * Option D: Bell Curve Scaling
     * - Check interval: 20-40 seconds (random)
     * - Swim probability: waterAffinity * 1.5
     * - Swim duration: baseDuration * (0.5 + waterAffinity)
     */
    protected updateSwimming(dt: number): void {
        // Only animals with water affinity can swim
        if (this.waterAffinity <= 0) return;

        // If currently swimming
        if (this.state === 'swimming') {
            // Check if we've reached the water tile
            const currentTile = this.game.world.getTile(this.tileX, this.tileY);
            const inWater = currentTile?.terrain === 'fresh_water' || currentTile?.terrain === 'salt_water';

            if (inWater) {
                // We're in water, count down swim timer
                this.swimTimer += dt;

                if (this.swimTimer >= this.swimDuration) {
                    // Done swimming, find land and exit
                    this.exitWater();
                } else if (!this.isMoving && this.currentPath.length === 0) {
                    // Idle in water - occasionally move to adjacent water tile
                    if (Math.random() < 0.3) {
                        this.pickRandomWaterTarget();
                    }
                }
            } else {
                // Still heading to water
                if (!this.isMoving && this.currentPath.length === 0 && !this.pathPending) {
                    // Request path to water target
                    this.requestPath(this.targetWaterX, this.targetWaterY, false, false, undefined, this.waterAffinity).then(success => {
                        if (!success) {
                            // Can't reach water, give up
                            this.setState('idle', 2);
                            this.resetSwimCheckTimer();
                        }
                    });
                }
            }
            return;
        }

        // Periodic swim check (only when idle or walking)
        if (this.state !== 'idle' && this.state !== 'walking') return;

        this.swimCheckTimer += dt;

        if (this.swimCheckTimer >= this.swimCheckInterval) {
            this.resetSwimCheckTimer();

            // Option D formula: probability = waterAffinity * 1.5
            const swimProbability = this.waterAffinity * 1.5;

            if (Math.random() < swimProbability) {
                // Animal wants to swim!
                const waterTile = this.findNearbyWater();
                if (waterTile) {
                    this.targetWaterX = waterTile.x;
                    this.targetWaterY = waterTile.y;
                    this.swimTimer = 0;

                    // Option D formula: duration = baseDuration * (0.5 + waterAffinity)
                    const baseDuration = 20; // 20 seconds base
                    this.swimDuration = baseDuration * (0.5 + this.waterAffinity);

                    this.setState('swimming', 120); // Long timeout to reach and swim
                    this.clearPath();

                    // Request path to water
                    this.requestPath(this.targetWaterX, this.targetWaterY, false, false, undefined, this.waterAffinity);
                }
            }
        }
    }

    /**
     * Reset swim check timer with random interval (20-40 seconds)
     */
    protected resetSwimCheckTimer(): void {
        this.swimCheckTimer = 0;
        this.swimCheckInterval = 20 + Math.random() * 20; // 20-40 seconds
    }

    /**
     * Find a nearby water tile in the exhibit
     */
    protected findNearbyWater(): { x: number; y: number } | null {
        const exhibit = this.game.getExhibitAtTile?.(this.tileX, this.tileY);
        if (!exhibit) return null;

        const interiorTiles = exhibit.interiorTiles || [];
        const waterTiles: { x: number; y: number; dist: number }[] = [];

        for (const pos of interiorTiles) {
            const tile = this.game.world.getTile(pos.x, pos.y);
            if (tile && (tile.terrain === 'fresh_water' || tile.terrain === 'salt_water')) {
                const dist = Math.abs(pos.x - this.tileX) + Math.abs(pos.y - this.tileY);
                waterTiles.push({ x: pos.x, y: pos.y, dist });
            }
        }

        if (waterTiles.length === 0) return null;

        // Pick a random water tile, weighted towards closer ones
        waterTiles.sort((a, b) => a.dist - b.dist);

        // Take from the closer half
        const halfLength = Math.max(1, Math.floor(waterTiles.length / 2));
        const choice = waterTiles[Math.floor(Math.random() * halfLength)];

        return { x: choice.x, y: choice.y };
    }

    /**
     * Pick a random adjacent water tile for swimming around
     */
    protected pickRandomWaterTarget(): void {
        const directions = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
        ];

        // Shuffle
        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }

        for (const dir of directions) {
            const targetX = this.tileX + dir.dx;
            const targetY = this.tileY + dir.dy;
            const tile = this.game.world.getTile(targetX, targetY);

            if (tile && (tile.terrain === 'fresh_water' || tile.terrain === 'salt_water') &&
                !this.isMovementBlocked(this.tileX, this.tileY, targetX, targetY)) {
                this.targetTileX = targetX;
                this.targetTileY = targetY;
                this.isMoving = true;
                return;
            }
        }
    }

    /**
     * Exit water and return to land
     */
    protected exitWater(): void {
        // Find nearest land tile
        const landTile = this.findNearbyLand();
        if (landTile) {
            this.clearPath();
            this.requestPath(landTile.x, landTile.y, false, false, undefined, this.waterAffinity).then(success => {
                if (success) {
                    this.setState('walking', 30);
                } else {
                    this.setState('idle', 2);
                }
            });
        } else {
            this.setState('idle', 2);
        }
        this.resetSwimCheckTimer();
    }

    /**
     * Find a nearby land tile (non-water) in the exhibit
     */
    protected findNearbyLand(): { x: number; y: number } | null {
        const exhibit = this.game.getExhibitAtTile?.(this.tileX, this.tileY);
        if (!exhibit) return null;

        const interiorTiles = exhibit.interiorTiles || [];
        const landTiles: { x: number; y: number; dist: number }[] = [];

        for (const pos of interiorTiles) {
            const tile = this.game.world.getTile(pos.x, pos.y);
            if (tile && tile.terrain !== 'fresh_water' && tile.terrain !== 'salt_water' && !tile.path) {
                const dist = Math.abs(pos.x - this.tileX) + Math.abs(pos.y - this.tileY);
                landTiles.push({ x: pos.x, y: pos.y, dist });
            }
        }

        if (landTiles.length === 0) return null;

        // Return closest land tile
        landTiles.sort((a, b) => a.dist - b.dist);
        return { x: landTiles[0].x, y: landTiles[0].y };
    }

    /**
     * Find nearby food pile
     */
    protected findNearbyFood(): any {
        const exhibit = this.game.getExhibitAtTile?.(this.tileX, this.tileY);
        if (!exhibit) return null;

        const foodPiles = this.game.getFoodPilesInExhibit?.(exhibit) || [];

        const ediblePiles = foodPiles.filter((pile: any) => {
            if (pile.isEmpty?.()) return false;
            return this.preferredFood.includes(pile.foodType);
        });

        if (ediblePiles.length === 0) return null;

        // Find closest
        let closest = null;
        let closestDist = Infinity;

        for (const pile of ediblePiles) {
            const dist = Math.abs(pile.tileX - this.tileX) + Math.abs(pile.tileY - this.tileY);
            if (dist < closestDist) {
                closestDist = dist;
                closest = pile;
            }
        }

        return closest;
    }

    /**
     * Find a nearby shelter with available space
     */
    protected findNearbyShelter(): { shelter: Placeable; interactionIndex: number; entranceX: number; entranceY: number; approachX: number; approachY: number } | null {
        const exhibit = this.game.getExhibitAtTile?.(this.tileX, this.tileY);
        if (!exhibit) {
            console.log(`  - No exhibit at (${this.tileX}, ${this.tileY})`);
            return null;
        }

        // Get shelters in the exhibit
        const shelters = this.game.getSheltersInExhibit?.(exhibit) || [];
        console.log(`  - Found ${shelters.length} shelters in exhibit`);
        if (shelters.length === 0) return null;

        let nearest: { shelter: Placeable; interactionIndex: number; entranceX: number; entranceY: number; approachX: number; approachY: number } | null = null;
        let nearestDist = Infinity;

        for (const shelter of shelters) {
            // Find an available 'enter' interaction point
            const interaction = shelter.findAvailableInteraction('enter', 'animal', this.tileX, this.tileY);
            if (interaction) {
                // Get the shelter's occupied tiles to find approach tile outside the shelter
                const occupiedTiles = shelter.getOccupiedTiles();
                const isOccupied = (x: number, y: number) =>
                    occupiedTiles.some(t => t.x === x && t.y === y);

                // Calculate the approach tile (tile in front of entrance based on facing direction)
                // Keep moving in the facing direction until we're outside the shelter
                let approachX = interaction.worldX;
                let approachY = interaction.worldY;
                let dx = 0, dy = 0;

                // Facing direction points outward from entrance
                switch (interaction.worldFacing) {
                    case 'north': dx = -1; break; // -X direction
                    case 'south': dx = 1; break;  // +X direction
                    case 'east': dy = -1; break;  // -Y direction
                    case 'west': dy = 1; break;   // +Y direction
                }

                // Move in facing direction until outside shelter
                do {
                    approachX += dx;
                    approachY += dy;
                } while (isOccupied(approachX, approachY));

                console.log(`  - Shelter entrance at (${interaction.worldX}, ${interaction.worldY}), approach from (${approachX}, ${approachY}), facing ${interaction.worldFacing}`);

                const dist = Math.abs(approachX - this.tileX) + Math.abs(approachY - this.tileY);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = {
                        shelter,
                        interactionIndex: interaction.index,
                        entranceX: interaction.worldX,
                        entranceY: interaction.worldY,
                        approachX,
                        approachY
                    };
                }
            } else {
                console.log(`  - Shelter interaction: none available`);
            }
        }

        // Reserve the interaction point if found
        if (nearest) {
            nearest.shelter.reserveInteraction(nearest.interactionIndex, this.id, 'animal');
        }

        return nearest;
    }

    /**
     * Move towards food pile using pathfinding
     */
    protected async moveTowardsFoodPile(): Promise<void> {
        if (!this.targetFoodPile || this.isMoving || this.pathPending) return;

        const targetX = this.targetFoodPile.tileX;
        const targetY = this.targetFoodPile.tileY;

        // Check if we need a new path
        if (this.currentPath.length === 0 ||
            !this.pathTarget ||
            this.pathTarget.x !== targetX ||
            this.pathTarget.y !== targetY) {

            const success = await this.requestPath(targetX, targetY, false, false, undefined, this.waterAffinity);

            if (!success) {
                this.targetFoodPile = null;
                this.clearPath();
                this.setState('idle', 1);
            }
        }
    }

    /**
     * Pick a random adjacent target for wandering
     */
    protected pickRandomTarget(): void {
        const directions = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
        ];

        // Shuffle
        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }

        for (const dir of directions) {
            const targetX = this.tileX + dir.dx;
            const targetY = this.tileY + dir.dy;

            // Don't randomly walk into water - only go in water intentionally when swimming
            const tile = this.game.world.getTile(targetX, targetY);
            if (tile && (tile.terrain === 'fresh_water' || tile.terrain === 'salt_water')) {
                continue;
            }

            if (this.canWalkOn(targetX, targetY) &&
                !this.isMovementBlocked(this.tileX, this.tileY, targetX, targetY)) {
                this.targetTileX = targetX;
                this.targetTileY = targetY;
                this.isMoving = true;
                return;
            }
        }
    }

    /**
     * Check if animal can walk on tile
     */
    protected canWalkOn(tileX: number, tileY: number): boolean {
        const tile = this.game.world.getTile(tileX, tileY);
        if (!tile) return false;

        // Water tiles: only allowed if animal has water affinity > 0
        if (tile.terrain === 'fresh_water' || tile.terrain === 'salt_water') {
            if (this.waterAffinity <= 0) return false;
            // Animals with water affinity can swim
        }

        if (tile.path) return false; // Animals avoid paths

        // Can't walk through shelters/placeables (except entrance tile when heading there)
        const placeable = this.game.getPlaceableAtTile(tileX, tileY);
        if (placeable) {
            // Allow walking to entrance tile if this is our target shelter
            if (this.targetShelter && placeable.id === this.targetShelter.id) {
                const reservation = this.targetShelter.getEntityReservation(this.id);
                if (reservation && reservation.worldX === tileX && reservation.worldY === tileY) {
                    return true; // Can walk to our reserved entrance
                }
            }
            return false; // Block all other placeable tiles
        }

        return true;
    }

    /**
     * Check if adult
     */
    isAdult(): boolean {
        return this.age >= this.maturityAge;
    }

    /**
     * Check if baby/juvenile
     */
    isBaby(): boolean {
        return this.age < this.maturityAge;
    }

    /**
     * Get age scale for rendering (babies are smaller)
     */
    getAgeScale(): number {
        if (this.isAdult()) return 1.0;
        const growthProgress = this.age / this.maturityAge;
        return 0.4 + growthProgress * 0.6;
    }

    /**
     * Check if animal is currently in water
     */
    isInWater(): boolean {
        const tile = this.game.world.getTile(this.tileX, this.tileY);
        return tile?.terrain === 'fresh_water' || tile?.terrain === 'salt_water';
    }

    /**
     * Set animal name
     */
    setName(name: string): void {
        this.name = name;
    }

    /**
     * Get age as string
     */
    getAgeString(): string {
        if (this.age < 30) {
            return `${this.age} days`;
        } else if (this.age < 365) {
            const months = Math.floor(this.age / 30);
            return `${months} month${months > 1 ? 's' : ''}`;
        } else {
            const years = Math.floor(this.age / 365);
            return `${years} year${years > 1 ? 's' : ''}`;
        }
    }
}
