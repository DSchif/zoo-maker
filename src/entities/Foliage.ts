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
    // Savannah biome - African
    thorn_bush: {
        id: 'thorn_bush',
        name: 'Thorn Bush',
        icon: '🌿',
        biome: 'savanna_grass',
        cost: 20,
        tileSpace: 0.25,
        height: 'low',
        description: 'Spiny bush common in African savannas',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    tall_grass: {
        id: 'tall_grass',
        name: 'Tall Grass',
        icon: '🌾',
        biome: 'savanna_grass',
        cost: 75,
        tileSpace: 0.5,
        height: 'medium',
        description: 'Golden grass typical of African savannas',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },
    senegal_date_palm: {
        id: 'senegal_date_palm',
        name: 'Senegal Date Palm',
        icon: '🌴',
        biome: 'savanna_grass',
        cost: 120,
        tileSpace: 0.15,
        height: 'tall',
        description: 'Elegant palm tree native to the Sahel region',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    acacia_caffra: {
        id: 'acacia_caffra',
        name: 'Acacia Caffra Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 125,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Common hook-thorn acacia of southern Africa',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    thorn_acacia: {
        id: 'thorn_acacia',
        name: 'Thorn Acacia Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 150,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Thorny acacia with distinctive white bark',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    yellow_fever_tree: {
        id: 'yellow_fever_tree',
        name: 'Yellow Fever Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 175,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Striking yellow-barked acacia tree',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    umbrella_thorn: {
        id: 'umbrella_thorn',
        name: 'Umbrella Thorn Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 210,
        tileSpace: 0.35,
        height: 'tall',
        description: 'Iconic flat-topped African acacia',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    baobab: {
        id: 'baobab',
        name: 'Baobab Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 300,
        tileSpace: 0.5,
        height: 'tall',
        description: 'Massive tree with a distinctive swollen trunk',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    // Savannah biome - Indian
    khejri: {
        id: 'khejri',
        name: 'Khejri Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 165,
        tileSpace: 0.15,
        height: 'tall',
        description: 'Hardy desert tree native to India',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    // Savannah biome - Prehistoric
    sigillaria: {
        id: 'sigillaria',
        name: 'Sigillaria Tree',
        icon: '🌴',
        biome: 'savanna_grass',
        cost: 150,
        tileSpace: 0.15,
        height: 'tall',
        description: 'Ancient tree-like plant from the Carboniferous period',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'rainforest_floor'],
    },
    // Savannah biome - Australian
    grass_tree: {
        id: 'grass_tree',
        name: 'Grass Tree',
        icon: '🌴',
        biome: 'savanna_grass',
        cost: 125,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Unique Australian plant with grass-like foliage',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    red_gum: {
        id: 'red_gum',
        name: 'Red Gum Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 175,
        tileSpace: 0.35,
        height: 'tall',
        description: 'Large eucalyptus with smooth bark',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    hard_quandong: {
        id: 'hard_quandong',
        name: 'Hard Quandong Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 200,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Australian native with edible fruit',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    eucalyptus: {
        id: 'eucalyptus',
        name: 'Eucalyptus Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 225,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Tall aromatic tree beloved by koalas',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },

    // Prairie biome
    prairie_grass: {
        id: 'prairie_grass',
        name: 'Prairie Grass',
        icon: '🌿',
        biome: 'prairie',
        cost: 20,
        tileSpace: 0.5,
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
        tileSpace: 0.15,
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
        tileSpace: 0.25,
        height: 'low',
        description: 'Colorful native prairie wildflowers',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },

    // Grassland biome
    broadleaf_bush: {
        id: 'broadleaf_bush',
        name: 'Broadleaf Bush',
        icon: '🌿',
        biome: 'grass',
        cost: 65,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Dense bush with broad green leaves native to North America',
        allowedTerrains: ['grass', 'dirt', 'prairie', 'savanna_grass'],
    },
    monkey_puzzle_tree: {
        id: 'monkey_puzzle_tree',
        name: 'Monkey Puzzle Tree',
        icon: '🌲',
        biome: 'grass',
        cost: 180,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Ancient conifer with distinctive spiky branches from the Cretaceous period',
        allowedTerrains: ['grass', 'dirt', 'prairie', 'savanna_grass', 'rainforest_floor'],
    },

    // Deciduous forest biome
    thornless_mesquite: {
        id: 'thornless_mesquite',
        name: 'Thornless Mesquite Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 125,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Spreading shade tree native to South America',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'savanna_grass'],
    },
    maple_tree: {
        id: 'maple_tree',
        name: 'Maple Tree',
        icon: '🍁',
        biome: 'deciduous_floor',
        cost: 100,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Classic North American tree with vibrant fall colors',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    elm_tree: {
        id: 'elm_tree',
        name: 'Elm Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 125,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Stately shade tree with vase-shaped canopy',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    gingko_tree: {
        id: 'gingko_tree',
        name: 'Gingko Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 125,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Ancient tree species with distinctive fan-shaped leaves',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'rainforest_floor'],
    },
    weeping_willow: {
        id: 'weeping_willow',
        name: 'Weeping Willow Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 130,
        tileSpace: 0.4,
        height: 'tall',
        description: 'Graceful tree with long drooping branches',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    birch_tree: {
        id: 'birch_tree',
        name: 'Birch Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 145,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Elegant tree with distinctive white bark',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'coniferous_floor'],
    },
    white_oak: {
        id: 'white_oak',
        name: 'White Oak Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 150,
        tileSpace: 0.35,
        height: 'tall',
        description: 'Majestic oak with spreading crown and lobed leaves',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    cherry_tree: {
        id: 'cherry_tree',
        name: 'Cherry Tree',
        icon: '🌸',
        biome: 'deciduous_floor',
        cost: 175,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Beautiful flowering tree with pink blossoms',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    trembling_aspen: {
        id: 'trembling_aspen',
        name: 'Trembling Aspen Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 200,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Slender tree whose leaves quiver in the slightest breeze',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'coniferous_floor'],
    },
    bonsai: {
        id: 'bonsai',
        name: 'Bonsai',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 75,
        tileSpace: 0.1,
        height: 'low',
        description: 'Miniature ornamental tree from Asia',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'gray_stone'],
    },
    snowbell_tree: {
        id: 'snowbell_tree',
        name: 'Snowbell Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 120,
        tileSpace: 0.15,
        height: 'medium',
        description: 'Small Asian tree with bell-shaped white flowers',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    japanese_maple: {
        id: 'japanese_maple',
        name: 'Japanese Maple Tree',
        icon: '🍁',
        biome: 'deciduous_floor',
        cost: 135,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Ornamental tree with delicate red leaves',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    deciduous_bush: {
        id: 'deciduous_bush',
        name: 'Deciduous Bush',
        icon: '🌿',
        biome: 'deciduous_floor',
        cost: 35,
        tileSpace: 0.15,
        height: 'low',
        description: 'Common leafy shrub found in European forests',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'coniferous_floor'],
    },
    glossopteris: {
        id: 'glossopteris',
        name: 'Glossopteris Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 185,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Prehistoric seed fern from the Triassic period',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'rainforest_floor'],
    },
    magnolia_tree: {
        id: 'magnolia_tree',
        name: 'Magnolia Tree',
        icon: '🌸',
        biome: 'deciduous_floor',
        cost: 185,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Ancient flowering tree with large fragrant blossoms',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    globe_willow: {
        id: 'globe_willow',
        name: 'Globe Willow Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 210,
        tileSpace: 0.35,
        height: 'tall',
        description: 'Round-crowned willow with dense spherical canopy',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    wild_olive: {
        id: 'wild_olive',
        name: 'Wild Olive Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 120,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Gnarled Mediterranean tree with silvery leaves',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'sand'],
    },
    pacific_dogwood: {
        id: 'pacific_dogwood',
        name: 'Pacific Dogwood Tree',
        icon: '🌸',
        biome: 'deciduous_floor',
        cost: 125,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Beautiful flowering tree from Western North America',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'coniferous_floor'],
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
