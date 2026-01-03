import { Entity } from './Entity';
import type { Game } from '../core/Game';
import type { EntityType, GridPos, AnimalSpecies, GuestFoodCategory, GuestNeed, InteractionPoint, EdgeDirection } from '../core/types';
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
    public state: 'entering' | 'wandering' | 'viewing' | 'seeking_need' | 'seeking_seat' | 'eating' | 'eating_walking' | 'leaving' | 'left' = 'entering';
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

    // Needs-based seeking state
    private currentNeed: GuestNeed | null = null;
    private targetPlaceable: Placeable | null = null;
    private targetInteraction: (InteractionPoint & { worldX: number; worldY: number; worldFacing?: EdgeDirection }) | null = null;
    private needSeekingFailed: Map<GuestNeed, boolean> = new Map();

    // Legacy: keep targetVendor/targetItem for purchase interactions
    private targetVendor: Vendor | null = null;
    private targetItem: VendorItem | null = null;

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

        // Check if should seek to satisfy needs (only when wandering)
        if (this.state === 'wandering') {
            this.checkNeeds();
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

            case 'seeking_need':
                // Walking to interaction point to satisfy a need
                if (!this.isMoving && this.currentPath.length === 0) {
                    // Arrived at destination or path failed
                    if (this.targetVendor && this.isNearVendor(this.targetVendor)) {
                        // At the vendor - try to purchase based on current need
                        this.completePurchase();
                    } else if (this.targetPlaceable && this.isNearPlaceable(this.targetPlaceable)) {
                        // At a non-vendor interaction point
                        this.completeInteraction();
                    } else {
                        // Failed to reach target - mark need as failed
                        if (this.currentNeed) {
                            this.needSeekingFailed.set(this.currentNeed, true);
                        }
                        this.clearSeekingState();
                        this.state = 'wandering';
                        this.stateTimer = 0;
                    }
                }
                // Timeout: give up after 30 seconds
                if (this.stateTimer > 30) {
                    if (this.currentNeed) {
                        this.needSeekingFailed.set(this.currentNeed, true);
                    }
                    this.clearSeekingState();
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
                // Sitting and eating (at a bench/table) or resting
                if (this.stateTimer >= 5 + Math.random() * 3) {
                    // Done eating/resting - release seat and back to wandering
                    if (this.targetSeat) {
                        this.targetSeat.placeable.releaseInteraction(this.id);
                        this.targetSeat = null;
                    }
                    this.currentFood = null;
                    this.state = 'wandering';
                    this.stateTimer = 0;
                    // Clear all seeking failed flags - guest can try again
                    this.needSeekingFailed.clear();
                }
                break;

            case 'eating_walking':
                // Eating while walking around
                if (this.stateTimer >= 4 + Math.random() * 2) {
                    // Done eating - back to wandering
                    this.currentFood = null;
                    this.state = 'wandering';
                    this.stateTimer = 0;
                    // Clear all seeking failed flags - guest can try again
                    this.needSeekingFailed.clear();
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
    // Unified Needs-Based Seeking System
    // =========================================

    /**
     * Check all needs and start seeking if necessary
     */
    private checkNeeds(): void {
        // Priority order: thirst > hunger > energy
        // (Thirst is slightly more urgent as it decays faster)

        // Check thirst first
        if (this.thirst < 70 && !this.needSeekingFailed.get('thirst')) {
            if (this.trySeekNeed('thirst')) return;
        }

        // Check hunger
        if (this.hunger < 70 && !this.needSeekingFailed.get('hunger')) {
            if (this.trySeekNeed('hunger')) return;
        }

        // Check energy (seek benches/rest areas)
        if (this.energy < 40 && !this.needSeekingFailed.get('energy')) {
            if (this.trySeekNeed('energy')) return;
        }
    }

    /**
     * Try to start seeking an interaction that satisfies a need
     * Returns true if successfully started seeking
     */
    private trySeekNeed(need: GuestNeed): boolean {
        // Find all interactions that satisfy this need
        const interactions = this.game.findInteractionsSatisfying(need, this.tileX, this.tileY);

        if (interactions.length === 0) {
            // No interactions available for this need
            if (this.getNeedValue(need) < 20) {
                // Critical need but no way to satisfy - mark as failed
                this.needSeekingFailed.set(need, true);
            }
            return false;
        }

        // Determine urgency and choose whether to seek
        const needValue = this.getNeedValue(need);
        let shouldSeek = false;

        if (needValue < 20) {
            // Critical - seek immediately
            shouldSeek = true;
        } else if (needValue < 40) {
            // Urgent - seek if reasonable option nearby
            shouldSeek = interactions[0].distance < 20;
        } else if (needValue < 70) {
            // Mild need - only seek if very close or has favorite item
            const closest = interactions[0];
            shouldSeek = closest.distance < 10;
        }

        if (shouldSeek) {
            // Pick the best (closest) interaction
            const best = interactions[0];
            this.startSeekingNeed(need, best);
            return true;
        }

        return false;
    }

    /**
     * Get the current value for a need (0-100)
     */
    private getNeedValue(need: GuestNeed): number {
        switch (need) {
            case 'hunger': return this.hunger;
            case 'thirst': return this.thirst;
            case 'energy': return this.energy;
            default: return 100; // Fully satisfied for untracked needs
        }
    }

    /**
     * Start seeking an interaction point to satisfy a need
     */
    private async startSeekingNeed(
        need: GuestNeed,
        interaction: InteractionPoint & { worldX: number; worldY: number; worldFacing?: EdgeDirection; placeable: Placeable }
    ): Promise<void> {
        this.state = 'seeking_need';
        this.stateTimer = 0;
        this.currentNeed = need;
        this.targetPlaceable = interaction.placeable;
        this.targetInteraction = interaction;
        this.clearPath();

        // Check if placeable is a Vendor for purchase interactions
        if (interaction.type === 'purchase') {
            const vendor = interaction.placeable as unknown as Vendor;
            if ('getItems' in vendor) {
                this.targetVendor = vendor;
                // Find best item that satisfies this need
                const items = vendor.getItems();
                const matchingItems = items.filter(item => {
                    if (need === 'hunger') return item.type === 'food';
                    if (need === 'thirst') return item.type === 'drink';
                    return true;
                });
                if (matchingItems.length > 0) {
                    // Pick item with best score (considering preferences)
                    let bestItem = matchingItems[0];
                    let bestScore = 0;
                    for (const item of matchingItems) {
                        let score = item.satisfaction;
                        if (this.favoriteFoods.includes(item.name)) score += 50;
                        if (item.category === this.preferredFoodCategory) score += 25;
                        if (score > bestScore) {
                            bestScore = score;
                            bestItem = item;
                        }
                    }
                    this.targetItem = bestItem;
                }
            }
        }

        // Use placeable's calculateApproachTile method for consistent approach handling
        const approachTile = interaction.placeable.calculateApproachTile(
            interaction,
            this.tileX,
            this.tileY
        );

        await this.requestPath(approachTile.x, approachTile.y, true, false);
    }

    /**
     * Clear all seeking-related state
     */
    private clearSeekingState(): void {
        this.currentNeed = null;
        this.targetPlaceable = null;
        this.targetInteraction = null;
        this.targetVendor = null;
        this.targetItem = null;
    }

    /**
     * Check if guest is near enough to a placeable
     */
    private isNearPlaceable(placeable: Placeable): boolean {
        const dx = Math.abs(this.tileX - placeable.tileX);
        const dy = Math.abs(this.tileY - placeable.tileY);
        return dx <= placeable.width + 1 && dy <= placeable.depth + 1;
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
     * Complete a purchase interaction (food/drink vendor)
     */
    private completePurchase(): void {
        if (!this.targetVendor || !this.targetItem || !this.currentNeed) {
            this.clearSeekingState();
            this.state = 'wandering';
            this.stateTimer = 0;
            return;
        }

        const item = this.targetVendor.purchase(this.targetItem.name);
        if (item) {
            // Successful purchase!
            let satisfaction = item.satisfaction;

            // Bonus for favorite food
            if (this.favoriteFoods.includes(item.name)) {
                satisfaction += 15;
            }

            // Bonus for preferred category
            if (item.category === this.preferredFoodCategory) {
                satisfaction += 8;
            }

            // Apply satisfaction to the appropriate need
            if (this.currentNeed === 'hunger') {
                this.hunger = Math.min(100, this.hunger + satisfaction);
            } else if (this.currentNeed === 'thirst') {
                this.thirst = Math.min(100, this.thirst + satisfaction);
            }

            // Small happiness boost
            if (item.happinessBonus) {
                this.happiness = Math.min(100, this.happiness + item.happinessBonus);
            }

            // Store current food for emoji display
            this.currentFood = item;

            // Reset the failed flag for this need since we succeeded
            this.needSeekingFailed.delete(this.currentNeed);

            // Handle consumption based on item type
            switch (item.consumptionType) {
                case 'immediate':
                    this.state = 'eating';
                    this.stateTimer = 0;
                    break;

                case 'walking':
                    this.state = 'eating_walking';
                    this.stateTimer = 0;
                    break;

                case 'sitting':
                    const seat = this.findNearestAvailableSeat();
                    if (seat) {
                        this.targetSeat = seat;
                        this.startSeekingSeat(seat);
                    } else {
                        this.state = 'eating_walking';
                        this.stateTimer = 0;
                    }
                    break;
            }
        } else {
            // Purchase failed - maybe out of stock
            if (this.currentNeed) {
                this.needSeekingFailed.set(this.currentNeed, true);
            }
            this.state = 'wandering';
            this.stateTimer = 0;
        }

        // Clear vendor targets (keep currentFood for display)
        this.clearSeekingState();
    }

    /**
     * Complete a non-vendor interaction (bench, bathroom, etc.)
     */
    private completeInteraction(): void {
        if (!this.targetPlaceable || !this.targetInteraction || !this.currentNeed) {
            this.clearSeekingState();
            this.state = 'wandering';
            this.stateTimer = 0;
            return;
        }

        const interaction = this.targetInteraction;
        const placeable = this.targetPlaceable;

        // Handle different interaction types
        switch (interaction.type) {
            case 'sit':
            case 'rest':
                // Reserve the seat
                if ('index' in interaction && typeof interaction.index === 'number') {
                    placeable.reserveInteraction(interaction.index, this.id, 'guest');
                    this.targetSeat = { placeable, pointIndex: interaction.index };
                }
                // Resting restores energy
                this.energy = Math.min(100, this.energy + 30);
                this.state = 'eating';  // Reuse eating state for sitting/resting
                this.stateTimer = 0;
                // Reset the failed flag since we succeeded
                this.needSeekingFailed.delete(this.currentNeed);
                break;

            case 'enter':
                // For enter-type interactions (bathroom, attractions)
                // Satisfy the need directly
                if (this.currentNeed === 'bathroom') {
                    // Bathroom doesn't have a stat, just make guest happy
                    this.happiness = Math.min(100, this.happiness + 10);
                } else if (this.currentNeed === 'fun') {
                    // Attractions boost happiness
                    this.happiness = Math.min(100, this.happiness + 20);
                }
                this.needSeekingFailed.delete(this.currentNeed);
                this.state = 'wandering';
                this.stateTimer = 0;
                break;

            default:
                this.state = 'wandering';
                this.stateTimer = 0;
                break;
        }

        this.clearSeekingState();
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
