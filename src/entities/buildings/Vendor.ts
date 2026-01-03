import { Building } from './Building';
import type { Game } from '../../core/Game';
import { PLACEABLE_CONFIGS } from '../../core/types';
import type { GuestFoodCategory } from '../../core/types';

/**
 * How the food item is consumed
 */
export type ConsumptionType = 'immediate' | 'walking' | 'sitting';

/**
 * Item sold by a vendor
 */
export interface VendorItem {
    name: string;
    price: number;
    type: 'food' | 'drink' | 'snack';
    category: GuestFoodCategory;          // Food category for guest preferences
    satisfaction: number;                  // How much hunger/thirst this satisfies (0-100)
    consumptionType: ConsumptionType;     // How this food is consumed
    happinessBonus?: number;              // Optional bonus happiness (e.g., desserts)
}

/**
 * Vendor - Queue-based sales from outside the building.
 * Guests approach, purchase, and leave. Optional staffing.
 */
export abstract class Vendor extends Building {
    // Items this vendor sells
    protected items: VendorItem[] = [];

    // Inventory tracking (optional - infinite by default)
    protected hasInventory: boolean = false;
    protected inventory: Map<string, number> = new Map();

    // Staffing
    protected requiresStaff: boolean = false;
    protected hasStaff: boolean = false;

    // Service speed (seconds per transaction)
    protected serviceTime: number = 3;

    constructor(
        game: Game,
        buildingType: string,
        tileX: number,
        tileY: number,
        rotation: number = 0
    ) {
        super(game, buildingType, tileX, tileY, rotation);
    }

    getBuildingCategory(): 'vendor' {
        return 'vendor';
    }

    // =========================================
    // Items & Purchasing
    // =========================================

    /**
     * Get all items sold by this vendor
     */
    getItems(): VendorItem[] {
        return this.items;
    }

    /**
     * Get the primary/default item (for simple vendors)
     */
    getPrimaryItem(): VendorItem | null {
        return this.items[0] || null;
    }

    /**
     * Get the price from config (fallback)
     */
    getPrice(): number {
        const config = PLACEABLE_CONFIGS[this.placeableType];
        return config?.purchasePrice || this.items[0]?.price || 0;
    }

    /**
     * Attempt a purchase
     * Returns the item if successful, null if failed
     */
    purchase(itemName?: string): VendorItem | null {
        if (!this.isOpen) return null;
        if (this.requiresStaff && !this.hasStaff) return null;

        const item = itemName
            ? this.items.find(i => i.name === itemName)
            : this.items[0];

        if (!item) return null;

        // Check inventory if tracked
        if (this.hasInventory) {
            const stock = this.inventory.get(item.name) || 0;
            if (stock <= 0) return null;
            this.inventory.set(item.name, stock - 1);
        }

        this.recordRevenue(item.price);
        this.recordUsage();
        return item;
    }

    /**
     * Check if vendor can serve (open, has staff if needed)
     */
    canServe(): boolean {
        if (!this.isOpen) return false;
        if (this.requiresStaff && !this.hasStaff) return false;
        return true;
    }

    // =========================================
    // Inventory
    // =========================================

    /**
     * Add stock to inventory
     */
    addStock(itemName: string, amount: number): void {
        if (!this.hasInventory) return;
        const current = this.inventory.get(itemName) || 0;
        this.inventory.set(itemName, current + amount);
    }

    /**
     * Get current stock level
     */
    getStock(itemName: string): number {
        if (!this.hasInventory) return Infinity;
        return this.inventory.get(itemName) || 0;
    }

    /**
     * Check if any items are in stock
     */
    hasStock(): boolean {
        if (!this.hasInventory) return true;
        for (const item of this.items) {
            if ((this.inventory.get(item.name) || 0) > 0) return true;
        }
        return false;
    }

    // =========================================
    // Staffing
    // =========================================

    /**
     * Assign a staff member to this vendor
     */
    assignStaff(): void {
        this.hasStaff = true;
    }

    /**
     * Remove staff from this vendor
     */
    removeStaff(): void {
        this.hasStaff = false;
    }

    /**
     * Check if vendor is staffed
     */
    isStaffed(): boolean {
        return this.hasStaff;
    }

    /**
     * Check if vendor requires staff to operate
     */
    needsStaff(): boolean {
        return this.requiresStaff;
    }

    /**
     * Get service time per transaction
     */
    getServiceTime(): number {
        return this.serviceTime;
    }

    update(dt: number): void {
        // Vendors don't need per-tick updates by default
        // Could add queue processing here if needed
    }
}

/**
 * FoodStand - Sells food items (burgers, hot dogs, etc.)
 * Can operate without staff but slower
 */
export class FoodStand extends Vendor {
    // Food type for rendering/categorization
    public readonly foodType: 'burger' | 'hotdog' | 'pizza' | 'generic';

    constructor(
        game: Game,
        buildingType: string,
        tileX: number,
        tileY: number,
        rotation: number = 0,
        foodType: 'burger' | 'hotdog' | 'pizza' | 'generic' = 'generic'
    ) {
        super(game, buildingType, tileX, tileY, rotation);
        this.foodType = foodType;
        this.requiresStaff = false; // Works without staff
        this.serviceTime = 3;
    }
}

/**
 * BurgerStand - Specific food stand selling burgers
 */
export class BurgerStand extends FoodStand {
    constructor(game: Game, tileX: number, tileY: number, rotation: number = 0) {
        super(game, 'burger_stand', tileX, tileY, rotation, 'burger');

        this.items = [
            { name: 'Burger', price: 10, type: 'food', category: 'fast_food', satisfaction: 40, consumptionType: 'sitting' },
            { name: 'Fries', price: 5, type: 'snack', category: 'snack', satisfaction: 20, consumptionType: 'sitting' },
        ];
    }
}

/**
 * DrinkStand - Sells beverages
 */
export class DrinkStand extends Vendor {
    constructor(game: Game, tileX: number, tileY: number, rotation: number = 0) {
        super(game, 'drink_stand', tileX, tileY, rotation);
        this.requiresStaff = false;
        this.serviceTime = 2;

        // Drinks use 'snack' category as they're quick refreshments
        this.items = [
            { name: 'Soda', price: 5, type: 'drink', category: 'snack', satisfaction: 30, consumptionType: 'walking' },
            { name: 'Water', price: 3, type: 'drink', category: 'snack', satisfaction: 25, consumptionType: 'walking' },
            { name: 'Lemonade', price: 6, type: 'drink', category: 'snack', satisfaction: 35, consumptionType: 'walking' },
        ];
    }
}

/**
 * VendingMachine - Automated sales, no staff ever needed
 */
export class VendingMachine extends Vendor {
    constructor(game: Game, tileX: number, tileY: number, rotation: number = 0) {
        super(game, 'vending_machine', tileX, tileY, rotation);
        this.requiresStaff = false;
        this.hasInventory = true;
        this.serviceTime = 2;

        this.items = [
            { name: 'Soda', price: 4, type: 'drink', category: 'snack', satisfaction: 25, consumptionType: 'walking' },
            { name: 'Chips', price: 3, type: 'snack', category: 'snack', satisfaction: 15, consumptionType: 'walking' },
            { name: 'Candy', price: 2, type: 'snack', category: 'dessert', satisfaction: 10, consumptionType: 'walking', happinessBonus: 5 },
        ];

        // Start with some stock
        this.inventory.set('Soda', 20);
        this.inventory.set('Chips', 15);
        this.inventory.set('Candy', 25);
    }
}
