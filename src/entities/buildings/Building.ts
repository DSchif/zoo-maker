import { Placeable } from '../Placeable';
import type { Game } from '../../core/Game';

/**
 * Base class for all buildings (commercial structures, amenities, attractions).
 * Extends Placeable with revenue tracking, operating state, and common building behavior.
 */
export abstract class Building extends Placeable {
    // Revenue tracking
    protected totalRevenue: number = 0;
    protected todayRevenue: number = 0;

    // Usage tracking
    protected totalUses: number = 0;
    protected todayUses: number = 0;

    // Operating state
    protected _isOpen: boolean = true;

    constructor(
        game: Game,
        buildingType: string,
        tileX: number,
        tileY: number,
        rotation: number = 0
    ) {
        super(game, buildingType, tileX, tileY, rotation);
    }

    // =========================================
    // Operating State
    // =========================================

    /**
     * Check if building is open for business
     */
    get isOpen(): boolean {
        return this._isOpen;
    }

    /**
     * Open the building
     */
    open(): void {
        this._isOpen = true;
    }

    /**
     * Close the building
     */
    close(): void {
        this._isOpen = false;
    }

    /**
     * Toggle open/closed state
     */
    toggle(): void {
        this._isOpen = !this._isOpen;
    }

    // =========================================
    // Revenue Tracking
    // =========================================

    /**
     * Record a sale/transaction
     */
    recordRevenue(amount: number): void {
        this.totalRevenue += amount;
        this.todayRevenue += amount;
        this.game.addMoney(amount);
    }

    /**
     * Get total revenue earned by this building
     */
    getTotalRevenue(): number {
        return this.totalRevenue;
    }

    /**
     * Get today's revenue
     */
    getTodayRevenue(): number {
        return this.todayRevenue;
    }

    /**
     * Reset daily stats (called at start of new day)
     */
    resetDailyStats(): void {
        this.todayRevenue = 0;
        this.todayUses = 0;
    }

    // =========================================
    // Usage Tracking
    // =========================================

    /**
     * Record a usage (guest used this building)
     */
    recordUsage(): void {
        this.totalUses++;
        this.todayUses++;
    }

    /**
     * Get total uses
     */
    getTotalUses(): number {
        return this.totalUses;
    }

    /**
     * Get today's uses
     */
    getTodayUses(): number {
        return this.todayUses;
    }

    // =========================================
    // Abstract Methods (subclasses must implement)
    // =========================================

    /**
     * Get the building category for UI/logic purposes
     */
    abstract getBuildingCategory(): 'amenity' | 'vendor' | 'shop' | 'attraction';

    /**
     * Update the building (called each simulation tick)
     */
    abstract update(dt: number): void;
}
