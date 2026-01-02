import { Building } from './Building';
import type { Game } from '../../core/Game';

/**
 * Amenity - Free-to-use buildings that provide services to guests.
 * No sales, no staff required. Examples: Bathroom, Garbage Can
 */
export abstract class Amenity extends Building {
    // How long a guest uses this amenity (in seconds)
    protected useDuration: number = 5;

    constructor(
        game: Game,
        buildingType: string,
        tileX: number,
        tileY: number,
        rotation: number = 0
    ) {
        super(game, buildingType, tileX, tileY, rotation);
    }

    getBuildingCategory(): 'amenity' {
        return 'amenity';
    }

    /**
     * Get how long guests use this amenity
     */
    getUseDuration(): number {
        return this.useDuration;
    }

    update(dt: number): void {
        // Amenities don't need per-tick updates by default
    }
}

/**
 * Bathroom - Guests use to relieve themselves
 * Has capacity, guests queue if full
 */
export class Bathroom extends Amenity {
    constructor(game: Game, tileX: number, tileY: number, rotation: number = 0) {
        super(game, 'bathroom', tileX, tileY, rotation);
        this.useDuration = 10; // 10 seconds to use bathroom
    }
}

/**
 * GarbageCan - Guests dispose of trash
 * Instant use, no capacity limit
 */
export class GarbageCan extends Amenity {
    // Track trash level (for potential maintenance worker emptying)
    private trashLevel: number = 0;
    private readonly maxTrash: number = 50;

    constructor(game: Game, tileX: number, tileY: number, rotation: number = 0) {
        super(game, 'garbage_can', tileX, tileY, rotation);
        this.useDuration = 1; // Quick to use
    }

    /**
     * Guest throws away trash
     */
    addTrash(): void {
        this.trashLevel = Math.min(this.trashLevel + 1, this.maxTrash);
        this.recordUsage();
    }

    /**
     * Check if garbage can is full
     */
    isFull(): boolean {
        return this.trashLevel >= this.maxTrash;
    }

    /**
     * Get current trash level (0-1)
     */
    getTrashLevel(): number {
        return this.trashLevel / this.maxTrash;
    }

    /**
     * Empty the garbage can (maintenance worker)
     */
    empty(): void {
        this.trashLevel = 0;
    }
}
