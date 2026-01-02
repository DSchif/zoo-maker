import { Building } from './Building';
import type { Game } from '../../core/Game';

/**
 * Item sold in a shop
 */
export interface ShopItem {
    name: string;
    price: number;
    category: 'souvenir' | 'toy' | 'clothing' | 'food' | 'drink';
    happiness: number;  // How much happiness this gives the guest
}

/**
 * Shop - Guests enter to browse and purchase.
 * Requires staff to operate. Examples: Gift Shop, Restaurant
 */
export abstract class Shop extends Building {
    // Items this shop sells
    protected items: ShopItem[] = [];

    // Capacity (how many guests can be inside)
    protected capacity: number = 10;
    protected currentGuests: number = 0;

    // Staffing (required)
    protected staffCount: number = 0;
    protected requiredStaff: number = 1;

    // Time guests spend inside (seconds)
    protected browseTime: number = 30;

    constructor(
        game: Game,
        buildingType: string,
        tileX: number,
        tileY: number,
        rotation: number = 0
    ) {
        super(game, buildingType, tileX, tileY, rotation);
    }

    getBuildingCategory(): 'shop' {
        return 'shop';
    }

    // =========================================
    // Capacity & Guests
    // =========================================

    /**
     * Check if shop has room for more guests
     */
    hasCapacity(): boolean {
        return this.currentGuests < this.capacity;
    }

    /**
     * Get current occupancy
     */
    getOccupancy(): number {
        return this.currentGuests;
    }

    /**
     * Get max capacity
     */
    getCapacity(): number {
        return this.capacity;
    }

    /**
     * Guest enters the shop
     */
    guestEnter(): boolean {
        if (!this.canOperate()) return false;
        if (!this.hasCapacity()) return false;

        this.currentGuests++;
        return true;
    }

    /**
     * Guest leaves the shop
     */
    guestLeave(): void {
        this.currentGuests = Math.max(0, this.currentGuests - 1);
    }

    /**
     * Get browse time
     */
    getBrowseTime(): number {
        return this.browseTime;
    }

    // =========================================
    // Staffing
    // =========================================

    /**
     * Check if shop can operate (has enough staff)
     */
    canOperate(): boolean {
        return this.isOpen && this.staffCount >= this.requiredStaff;
    }

    /**
     * Assign a staff member
     */
    assignStaff(): void {
        this.staffCount++;
    }

    /**
     * Remove a staff member
     */
    removeStaff(): void {
        this.staffCount = Math.max(0, this.staffCount - 1);
    }

    /**
     * Get current staff count
     */
    getStaffCount(): number {
        return this.staffCount;
    }

    /**
     * Get required staff count
     */
    getRequiredStaff(): number {
        return this.requiredStaff;
    }

    /**
     * Check if fully staffed
     */
    isFullyStaffed(): boolean {
        return this.staffCount >= this.requiredStaff;
    }

    // =========================================
    // Items & Purchasing
    // =========================================

    /**
     * Get all items
     */
    getItems(): ShopItem[] {
        return this.items;
    }

    /**
     * Guest purchases an item
     */
    purchase(itemName: string): ShopItem | null {
        const item = this.items.find(i => i.name === itemName);
        if (!item) return null;

        this.recordRevenue(item.price);
        this.recordUsage();
        return item;
    }

    /**
     * Guest makes a random purchase (based on browse)
     */
    randomPurchase(): ShopItem | null {
        if (this.items.length === 0) return null;

        // 70% chance to buy something
        if (Math.random() > 0.7) return null;

        const item = this.items[Math.floor(Math.random() * this.items.length)];
        return this.purchase(item.name);
    }

    update(dt: number): void {
        // Shops could process guests over time here
    }
}

/**
 * GiftShop - Sells souvenirs and merchandise
 */
export class GiftShop extends Shop {
    constructor(game: Game, tileX: number, tileY: number, rotation: number = 0) {
        super(game, 'gift_shop', tileX, tileY, rotation);

        this.capacity = 15;
        this.requiredStaff = 1;
        this.browseTime = 45;

        this.items = [
            { name: 'Plush Lion', price: 25, category: 'toy', happiness: 30 },
            { name: 'Zoo T-Shirt', price: 20, category: 'clothing', happiness: 25 },
            { name: 'Keychain', price: 8, category: 'souvenir', happiness: 10 },
            { name: 'Postcard', price: 3, category: 'souvenir', happiness: 5 },
            { name: 'Zoo Mug', price: 12, category: 'souvenir', happiness: 15 },
        ];
    }
}

/**
 * Restaurant - Sit-down dining experience
 */
export class Restaurant extends Shop {
    // Seating capacity (subset of total capacity)
    private seatingCapacity: number = 20;

    constructor(game: Game, tileX: number, tileY: number, rotation: number = 0) {
        super(game, 'restaurant', tileX, tileY, rotation);

        this.capacity = 30; // Including waiting area
        this.seatingCapacity = 20;
        this.requiredStaff = 2;
        this.browseTime = 60; // Dining takes longer

        this.items = [
            { name: 'Burger Meal', price: 15, category: 'food', happiness: 35 },
            { name: 'Pizza Slice', price: 8, category: 'food', happiness: 25 },
            { name: 'Salad', price: 10, category: 'food', happiness: 20 },
            { name: 'Kids Meal', price: 10, category: 'food', happiness: 30 },
            { name: 'Soda', price: 4, category: 'drink', happiness: 10 },
            { name: 'Ice Cream', price: 6, category: 'food', happiness: 20 },
        ];
    }

    /**
     * Get seating capacity
     */
    getSeatingCapacity(): number {
        return this.seatingCapacity;
    }
}
