import type { Game } from '../core/Game';
import type { FoliageType, TerrainType } from '../core/types';

/**
 * Foliage type data definition
 */
interface FoliageTypeData {
    id: FoliageType;
    name: string;
    icon: string;
    biome: string;
    cost: number;
    tileSpace: number;
    height: 'low' | 'medium' | 'tall';
    description: string;
    allowedTerrains: TerrainType[];
}

/**
 * Foliage data definitions
 */
export const FoliageTypes: Record<FoliageType, FoliageTypeData> = {
    // Savanna biome
    acacia: {
        id: 'acacia',
        name: 'Acacia Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 150,
        tileSpace: 0.1,  // 10 can fit per tile (large tree)
        height: 'tall',
        description: 'Iconic African tree with a flat-topped canopy',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },
    tall_grass: {
        id: 'tall_grass',
        name: 'Tall Savanna Grass',
        icon: '🌾',
        biome: 'savanna_grass',
        cost: 25,
        tileSpace: 0.5,  // 2 per tile (takes more space)
        height: 'medium',
        description: 'Golden grass typical of African savannas',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },

    // Prairie biome
    prairie_grass: {
        id: 'prairie_grass',
        name: 'Prairie Grass',
        icon: '🌿',
        biome: 'prairie',
        cost: 20,
        tileSpace: 0.5,  // 2 per tile
        height: 'medium',
        description: 'Native North American prairie grass',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },
    shrub: {
        id: 'shrub',
        name: 'Prairie Shrub',
        icon: '🌲',
        biome: 'prairie',
        cost: 75,
        tileSpace: 0.15,  // ~6-7 per tile
        height: 'medium',
        description: 'Hardy shrub found in open grasslands',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },
    wildflowers: {
        id: 'wildflowers',
        name: 'Wildflowers',
        icon: '🌸',
        biome: 'prairie',
        cost: 30,
        tileSpace: 0.25,  // 4 per tile
        height: 'low',
        description: 'Colorful native prairie wildflowers',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },
};

/**
 * Foliage class - decorative plants and vegetation
 */
export class Foliage {
    private _game: Game; // Stored for potential future use

    public readonly id: number;
    public tileX: number;
    public tileY: number;

    // Type data
    public readonly foliageType: FoliageType;
    public readonly name: string;
    public readonly biome: string;
    public readonly tileSpace: number;
    public readonly height: 'low' | 'medium' | 'tall';

    // Position offset within tile (for variety)
    public readonly offsetX: number;
    public readonly offsetY: number;

    // Visual variation
    public readonly scale: number;
    public readonly rotation: number;

    // Static ID counter
    private static nextId: number = 1;

    constructor(game: Game, tileX: number, tileY: number, foliageType: FoliageType) {
        this._game = game;
        this.id = Foliage.nextId++;
        this.tileX = tileX;
        this.tileY = tileY;

        // Get type data
        const typeData = FoliageTypes[foliageType];
        this.foliageType = foliageType;
        this.name = typeData.name;
        this.biome = typeData.biome;
        this.tileSpace = typeData.tileSpace;
        this.height = typeData.height;

        // Position offset within tile (for variety)
        this.offsetX = 0.2 + Math.random() * 0.6;
        this.offsetY = 0.2 + Math.random() * 0.6;

        // Visual variation
        this.scale = 0.9 + Math.random() * 0.2;
        this.rotation = Math.random() * 0.2 - 0.1;
    }

    /**
     * Get world position (tile + offset)
     */
    getWorldPos(): { x: number; y: number } {
        return {
            x: this.tileX + this.offsetX - 0.5,
            y: this.tileY + this.offsetY - 0.5,
        };
    }

    /**
     * Get depth value for rendering (isometric depth sorting)
     */
    getDepth(): number {
        return this.tileX + this.tileY + this.offsetY;
    }

    /**
     * Check if this foliage can be placed on a terrain type
     */
    static canPlaceOn(foliageType: FoliageType, terrain: TerrainType): boolean {
        const typeData = FoliageTypes[foliageType];
        return typeData.allowedTerrains.includes(terrain);
    }

    /**
     * Get the cost of a foliage type
     */
    static getCost(foliageType: FoliageType): number {
        return FoliageTypes[foliageType].cost;
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return FoliageTypes[this.foliageType].icon;
    }

    /**
     * Get the tile space used by a foliage type
     */
    static getTileSpace(foliageType: FoliageType): number {
        return FoliageTypes[foliageType].tileSpace;
    }

    /**
     * Check if there's enough space on a tile for this foliage
     */
    static hasSpaceOnTile(foliageType: FoliageType, currentUsage: number): boolean {
        const spaceNeeded = FoliageTypes[foliageType].tileSpace;
        return currentUsage + spaceNeeded <= 1.0;
    }
}
