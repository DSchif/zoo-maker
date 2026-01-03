import { Entity } from './Entity';
import type { Game } from '../core/Game';
import type { EntityType, GridPos, AnimalSpecies, GuestFoodCategory } from '../core/types';
import type { Vendor, VendorItem } from './buildings/Vendor';
import { Placeable } from './Placeable';

/**
 * Happiness factor with value and reason for UI display
 */
interface HappinessFactor {
    value: number;      // 0-100, where 100 is fully satisfied
    penalty: number;    // Current penalty being applied
    reason: string;     // Human readable reason
}

/**
 * Animal info for guest favorites
 */
interface FavoriteAnimalInfo {
    species: AnimalSpecies;
    name: string;
    icon: string;
}

/**
 * All available animals that guests can have as favorites
 */
const ALL_ANIMALS: FavoriteAnimalInfo[] = [
    { species: 'lion', name: 'Lion', icon: '🦁' },
    { species: 'bison', name: 'Bison', icon: '🦬' },
];

/**
 * All food categories for guest preferences
 */
const ALL_FOOD_CATEGORIES: GuestFoodCategory[] = ['fast_food', 'restaurant', 'snack', 'dessert'];

/**
 * All food items guests can have as favorites
 */
const ALL_FAVORITE_FOODS: string[] = [
    'Burger', 'Fries', 'Soda', 'Water', 'Lemonade', 'Chips', 'Candy',
    // Future foods can be added here
];

/**
 * Guest class - visitors who walk around the zoo
 */
export class Guest extends Entity {
    public readonly type: EntityType = 'guest';

    // State
    public state: 'entering' | 'wandering' | 'viewing' | 'seeking_food' | 'seeking_seat' | 'eating' | 'eating_walking' | 'leaving' | 'left' = 'entering';
    protected stateTimer: number = 0;

    // Appearance (random colors)
    public readonly shirtColor: number;
    public readonly pantsColor: number;
    public readonly skinColor: number;
    public readonly hairColor: number;

    // Guest stats (0-100 scale, 100 = fully satisfied, 0 = critical need)
    public happiness: number = 100;
    public energy: number = 100;
    public hunger: number = 100;    // 100 = full, 0 = starving
    public thirst: number = 100;    // 100 = hydrated, 0 = parched

    // Food preferences
    public readonly preferredFoodCategory: GuestFoodCategory;
    public readonly favoriteFoods: string[];  // 1-2 specific food item names

    // Food seeking state
    private targetVendor: Vendor | null = null;
    private targetItem: VendorItem | null = null;
    private foodSeekingFailed: boolean = false;  // Prevents constant retrying

    // Current food being consumed (for emoji display and eating state)
    public currentFood: VendorItem | null = null;

    // Seat seeking state
    private targetSeat: { placeable: Placeable; pointIndex: number } | null = null;

    // Happiness factors breakdown (for UI display)
    public happinessFactors: Record<string, HappinessFactor> = {
        hunger: { value: 100, penalty: 0, reason: 'Well fed' },
        thirst: { value: 100, penalty: 0, reason: 'Hydrated' },
        energy: { value: 100, penalty: 0, reason: 'Energetic' },
        exhibits: { value: 0, penalty: 0, reason: 'No exhibits viewed' },
    };

    // Decay rates (per second at 1x speed)
    private static readonly HUNGER_DECAY = 0.4;     // ~4 minutes to get hungry
    private static readonly THIRST_DECAY = 0.5;     // ~3.3 minutes to get thirsty
    private static readonly ENERGY_DECAY = 0.15;    // ~11 minutes to get tired

    // Happiness penalty weights (max penalty per factor)
    private static readonly HAPPINESS_WEIGHTS = {
        hunger: 30,     // Max 30% penalty when starving
        thirst: 25,     // Max 25% penalty when parched
        energy: 20,     // Max 20% penalty when exhausted
        exhibits: 25,   // Max 25% penalty for not seeing exhibits
    };

    // Visit tracking
    protected visitDuration: number = 0;
    protected maxVisitDuration: number;
    public exhibitsViewed: Set<number> = new Set();

    // Leaving tracking
    protected leavingTimer: number = 0;
    protected targetEntranceX: number = 0; // Which entrance tile to target

    // Favorite animals (top 2)
    public readonly favoriteAnimals: FavoriteAnimalInfo[];

    // Happiness calculation timing
    private happinessCalculationTimer: number = 0;
    private static readonly HAPPINESS_CALC_INTERVAL = 1; // Calculate every second

    constructor(game: Game, tileX: number, tileY: number) {
        super(game, tileX, tileY);

        this.speed = 1.8;

        // Random appearance from color palettes
        const shirtColors = [
            0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9ca24, 0x6c5ce7, 0xa29bfe,  // Bright
            0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c,  // Vivid
            0x34495e, 0x7f8c8d, 0xecf0f1, 0xe67e22, 0x16a085, 0x8e44ad,  // Mixed
        ];
        const pantsColors = [
            0x2c3e50, 0x34495e, 0x2d3436, 0x636e72,  // Dark grays/navy
            0x0984e3, 0x6c5ce7, 0x00b894, 0xfdcb6e,  // Colored pants
            0x2d3436, 0x1e272e, 0x4a4a4a, 0x718093,  // More grays
        ];
        const skinColors = [
            0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524,  // Light to medium
            0xfde7d6, 0xfcd4b8, 0xd4a373, 0xa67c52, 0x6b4423,  // More range
        ];
        const hairColors = [
            0x090806, 0x2c1810, 0x3b2219, 0x4a3728,  // Black/dark brown
            0x71635a, 0x8d7b73, 0xa68b6e, 0xb89778,  // Medium brown
            0xdcd0ba, 0xf0e5d3, 0xfaf0be, 0xe6cea8,  // Blonde
            0xb55239, 0x8d4a2f, 0xa52a2a, 0xc04000,  // Red/auburn
            0x28282B, 0x36454F, 0x71797E, 0xD3D3D3,  // Black to gray
        ];

        this.shirtColor = shirtColors[Math.floor(Math.random() * shirtColors.length)];
        this.pantsColor = pantsColors[Math.floor(Math.random() * pantsColors.length)];
        this.skinColor = skinColors[Math.floor(Math.random() * skinColors.length)];
        this.hairColor = hairColors[Math.floor(Math.random() * hairColors.length)];

        // Random visit duration (5-15 minutes at 1x speed)
        this.maxVisitDuration = 300 + Math.random() * 600;

        // Pick 2 random favorite animals (shuffle and take first 2)
        const shuffled = [...ALL_ANIMALS].sort(() => Math.random() - 0.5);
        this.favoriteAnimals = shuffled.slice(0, Math.min(2, shuffled.length));

        // Random food preferences
        this.preferredFoodCategory = ALL_FOOD_CATEGORIES[Math.floor(Math.random() * ALL_FOOD_CATEGORIES.length)];

        // Pick 1-2 random favorite foods
        const shuffledFoods = [...ALL_FAVORITE_FOODS].sort(() => Math.random() - 0.5);
        const numFavorites = 1 + Math.floor(Math.random() * 2);  // 1 or 2
        this.favoriteFoods = shuffledFoods.slice(0, numFavorites);
    }

    /**
     * Update guest
     */
    update(dt: number): void {
        if (this.state === 'left') return;

        this.visitDuration += dt;
        this.updateState(dt);

        // Check again after state update (guest may have just left)
        // Use string comparison to avoid TypeScript flow analysis issues
        if ((this.state as string) === 'left') return;

        this.updateMovement(dt);

        // Apply decay rates for needs
        this.hunger = Math.max(0, this.hunger - dt * Guest.HUNGER_DECAY);
        this.thirst = Math.max(0, this.thirst - dt * Guest.THIRST_DECAY);
        this.energy = Math.max(0, this.energy - dt * Guest.ENERGY_DECAY);

        // Check if should seek food (only when wandering and not already failed)
        if (this.state === 'wandering' && !this.foodSeekingFailed) {
            this.checkShouldSeekFood();
        }

        // Calculate happiness periodically
        this.happinessCalculationTimer += dt;
        if (this.happinessCalculationTimer >= Guest.HAPPINESS_CALC_INTERVAL) {
            this.happinessCalculationTimer = 0;
            this.calculateHappiness();
        }

        // Leave if visit is too long or happiness is very low
        if (this.visitDuration >= this.maxVisitDuration || this.happiness <= 10) {
            if (this.state !== 'leaving') {
                this.startLeaving();
            }
        }
    }

    /**
     * Update state machine
     */
    protected updateState(dt: number): void {
        this.stateTimer += dt;

        switch (this.state) {
            case 'entering':
                // Move into zoo, then start wandering
                if (!this.isMoving && this.currentPath.length === 0) {
                    this.state = 'wandering';
                    this.stateTimer = 0;
                }
                break;

            case 'wandering':
                if (!this.isMoving && this.currentPath.length === 0) {
                    this.chooseNextDestination();
                }
                break;

            case 'viewing':
                // Stand and look at exhibit
                if (this.stateTimer >= 5 + Math.random() * 10) {
                    this.state = 'wandering';
                    this.stateTimer = 0;
                }
                break;

            case 'seeking_food':
                // Walking to food vendor
                if (!this.isMoving && this.currentPath.length === 0) {
                    // Arrived at vendor or path failed
                    if (this.targetVendor && this.isNearVendor(this.targetVendor)) {
                        // At the vendor - try to purchase
                        this.purchaseFood();
                    } else {
                        // Failed to reach vendor - go back to wandering
                        this.foodSeekingFailed = true;
                        this.targetVendor = null;
                        this.targetItem = null;
                        this.state = 'wandering';
                        this.stateTimer = 0;
                    }
                }
                // Timeout: give up after 30 seconds
                if (this.stateTimer > 30) {
                    this.foodSeekingFailed = true;
                    this.targetVendor = null;
                    this.targetItem = null;
                    this.state = 'wandering';
                    this.stateTimer = 0;
                }
                break;

            case 'seeking_seat':
                // Walking to a seat for sitting-type food
                if (!this.isMoving && this.currentPath.length === 0) {
                    if (this.targetSeat && this.isNearSeat(this.targetSeat.placeable)) {
                        // Arrived at seat - reserve it and start eating
                        this.targetSeat.placeable.reserveInteraction(
                            this.targetSeat.pointIndex,
                            this.id,
                            'guest'
                        );
                        this.state = 'eating';
                        this.stateTimer = 0;
                    } else {
                        // Failed to reach seat - eat while walking instead
                        this.targetSeat = null;
                        this.state = 'eating_walking';
                        this.stateTimer = 0;
                    }
                }
                // Timeout: give up after 30 seconds
                if (this.stateTimer > 30) {
                    this.targetSeat = null;
                    this.state = 'eating_walking';
                    this.stateTimer = 0;
                }
                break;

            case 'eating':
                // Sitting and eating (at a bench/table)
                if (this.stateTimer >= 5 + Math.random() * 3) {
                    // Done eating - release seat and back to wandering
                    if (this.targetSeat) {
                        this.targetSeat.placeable.releaseInteraction(this.id);
                        this.targetSeat = null;
                    }
                    this.currentFood = null;
                    this.state = 'wandering';
                    this.stateTimer = 0;
                    this.foodSeekingFailed = false;
                }
                break;

            case 'eating_walking':
                // Eating while walking around
                if (this.stateTimer >= 4 + Math.random() * 2) {
                    // Done eating - back to wandering
                    this.currentFood = null;
                    this.state = 'wandering';
                    this.stateTimer = 0;
                    this.foodSeekingFailed = false;
                }
                // Continue wandering while eating
                if (!this.isMoving && this.currentPath.length === 0) {
                    this.chooseNextDestination();
                }
                break;

            case 'leaving':
                this.leavingTimer += dt;
                const entrance = this.game.world.getEntrancePosition();

                // Check if at the entrance area (bottom row, within entrance width)
                // Entrance is 3 tiles wide (center +/- 1)
                const atEntranceY = this.tileY >= entrance.y - 1; // Allow one tile before entrance too
                const atEntranceX = Math.abs(this.tileX - entrance.x) <= 1;

                if (atEntranceY && atEntranceX) {
                    this.state = 'left';
                    break;
                }

                // Timeout: if stuck trying to leave for too long, just leave
                if (this.leavingTimer > 30) {
                    this.state = 'left';
                    break;
                }

                // Head to exit - pick a random entrance tile to spread guests out
                if (!this.isMoving && this.currentPath.length === 0) {
                    const targetX = entrance.x + (Math.floor(Math.random() * 3) - 1);
                    this.requestPath(targetX, entrance.y, true, false);
                }
                break;
        }
    }

    /**
     * Choose next destination while wandering
     */
    protected async chooseNextDestination(): Promise<void> {
        // Prefer paths
        const nearbyPaths = this.findNearbyPaths();

        if (nearbyPaths.length > 0) {
            // Pick a random path tile
            const target = nearbyPaths[Math.floor(Math.random() * nearbyPaths.length)];
            await this.requestPath(target.x, target.y, true, false);
        } else {
            // Random adjacent move
            this.pickRandomAdjacent();
        }
    }

    /**
     * Find nearby path tiles
     */
    protected findNearbyPaths(): GridPos[] {
        const paths: GridPos[] = [];
        const searchRadius = 5;

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const x = this.tileX + dx;
                const y = this.tileY + dy;

                const tile = this.game.world.getTile(x, y);
                if (tile?.path) {
                    paths.push({ x, y });
                }
            }
        }

        return paths;
    }

    /**
     * Pick random adjacent tile
     */
    protected pickRandomAdjacent(): void {
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
     * Start leaving the zoo
     */
    protected async startLeaving(): Promise<void> {
        this.state = 'leaving';
        this.leavingTimer = 0;
        this.clearPath();

        const entrance = this.game.world.getEntrancePosition();
        // Pick a random tile in the 3-tile entrance area
        const targetX = entrance.x + (Math.floor(Math.random() * 3) - 1);
        await this.requestPath(targetX, entrance.y, true, false);
    }

    /**
     * Check if guest can walk on tile (prefers paths but can walk on terrain)
     */
    protected canWalkOn(tileX: number, tileY: number): boolean {
        const tile = this.game.world.getTile(tileX, tileY);
        if (!tile) return false;
        if (tile.terrain === 'water') return false;
        return true;
    }

    /**
     * View an exhibit (called when near an exhibit)
     */
    viewExhibit(exhibitId: number): void {
        this.exhibitsViewed.add(exhibitId);
        this.state = 'viewing';
        this.stateTimer = 0;
    }

    /**
     * Calculate happiness based on all factors
     * Uses subtractive penalty system: start at 100 and subtract penalties
     */
    protected calculateHappiness(): void {
        // Update hunger factor
        if (this.hunger >= 70) {
            this.happinessFactors.hunger = { value: this.hunger, penalty: 0, reason: 'Well fed' };
        } else if (this.hunger >= 40) {
            const penalty = ((70 - this.hunger) / 30) * (Guest.HAPPINESS_WEIGHTS.hunger * 0.5);
            this.happinessFactors.hunger = { value: this.hunger, penalty, reason: 'Getting hungry' };
        } else if (this.hunger >= 20) {
            const penalty = ((70 - this.hunger) / 50) * Guest.HAPPINESS_WEIGHTS.hunger;
            this.happinessFactors.hunger = { value: this.hunger, penalty, reason: 'Hungry' };
        } else {
            this.happinessFactors.hunger = { value: this.hunger, penalty: Guest.HAPPINESS_WEIGHTS.hunger, reason: 'Starving!' };
        }

        // Update thirst factor
        if (this.thirst >= 70) {
            this.happinessFactors.thirst = { value: this.thirst, penalty: 0, reason: 'Hydrated' };
        } else if (this.thirst >= 40) {
            const penalty = ((70 - this.thirst) / 30) * (Guest.HAPPINESS_WEIGHTS.thirst * 0.5);
            this.happinessFactors.thirst = { value: this.thirst, penalty, reason: 'Getting thirsty' };
        } else if (this.thirst >= 20) {
            const penalty = ((70 - this.thirst) / 50) * Guest.HAPPINESS_WEIGHTS.thirst;
            this.happinessFactors.thirst = { value: this.thirst, penalty, reason: 'Thirsty' };
        } else {
            this.happinessFactors.thirst = { value: this.thirst, penalty: Guest.HAPPINESS_WEIGHTS.thirst, reason: 'Parched!' };
        }

        // Update energy factor
        if (this.energy >= 50) {
            this.happinessFactors.energy = { value: this.energy, penalty: 0, reason: 'Energetic' };
        } else if (this.energy >= 25) {
            const penalty = ((50 - this.energy) / 25) * (Guest.HAPPINESS_WEIGHTS.energy * 0.5);
            this.happinessFactors.energy = { value: this.energy, penalty, reason: 'Getting tired' };
        } else {
            const penalty = ((50 - this.energy) / 50) * Guest.HAPPINESS_WEIGHTS.energy;
            this.happinessFactors.energy = { value: this.energy, penalty, reason: 'Exhausted' };
        }

        // Update exhibits factor - reward for seeing exhibits
        const exhibitCount = this.exhibitsViewed.size;
        if (exhibitCount >= 3) {
            this.happinessFactors.exhibits = { value: 100, penalty: 0, reason: `Seen ${exhibitCount} exhibits!` };
        } else if (exhibitCount >= 1) {
            const penalty = Guest.HAPPINESS_WEIGHTS.exhibits * (1 - exhibitCount / 3);
            this.happinessFactors.exhibits = { value: exhibitCount * 33, penalty, reason: `Seen ${exhibitCount} exhibit${exhibitCount > 1 ? 's' : ''}` };
        } else {
            this.happinessFactors.exhibits = { value: 0, penalty: Guest.HAPPINESS_WEIGHTS.exhibits, reason: 'No exhibits viewed' };
        }

        // Calculate total happiness (100 minus all penalties)
        let totalPenalty = 0;
        for (const factor of Object.values(this.happinessFactors)) {
            totalPenalty += factor.penalty;
        }

        this.happiness = Math.max(0, Math.min(100, 100 - totalPenalty));
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return '🧑';
    }

    // =========================================
    // Food Seeking Behavior
    // =========================================

    /**
     * Check if guest should seek food based on hunger level
     */
    private checkShouldSeekFood(): void {
        // Hunger thresholds for seeking food
        // 70-100: Not hungry, won't seek
        // 40-70: Mildly hungry, only seek if favorite food is very close
        // 20-40: Hungry, actively seek food
        // 0-20: Starving, desperately seek any food

        if (this.hunger >= 70) {
            return;  // Not hungry
        }

        // Find best food option
        const result = this.findBestFoodVendor();
        if (!result) {
            // No food available
            if (this.hunger < 20) {
                // Starving and no food - might leave
                this.foodSeekingFailed = true;
            }
            return;
        }

        const { vendor, item, score, distance } = result;

        // Decide whether to seek based on hunger level and score
        let shouldSeek = false;

        if (this.hunger < 20) {
            // Starving - seek any food
            shouldSeek = true;
        } else if (this.hunger < 40) {
            // Hungry - seek if score is decent
            shouldSeek = score > 20;
        } else {
            // Mildly hungry - only seek favorites if close
            const hasFavorite = this.favoriteFoods.includes(item.name);
            shouldSeek = hasFavorite && distance < 10;
        }

        if (shouldSeek) {
            this.startSeekingFood(vendor, item);
        }
    }

    /**
     * Find the best food vendor based on preferences and distance
     * Returns null if no suitable vendor found
     */
    private findBestFoodVendor(): { vendor: Vendor; item: VendorItem; score: number; distance: number } | null {
        const vendors = this.game.getFoodVendors();
        if (vendors.length === 0) return null;

        let bestResult: { vendor: Vendor; item: VendorItem; score: number; distance: number } | null = null;
        let bestScore = -Infinity;

        for (const vendor of vendors) {
            if (!vendor.canServe()) continue;

            const items = vendor.getItems();
            for (const item of items) {
                // Only consider food items (not drinks for hunger)
                if (item.type === 'drink') continue;

                // Calculate distance (Manhattan distance)
                const distance = Math.abs(this.tileX - vendor.tileX) + Math.abs(this.tileY - vendor.tileY);

                // Calculate score
                let score = item.satisfaction;

                // Bonus for favorite food (+50)
                if (this.favoriteFoods.includes(item.name)) {
                    score += 50;
                }

                // Bonus for preferred category (+25)
                if (item.category === this.preferredFoodCategory) {
                    score += 25;
                }

                // Distance penalty (closer is better)
                score -= distance * 2;

                // Happiness bonus from item itself
                if (item.happinessBonus) {
                    score += item.happinessBonus;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestResult = { vendor, item, score, distance };
                }
            }
        }

        return bestResult;
    }

    /**
     * Start walking to a food vendor
     */
    private async startSeekingFood(vendor: Vendor, item: VendorItem): Promise<void> {
        this.state = 'seeking_food';
        this.stateTimer = 0;
        this.targetVendor = vendor;
        this.targetItem = item;
        this.clearPath();

        // Get the vendor's purchase interaction point
        const purchasePoints = vendor.getInteractionPointsByType('purchase');
        if (purchasePoints.length === 0) {
            // Fallback if no purchase point defined
            await this.requestPath(vendor.tileX, vendor.tileY + 1, true, false);
            return;
        }

        const point = purchasePoints[0];

        // Calculate target position based on approach type
        let targetX = point.worldX;
        let targetY = point.worldY;

        if (point.approach === 'approach') {
            // Stand adjacent to the interaction point, based on facing direction
            // The facing direction is where the entity looks FROM the adjacent tile
            // So we offset in the opposite direction
            switch (point.worldFacing) {
                case 'south': targetX += 1; break;  // Stand to the south (+X)
                case 'north': targetX -= 1; break;  // Stand to the north (-X)
                case 'west': targetY += 1; break;   // Stand to the west (+Y)
                case 'east': targetY -= 1; break;   // Stand to the east (-Y)
            }
        }
        // For 'inside' or undefined, path directly to the interaction tile

        await this.requestPath(targetX, targetY, true, false);
    }

    /**
     * Check if guest is near enough to a vendor to purchase
     */
    private isNearVendor(vendor: Vendor): boolean {
        const dx = Math.abs(this.tileX - vendor.tileX);
        const dy = Math.abs(this.tileY - vendor.tileY);
        return dx <= 2 && dy <= 2;
    }

    /**
     * Purchase food from the target vendor
     */
    private purchaseFood(): void {
        if (!this.targetVendor || !this.targetItem) {
            this.state = 'wandering';
            this.stateTimer = 0;
            return;
        }

        // Try to purchase
        const item = this.targetVendor.purchase(this.targetItem.name);
        if (item) {
            // Success! Apply satisfaction
            let satisfaction = item.satisfaction;

            // Bonus for favorite food
            if (this.favoriteFoods.includes(item.name)) {
                satisfaction += 15;
            }

            // Bonus for preferred category
            if (item.category === this.preferredFoodCategory) {
                satisfaction += 8;
            }

            // Apply hunger satisfaction
            this.hunger = Math.min(100, this.hunger + satisfaction);

            // Store current food for emoji display
            this.currentFood = item;

            // Handle different consumption types
            switch (item.consumptionType) {
                case 'immediate':
                    // Eat right at the vendor - quick eating
                    this.state = 'eating';
                    this.stateTimer = 0;
                    break;

                case 'walking':
                    // Eat while walking around
                    this.state = 'eating_walking';
                    this.stateTimer = 0;
                    break;

                case 'sitting':
                    // Need to find a seat
                    const seat = this.findNearestAvailableSeat();
                    if (seat) {
                        this.targetSeat = seat;
                        this.startSeekingSeat(seat);
                    } else {
                        // No seats available - eat while walking instead
                        this.state = 'eating_walking';
                        this.stateTimer = 0;
                    }
                    break;
            }
        } else {
            // Purchase failed - maybe out of stock
            this.foodSeekingFailed = true;
            this.state = 'wandering';
            this.stateTimer = 0;
        }

        // Clear vendor targets (keep currentFood for display)
        this.targetVendor = null;
        this.targetItem = null;
    }

    /**
     * Find the nearest available seat (bench or picnic table)
     */
    private findNearestAvailableSeat(): { placeable: Placeable; pointIndex: number } | null {
        const placeables = this.game.getAllPlaceables();
        let bestSeat: { placeable: Placeable; pointIndex: number; distance: number } | null = null;

        for (const placeable of placeables) {
            // Use Placeable's built-in method to find available sit interactions
            const available = placeable.findAvailableInteraction('sit', 'guest', this.tileX, this.tileY);
            if (!available) continue;

            // Calculate distance
            const distance = Math.abs(this.tileX - available.worldX) + Math.abs(this.tileY - available.worldY);

            if (!bestSeat || distance < bestSeat.distance) {
                bestSeat = { placeable, pointIndex: available.index, distance };
            }
        }

        return bestSeat ? { placeable: bestSeat.placeable, pointIndex: bestSeat.pointIndex } : null;
    }

    /**
     * Start walking to a seat
     */
    private async startSeekingSeat(seat: { placeable: Placeable; pointIndex: number }): Promise<void> {
        this.state = 'seeking_seat';
        this.stateTimer = 0;
        this.clearPath();

        // Get the interaction points with world coordinates
        const points = seat.placeable.getInteractionPoints();
        const interaction = points[seat.pointIndex];
        if (!interaction) return;

        // Path to the seat position (using world coordinates)
        await this.requestPath(interaction.worldX, interaction.worldY, true, false);
    }

    /**
     * Check if guest is near enough to a seat
     */
    private isNearSeat(placeable: Placeable): boolean {
        const dx = Math.abs(this.tileX - placeable.tileX);
        const dy = Math.abs(this.tileY - placeable.tileY);
        // Allow being on or adjacent to the placeable
        return dx <= 2 && dy <= 2;
    }

    /**
     * Get the food emoji for current food (for display)
     */
    getFoodEmoji(): string | null {
        if (!this.currentFood) return null;

        // Map food names to emojis
        const foodEmojis: Record<string, string> = {
            'Burger': '🍔',
            'Fries': '🍟',
            'Soda': '🥤',
            'Water': '💧',
            'Lemonade': '🍋',
            'Chips': '🍿',
            'Candy': '🍬',
        };

        return foodEmojis[this.currentFood.name] || '🍽️';
    }
}
