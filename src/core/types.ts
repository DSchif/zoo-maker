// ============================================
// Core Types for Zoo Tycoon Clone v2
// ============================================

// Grid position (logical world coordinates)
export interface GridPos {
    x: number;
    y: number;
}

// Screen position (pixel coordinates)
export interface ScreenPos {
    x: number;
    y: number;
}

// Terrain types
export type TerrainType = 'grass' | 'dirt' | 'sand' | 'water' | 'savanna' | 'prairie';

// Path types
export type PathType = 'dirt' | 'stone' | 'brick' | 'cobble' | null;

// Fence types
export type FenceType = 'wood' | 'iron' | 'concrete' | null;

// Fence condition (degradation states)
export type FenceCondition = 'good' | 'light_damage' | 'damaged' | 'failed';

// Edge direction for fences
export type EdgeDirection = 'north' | 'south' | 'east' | 'west';

// Tile edge reference (for fence placement)
export interface TileEdge {
    tileX: number;
    tileY: number;
    edge: EdgeDirection;
}

// Tile data stored in the world grid
export interface TileData {
    terrain: TerrainType;
    path: PathType;
    fences: {
        north: FenceType;
        south: FenceType;
        east: FenceType;
        west: FenceType;
    };
}

// Chunk for efficient rendering and updates
export interface Chunk {
    x: number;  // Chunk coordinate (not tile)
    y: number;
    tiles: TileData[][];
    dirty: boolean;  // Needs re-render
    visible: boolean;
}

// Entity types
export type EntityType = 'animal' | 'guest' | 'staff' | 'foliage' | 'food' | 'shelter';

// Base entity interface
export interface Entity {
    id: number;
    type: EntityType;
    tileX: number;
    tileY: number;
    offsetX: number;  // Sub-tile position for smooth movement
    offsetY: number;
}

// Animal species
export type AnimalSpecies = 'lion' | 'bison';

// Gender
export type Gender = 'male' | 'female';

// Foliage types
export type FoliageType = 'acacia' | 'tall_grass' | 'prairie_grass' | 'shrub' | 'wildflowers';

// Shelter types and sizes
export type ShelterType = 'concrete';
export type ShelterSize = 'small' | 'regular' | 'large';

// Shelter size configurations (in tiles)
export const SHELTER_CONFIGS: Record<ShelterSize, { width: number; depth: number; name: string }> = {
    small: { width: 2, depth: 1, name: 'Small' },      // 2 tiles (2x1)
    regular: { width: 2, depth: 2, name: 'Regular' },  // 4 tiles (2x2)
    large: { width: 3, depth: 2, name: 'Large' },      // 6 tiles (3x2)
};

// Food types (for animals)
export type FoodType = 'meat' | 'vegetables' | 'fruit' | 'hay';

// Guest food categories
export type GuestFoodCategory = 'fast_food' | 'restaurant' | 'snack' | 'dessert';

// Animal state
export type AnimalState = 'idle' | 'walking' | 'eating' | 'sleeping' | 'resting';

// Staff types
export type StaffType = 'zookeeper' | 'maintenance';

// Tool types for player interaction
export type ToolType = 'select' | 'terrain' | 'path' | 'fence' | 'animal' | 'staff' | 'foliage' | 'shelter' | 'building' | 'demolish';

// Game speed settings
export type GameSpeed = 0 | 1 | 2 | 3;  // Paused, 1x, 2x, 5x

// Pathfinding request/response for Web Worker
export interface PathRequest {
    id: number;
    entityId: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    canUsePaths: boolean;  // Staff can, animals can't
    canPassGates: boolean; // Staff can, animals can't
    maxOffPathDistance?: number; // Max tiles away from a path (for guests)
}

export interface PathResponse {
    id: number;
    entityId: number;
    path: GridPos[];
    success: boolean;
}

// Camera state
export interface CameraState {
    x: number;
    y: number;
    zoom: number;
}

// Game configuration
export interface GameConfig {
    worldWidth: number;   // In tiles
    worldHeight: number;
    chunkSize: number;    // Tiles per chunk (e.g., 32)
    startingMoney: number;
    simTickRate: number;  // Hz (e.g., 10 = 10 ticks per second)
}

// Default configuration
export const DEFAULT_CONFIG: GameConfig = {
    worldWidth: 64,
    worldHeight: 64,
    chunkSize: 16,
    startingMoney: 10000,
    simTickRate: 10,
};

// Isometric constants
export const ISO = {
    TILE_WIDTH: 64,
    TILE_HEIGHT: 32,
} as const;

// ============================================
// Placeable System Types
// ============================================

// Interaction point types
export type InteractionType = 'enter' | 'use' | 'queue' | 'work' | 'sit' | 'rest' | 'purchase';

// How entity approaches the interaction point
// 'direct' - entity walks directly onto the interaction tile
// 'facing' - entity stands adjacent on the side the interaction faces (e.g., service window)
// 'any' - entity can stand on any adjacent walkable tile (e.g., vending machine, bench)
// 'enter' - entity approaches from facing direction, then steps inside (e.g., restaurant, gift shop)
export type ApproachType = 'direct' | 'facing' | 'any' | 'enter';

// Guest needs that interactions can satisfy
export type GuestNeed = 'hunger' | 'thirst' | 'energy' | 'bathroom' | 'fun' | 'shopping';

// Entity types that can interact
export type InteractingEntityType = 'animal' | 'guest' | 'staff';

// Interaction behavior config - defines what happens when entity uses this interaction
export interface InteractionBehavior {
    // How long the entity stays (in seconds)
    duration: { min: number; max: number };

    // Does the entity disappear inside? (enters building)
    entersBuilding?: boolean;

    // Price charged to guest (revenue for the building)
    price?: number;

    // Stat effects to apply when interaction completes
    effects?: {
        hunger?: number;      // Amount to add (can be negative)
        thirst?: number;
        energy?: number;
        bladder?: number;
        happiness?: number;
    };
}

// Interaction point definition (relative to anchor, before rotation)
export interface InteractionPoint {
    // Position relative to anchor tile (before rotation)
    relativeX: number;
    relativeY: number;

    // What kind of interaction
    type: InteractionType;

    // Who can use this interaction
    entities: InteractingEntityType[];

    // Direction entity faces while interacting
    facing?: EdgeDirection;

    // Optional: capacity for this point (default 1)
    capacity?: number;

    // How to approach this interaction (default 'direct')
    approach?: ApproachType;

    // What guest needs this interaction satisfies (used for need-seeking)
    satisfies?: GuestNeed[];

    // Behavior when guest uses this interaction
    behavior?: InteractionBehavior;
}

// Placeable category
export type PlaceableCategory = 'exhibit' | 'amenity' | 'commercial';

// Base placeable configuration
export interface PlaceableConfig {
    // Display info
    name: string;
    icon: string;

    // Dimensions (before rotation)
    width: number;
    depth: number;

    // Category determines placement rules
    category: PlaceableCategory;

    // Cost to place
    cost: number;

    // Interaction points
    interactions: InteractionPoint[];

    // Visual style (for renderer)
    style?: string;

    // Price for purchase interactions (e.g., burger stand sells for $10)
    purchasePrice?: number;
}

// Placeable types registry
export type PlaceableType =
    | 'shelter_small' | 'shelter_regular' | 'shelter_large'
    | 'bench' | 'picnic_table' | 'garbage_can' | 'bathroom' | 'bathroom_large'
    | 'gift_shop' | 'restaurant'
    | 'burger_stand' | 'drink_stand' | 'vending_machine'
    | 'indoor_attraction';

// Placeable configs
export const PLACEABLE_CONFIGS: Record<string, PlaceableConfig> = {
    // Exhibit features - shelters
    // Interaction points are on the shelter tile at the entrance
    // Animals path to this tile, then "enter" (become hidden inside)
    shelter_small: {
        name: 'Small Shelter',
        icon: '🏠',
        width: 2,
        depth: 1,
        category: 'exhibit',
        cost: 500,
        interactions: [
            // Entrance on front-right wall (short side), tile (1,0) is at the entrance
            // Front-right wall faces +X direction = 'south'
            { relativeX: 1, relativeY: 0, type: 'enter', entities: ['animal'], facing: 'south', capacity: 2 }
        ],
        style: 'concrete'
    },
    shelter_regular: {
        name: 'Regular Shelter',
        icon: '🏘️',
        width: 2,
        depth: 2,
        category: 'exhibit',
        cost: 900,
        interactions: [
            // Entrance on front-right wall at edge, tile (1,0) is at the entrance
            // Front-right wall faces +X direction = 'south'
            { relativeX: 1, relativeY: 0, type: 'enter', entities: ['animal'], facing: 'south', capacity: 5 }
        ],
        style: 'concrete'
    },
    shelter_large: {
        name: 'Large Shelter',
        icon: '🏛️',
        width: 3,
        depth: 2,
        category: 'exhibit',
        cost: 1400,
        interactions: [
            // Entrance on front-left wall (wall 3), centered on middle tile
            // Wall 3 faces +Y direction = 'west'
            { relativeX: 1, relativeY: 1, type: 'enter', entities: ['animal'], facing: 'west', capacity: 8 }
        ],
        style: 'concrete'
    },

    // Guest amenities
    bench: {
        name: 'Bench',
        icon: '🪑',
        width: 1,
        depth: 1,
        category: 'amenity',
        cost: 75,
        interactions: [
            {
                relativeX: 0, relativeY: 0, type: 'sit', entities: ['guest'], facing: 'south',
                capacity: 2, approach: 'any', satisfies: ['energy'],
                behavior: { duration: { min: 20, max: 40 }, effects: { energy: 30 } }
            }
        ],
        style: 'bench'
    },
    picnic_table: {
        name: 'Picnic Table',
        icon: '🪵',
        width: 1,
        depth: 1,
        category: 'amenity',
        cost: 150,
        interactions: [
            {
                relativeX: 0, relativeY: 0, type: 'sit', entities: ['guest'], facing: 'south',
                capacity: 4, approach: 'any', satisfies: ['energy'],
                behavior: { duration: { min: 30, max: 60 }, effects: { energy: 40 } }
            }
        ],
        style: 'picnic_table'
    },
    garbage_can: {
        name: 'Trash Can',
        icon: '🗑️',
        width: 1,
        depth: 1,
        category: 'amenity',
        cost: 50,
        interactions: [
            { relativeX: 0, relativeY: 0, type: 'use', entities: ['guest'], facing: 'north', approach: 'any' }
        ],
        style: 'garbage_can'
    },
    bathroom: {
        name: 'Bathroom',
        icon: '🚻',
        width: 1,
        depth: 1,
        category: 'amenity',
        cost: 1500,
        interactions: [
            {
                relativeX: 0, relativeY: 0, type: 'enter', entities: ['guest'], facing: 'south',
                capacity: 2, approach: 'enter', satisfies: ['bathroom'],
                behavior: { duration: { min: 8, max: 15 }, entersBuilding: true, effects: { bladder: 100, happiness: 10 } }
            }
        ],
        style: 'bathroom'
    },
    bathroom_large: {
        name: 'Large Bathroom',
        icon: '🚻',
        width: 1,
        depth: 2,
        category: 'amenity',
        cost: 2500,
        interactions: [
            {
                relativeX: 0, relativeY: 0, type: 'enter', entities: ['guest'], facing: 'south',
                capacity: 4, approach: 'enter', satisfies: ['bathroom'],
                behavior: { duration: { min: 8, max: 15 }, entersBuilding: true, effects: { bladder: 100, happiness: 10 } }
            }
        ],
        style: 'bathroom_large'
    },

    // Commercial
    gift_shop: {
        name: 'Gift Shop',
        icon: '🎁',
        width: 3,
        depth: 3,
        category: 'commercial',
        cost: 5000,
        purchasePrice: 15,
        interactions: [
            {
                relativeX: 2, relativeY: 1, type: 'enter', entities: ['guest'], facing: 'south',
                approach: 'enter', capacity: 6, satisfies: ['shopping', 'fun'],
                behavior: { duration: { min: 25, max: 35 }, entersBuilding: true, price: 15, effects: { happiness: 20 } }
            }
        ],
        style: 'gift_shop'
    },
    restaurant: {
        name: 'Restaurant',
        icon: '🍽️',
        width: 3,
        depth: 2,
        category: 'commercial',
        cost: 8000,
        interactions: [
            {
                relativeX: 2, relativeY: 1, type: 'enter', entities: ['guest'], facing: 'south',
                approach: 'enter', capacity: 8, satisfies: ['hunger', 'thirst'],
                behavior: { duration: { min: 15, max: 25 }, entersBuilding: true, price: 12, effects: { hunger: 50, thirst: 40, happiness: 10 } }
            }
        ],
        style: 'restaurant'
    },

    // Buildings - commercial structures
    burger_stand: {
        name: 'Burger Stand',
        icon: '🍔',
        width: 2,
        depth: 2,
        category: 'commercial',
        cost: 1500,
        purchasePrice: 10,
        interactions: [
            // Single service window on front-right wall (south face)
            // Guests approach from outside (stand adjacent) to purchase
            { relativeX: 1, relativeY: 0, type: 'purchase', entities: ['guest'], facing: 'south', capacity: 2, approach: 'facing', satisfies: ['hunger'] }
        ],
        style: 'burger_stand'
    },

    drink_stand: {
        name: 'Drink Stand',
        icon: '🥤',
        width: 1,
        depth: 2,
        category: 'commercial',
        cost: 1000,
        purchasePrice: 5,
        interactions: [
            // Service window on front of stand, guests approach from south
            { relativeX: 0, relativeY: 0, type: 'purchase', entities: ['guest'], facing: 'south', capacity: 2, approach: 'facing', satisfies: ['thirst'] }
        ],
        style: 'drink_stand'
    },

    vending_machine: {
        name: 'Vending Machine',
        icon: '🧃',
        width: 1,
        depth: 1,
        category: 'commercial',
        cost: 800,
        purchasePrice: 4,
        interactions: [
            // Approach from the front (where the display is)
            { relativeX: 0, relativeY: 0, type: 'purchase', entities: ['guest'], capacity: 1, approach: 'facing', facing: 'south', satisfies: ['thirst', 'hunger'] }
        ],
        style: 'vending_machine'
    },

    indoor_attraction: {
        name: 'Indoor Attraction',
        icon: '🏛️',
        width: 4,
        depth: 3,
        category: 'commercial',
        cost: 15000,
        purchasePrice: 10,
        interactions: [
            {
                relativeX: 2, relativeY: 2, type: 'enter', entities: ['guest'], facing: 'south',
                capacity: 5, approach: 'enter', satisfies: ['fun'],
                behavior: { duration: { min: 30, max: 60 }, entersBuilding: true, price: 10, effects: { happiness: 25 } }
            },
            { relativeX: 0, relativeY: 0, type: 'work', entities: ['staff'], facing: 'south' },
            { relativeX: 3, relativeY: 0, type: 'work', entities: ['staff'], facing: 'south' }
        ],
        style: 'indoor_attraction'
    }
};
