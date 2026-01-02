import { Application } from 'pixi.js';
import { Camera } from './Camera';
import { World } from './World';
import { GameConfig, DEFAULT_CONFIG, GameSpeed, ToolType, AnimalSpecies, FoliageType, FoodType, Gender, FenceCondition, EdgeDirection, ShelterType, ShelterSize, PLACEABLE_CONFIGS } from './types';
import { Building, BurgerStand, DrinkStand, VendingMachine, Bathroom, GarbageCan, GiftShop, Restaurant, IndoorAttraction } from '../entities/buildings';
import { PathfindingManager } from '../systems/PathfindingManager';
import { Renderer } from '../systems/Renderer';
import { InputHandler } from '../systems/InputHandler';

// Entity imports
import { Animal } from '../entities/Animal';
import { Lion } from '../entities/animals/Lion';
import { Bison } from '../entities/animals/Bison';
import { Staff } from '../entities/Staff';
import { Zookeeper } from '../entities/staff/Zookeeper';
import { MaintenanceWorker } from '../entities/staff/MaintenanceWorker';
import { Guest } from '../entities/Guest';
import { Exhibit, checkForEnclosure } from '../entities/Exhibit';
import { Foliage } from '../entities/Foliage';
import { FoodPile } from '../entities/FoodPile';
import { Shelter } from '../entities/Shelter';
import { Placeable } from '../entities/Placeable';

/**
 * Main Game class - orchestrates all game systems.
 *
 * Architecture:
 * - Render loop: Runs every frame (requestAnimationFrame)
 * - Simulation loop: Fixed timestep (e.g., 10 Hz)
 * - Pathfinding: Async via Web Worker
 */
export class Game {
    // PixiJS Application
    public app: Application;

    // Core systems
    public camera: Camera;
    public world: World;
    public pathfinding: PathfindingManager;
    public renderer!: Renderer;
    public input!: InputHandler;

    // Game state
    public money: number;
    public speed: GameSpeed = 1;
    public paused: boolean = false;

    // Calendar
    public calendarDay: number = 1;
    public calendarMonth: number = 1;
    public calendarYear: number = 1;
    public totalDays: number = 0;

    // Time tracking
    private lastTime: number = 0;
    private simAccumulator: number = 0;
    private readonly simTickRate: number;
    private readonly simTickDuration: number;

    // Day timer (game days progress based on speed)
    private dayTimer: number = 0;
    private readonly baseDayLength: number = 10000; // 10 seconds at 1x speed

    // Guest spawning
    private guestSpawnTimer: number = 0;
    private readonly guestSpawnRate: number = 3; // seconds between guests
    public entranceFee: number = 20;
    private readonly maxGuests: number = 50;

    // Zoo stats
    public zooName: string = 'My Zoo';
    public totalVisitors: number = 0;

    // Fence condition tracking
    // Key format: "x,y,edge" -> { condition, timeUntilNextDegradation }
    private fenceConditions: Map<string, { condition: FenceCondition; degradeTimer: number }> = new Map();

    // Fence degradation settings (in game seconds)
    private readonly fenceDegradeBaseTime = 300; // Base time before first degradation (5 min at 1x)
    private readonly fenceDegradeVariance = 200; // Random variance (+/- seconds)

    // Current tool
    public currentTool: ToolType = 'select';
    public currentItem: string | null = null;

    // Configuration
    public readonly config: GameConfig;

    // Entity arrays
    public animals: Animal[] = [];
    public staff: Staff[] = [];
    public guests: Guest[] = [];
    public exhibits: Exhibit[] = [];
    public foliage: Foliage[] = [];
    public foodPiles: FoodPile[] = [];
    public shelters: Shelter[] = [];
    public buildings: Building[] = [];

    // Staff ID counters
    private staffIdCounters: Record<string, number> = {
        zookeeper: 0,
        maintenance: 0,
    };

    // Month names for display
    private readonly monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Ready state
    private _ready: boolean = false;
    private readyCallbacks: Array<() => void> = [];

    constructor(config: Partial<GameConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Create PixiJS application
        this.app = new Application();

        // Initialize core systems (app.init is async, handled in init())
        this.camera = new Camera(window.innerWidth, window.innerHeight);
        this.world = new World(this.config);
        this.pathfinding = new PathfindingManager();

        // Game state
        this.money = this.config.startingMoney;
        this.simTickRate = this.config.simTickRate;
        this.simTickDuration = 1000 / this.simTickRate;
    }

    /**
     * Initialize the game (async)
     */
    async init(): Promise<void> {
        // Initialize PixiJS
        await this.app.init({
            background: '#87CEEB',
            resizeTo: window,
            antialias: false,         // Disable for crisp pixel graphics
            roundPixels: true,        // Round positions to whole pixels for sharpness
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        // Add canvas to DOM
        const container = document.getElementById('pixi-container');
        if (container) {
            container.appendChild(this.app.canvas);
        }

        // Initialize pathfinding worker with game reference for gate info
        await this.pathfinding.initialize(this.world, this);

        // Create renderer and input handler
        this.renderer = new Renderer(this);
        this.input = new InputHandler(this);

        // Center camera on entrance
        const entrance = this.world.getEntrancePosition();
        this.camera.centerOnTile(entrance.x, entrance.y - 8);

        // Handle resize
        window.addEventListener('resize', () => this.handleResize());

        // Mark as ready
        this._ready = true;
        for (const callback of this.readyCallbacks) {
            callback();
        }
        this.readyCallbacks = [];
    }

    /**
     * Wait for game to be ready
     */
    onReady(callback: () => void): void {
        if (this._ready) {
            callback();
        } else {
            this.readyCallbacks.push(callback);
        }
    }

    /**
     * Start the game loop
     */
    start(): void {
        this.lastTime = performance.now();
        this.app.ticker.add(() => this.gameLoop());
    }

    /**
     * Main game loop
     */
    private gameLoop(): void {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        if (!this.paused && this.speed > 0) {
            // Simulation updates (fixed timestep)
            this.simAccumulator += deltaTime * this.speed;
            while (this.simAccumulator >= this.simTickDuration) {
                this.simAccumulator -= this.simTickDuration;
                this.simulationTick(this.simTickDuration / 1000);
            }

            // Day timer
            this.dayTimer += deltaTime * this.speed;
            const dayLength = this.baseDayLength / this.speed;
            if (this.dayTimer >= dayLength) {
                this.dayTimer -= dayLength;
                this.advanceDay();
            }
        }

        // Render (every frame)
        this.render();
    }

    /**
     * Fixed-rate simulation tick
     */
    private simulationTick(dt: number): void {
        // Spawn guests
        this.updateGuestSpawning(dt);

        // Update all animals
        for (const animal of this.animals) {
            animal.update(dt);
        }

        // Update all staff
        for (const staff of this.staff) {
            staff.update(dt);
        }

        // Update all guests
        for (const guest of this.guests) {
            guest.update(dt);
        }

        // Clean up empty food piles
        this.foodPiles = this.foodPiles.filter(fp => !fp.isEmpty());

        // Clean up guests that have left
        this.guests = this.guests.filter(g => g.state !== 'left');

        // Update fence degradation
        this.updateFenceConditions(dt);
    }

    /**
     * Spawn guests periodically
     */
    private updateGuestSpawning(dt: number): void {
        if (this.guests.length >= this.maxGuests) return;

        this.guestSpawnTimer += dt;

        if (this.guestSpawnTimer >= this.guestSpawnRate) {
            this.guestSpawnTimer = 0;
            const guest = this.spawnGuest();
            if (guest) {
                this.addMoney(this.entranceFee);
                this.totalVisitors++;
            }
        }
    }

    /**
     * Render the game
     */
    private render(): void {
        this.renderer.render();
    }

    /**
     * Advance the calendar by one day
     */
    private advanceDay(): void {
        this.totalDays++;
        this.calendarDay++;

        if (this.calendarDay > 30) {
            this.calendarDay = 1;
            this.calendarMonth++;

            if (this.calendarMonth > 12) {
                this.calendarMonth = 1;
                this.calendarYear++;
            }
        }

        this.updateDateDisplay();
        this.onNewDay();
    }

    /**
     * Called when a new day starts
     */
    private onNewDay(): void {
        // TODO: Daily events (staff salaries, guest spawning, etc.)
        console.log(`${this.getDateString()} - Day ${this.totalDays}`);
    }

    /**
     * Get formatted date string
     */
    getDateString(): string {
        const monthName = this.monthNames[this.calendarMonth - 1];
        return `${monthName} ${this.calendarDay}, Year ${this.calendarYear}`;
    }

    /**
     * Update the date display in the UI
     */
    private updateDateDisplay(): void {
        const dayElement = document.getElementById('day');
        if (dayElement) {
            dayElement.textContent = this.getDateString();
        }
    }

    /**
     * Set game speed
     */
    setSpeed(speed: GameSpeed): void {
        this.speed = speed;
        this.updateSpeedDisplay();
    }

    /**
     * Cycle through speeds
     */
    cycleSpeed(): void {
        const speeds: GameSpeed[] = [1, 2, 3, 0];
        const currentIndex = speeds.indexOf(this.speed);
        this.speed = speeds[(currentIndex + 1) % speeds.length];
        this.updateSpeedDisplay();
    }

    /**
     * Update speed button display
     */
    private updateSpeedDisplay(): void {
        const speedBtn = document.getElementById('speed-btn');
        if (speedBtn) {
            const labels: Record<GameSpeed, string> = { 0: '⏸', 1: '1x', 2: '2x', 3: '5x' };
            speedBtn.textContent = labels[this.speed];
            speedBtn.classList.toggle('fast', this.speed > 1);
        }
    }

    /**
     * Handle window resize
     */
    private handleResize(): void {
        this.camera.resize(window.innerWidth, window.innerHeight);
        this.renderer.handleResize();
    }

    /**
     * Set current tool
     */
    setTool(tool: ToolType): void {
        this.currentTool = tool;
        this.currentItem = null;
    }

    /**
     * Set current item (for placement tools)
     */
    setItem(item: string): void {
        this.currentItem = item;
    }

    /**
     * Spend money
     */
    spendMoney(amount: number): boolean {
        if (this.money >= amount) {
            this.money -= amount;
            this.updateMoneyDisplay();
            return true;
        }
        return false;
    }

    /**
     * Add money
     */
    addMoney(amount: number): void {
        this.money += amount;
        this.updateMoneyDisplay();
    }

    /**
     * Update money display
     */
    private updateMoneyDisplay(): void {
        const moneyElement = document.getElementById('money');
        if (moneyElement) {
            moneyElement.textContent = this.money.toLocaleString();
        }
    }

    // =============================================
    // Entity Management Methods
    // =============================================

    /**
     * Add an animal to the game (adults by default when placed from menu)
     */
    addAnimal(species: AnimalSpecies, tileX: number, tileY: number, gender?: Gender, isAdult: boolean = true): Animal | null {
        let animal: Animal;
        switch (species) {
            case 'lion':
                animal = new Lion(this, tileX, tileY, gender);
                break;
            case 'bison':
                animal = new Bison(this, tileX, tileY, gender);
                break;
            default:
                console.warn(`Unknown species: ${species}`);
                return null;
        }

        // Animals from menu are adults
        if (isAdult) {
            animal.age = animal['maturityAge'] || 365;
        }

        this.animals.push(animal);
        return animal;
    }

    /**
     * Remove an animal from the game (by object or ID)
     */
    removeAnimal(animalOrId: Animal | number): void {
        if (typeof animalOrId === 'number') {
            const index = this.animals.findIndex(a => a.id === animalOrId);
            if (index !== -1) {
                this.animals.splice(index, 1);
            }
        } else {
            const index = this.animals.indexOf(animalOrId);
            if (index !== -1) {
                this.animals.splice(index, 1);
            }
        }
    }

    /**
     * Spawn a baby animal (called from Animal breeding)
     */
    spawnBabyAnimal(species: AnimalSpecies, tileX: number, tileY: number, gender?: Gender): Animal | null {
        const baby = this.addAnimal(species, tileX, tileY, gender, false); // Not adult
        if (baby) {
            baby.age = 0;
            console.log(`A baby ${species} was born!`);
        }
        return baby;
    }

    /**
     * Add a staff member to the game
     */
    addStaff(staffType: string, tileX: number, tileY: number): Staff | null {
        let staff: Staff;
        switch (staffType) {
            case 'zookeeper':
                staff = new Zookeeper(this, tileX, tileY);
                break;
            case 'maintenance':
                staff = new MaintenanceWorker(this, tileX, tileY);
                break;
            default:
                console.warn(`Unknown staff type: ${staffType}`);
                return null;
        }
        this.staff.push(staff);
        return staff;
    }

    /**
     * Remove a staff member from the game (by object or ID)
     */
    removeStaff(staffOrId: Staff | number): void {
        if (typeof staffOrId === 'number') {
            const index = this.staff.findIndex(s => s.id === staffOrId);
            if (index !== -1) {
                this.staff.splice(index, 1);
            }
        } else {
            const index = this.staff.indexOf(staffOrId);
            if (index !== -1) {
                this.staff.splice(index, 1);
            }
        }
    }

    /**
     * Get next staff ID for a type
     */
    getNextStaffId(staffType: string): number {
        if (!this.staffIdCounters[staffType]) {
            this.staffIdCounters[staffType] = 0;
        }
        return ++this.staffIdCounters[staffType];
    }

    /**
     * Spawn a guest at the entrance
     */
    spawnGuest(): Guest {
        const entrance = this.world.getEntrancePosition();
        const guest = new Guest(this, entrance.x, entrance.y);
        this.guests.push(guest);
        return guest;
    }

    /**
     * Get current tile space usage from foliage
     */
    getTileSpaceUsage(tileX: number, tileY: number): number {
        let usage = 0;
        for (const f of this.foliage) {
            if (f.tileX === tileX && f.tileY === tileY) {
                usage += f.tileSpace;
            }
        }
        return usage;
    }

    /**
     * Add foliage to the game
     */
    addFoliage(tileX: number, tileY: number, foliageType: FoliageType): Foliage | null {
        const tile = this.world.getTile(tileX, tileY);
        if (!tile) return null;
        if (!Foliage.canPlaceOn(foliageType, tile.terrain)) return null;

        // Check tile capacity
        const currentUsage = this.getTileSpaceUsage(tileX, tileY);
        if (!Foliage.hasSpaceOnTile(foliageType, currentUsage)) return null;

        const foliageItem = new Foliage(this, tileX, tileY, foliageType);
        this.foliage.push(foliageItem);
        return foliageItem;
    }

    /**
     * Remove foliage from the game (by object or ID)
     */
    removeFoliage(foliageOrId: Foliage | number): void {
        if (typeof foliageOrId === 'number') {
            const index = this.foliage.findIndex(f => f.id === foliageOrId);
            if (index !== -1) {
                this.foliage.splice(index, 1);
            }
        } else {
            const index = this.foliage.indexOf(foliageOrId);
            if (index !== -1) {
                this.foliage.splice(index, 1);
            }
        }
    }

    /**
     * Add a food pile to the game
     */
    addFoodPile(tileX: number, tileY: number, foodType: FoodType, amount: number = 500): FoodPile {
        const pile = new FoodPile(this, tileX, tileY, foodType, amount);
        this.foodPiles.push(pile);
        return pile;
    }

    /**
     * Remove a food pile from the game
     */
    removeFoodPile(pile: FoodPile): void {
        const index = this.foodPiles.indexOf(pile);
        if (index !== -1) {
            this.foodPiles.splice(index, 1);
        }
    }

    // =============================================
    // Shelter Methods
    // =============================================

    /**
     * Add a shelter to the game
     */
    addShelter(tileX: number, tileY: number, shelterType: ShelterType, size: ShelterSize, rotation: number = 0): Shelter | null {
        // Check if placement is valid
        if (!Shelter.canPlaceShelter(this, tileX, tileY, size, rotation)) {
            return null;
        }

        const shelter = new Shelter(this, tileX, tileY, shelterType, size, rotation);
        this.shelters.push(shelter);

        // Update pathfinding with blocked tiles
        this.pathfinding.updateWorld(this.world);

        return shelter;
    }

    /**
     * Remove a shelter from the game
     */
    removeShelter(shelterOrId: Shelter | number): void {
        let removed = false;
        if (typeof shelterOrId === 'number') {
            const index = this.shelters.findIndex(s => s.id === shelterOrId);
            if (index !== -1) {
                this.shelters.splice(index, 1);
                removed = true;
            }
        } else {
            const index = this.shelters.indexOf(shelterOrId);
            if (index !== -1) {
                this.shelters.splice(index, 1);
                removed = true;
            }
        }

        // Update pathfinding to remove blocked tiles
        if (removed) {
            this.pathfinding.updateWorld(this.world);
        }
    }

    /**
     * Get shelter at a specific tile
     */
    getShelterAtTile(tileX: number, tileY: number): Shelter | null {
        for (const shelter of this.shelters) {
            if (shelter.occupiesTile(tileX, tileY)) {
                return shelter;
            }
        }
        return null;
    }

    /**
     * Get any placeable at a specific tile
     * Checks all placeable types (shelters, buildings, and future placeables)
     */
    getPlaceableAtTile(tileX: number, tileY: number): Placeable | null {
        // Check shelters (which are placeables)
        const shelter = this.getShelterAtTile(tileX, tileY);
        if (shelter) return shelter;

        // Check buildings
        const building = this.getBuildingAtTile(tileX, tileY);
        if (building) return building;

        return null;
    }

    /**
     * Get shelters in an exhibit
     */
    getSheltersInExhibit(exhibit: Exhibit): Shelter[] {
        return this.shelters.filter(shelter => {
            const tiles = shelter.getOccupiedTiles();
            return tiles.some(tile => exhibit.containsTile(tile.x, tile.y));
        });
    }

    // =============================================
    // Building Methods
    // =============================================

    /**
     * Add a building to the game
     */
    addBuilding(tileX: number, tileY: number, buildingType: string, rotation: number = 0): Building | null {
        const config = PLACEABLE_CONFIGS[buildingType];
        if (!config) {
            console.warn(`Unknown building type: ${buildingType}`);
            return null;
        }

        // Check if placement is valid
        if (!this.canPlaceBuilding(tileX, tileY, buildingType, rotation)) {
            return null;
        }

        // Create the appropriate building subclass
        let building: Building;
        switch (buildingType) {
            case 'burger_stand':
                building = new BurgerStand(this, tileX, tileY, rotation);
                break;
            case 'drink_stand':
                building = new DrinkStand(this, tileX, tileY, rotation);
                break;
            case 'vending_machine':
                building = new VendingMachine(this, tileX, tileY, rotation);
                break;
            case 'bathroom':
                building = new Bathroom(this, tileX, tileY, rotation);
                break;
            case 'garbage_can':
                building = new GarbageCan(this, tileX, tileY, rotation);
                break;
            case 'gift_shop':
                building = new GiftShop(this, tileX, tileY, rotation);
                break;
            case 'restaurant':
                building = new Restaurant(this, tileX, tileY, rotation);
                break;
            case 'indoor_attraction':
                building = new IndoorAttraction(this, tileX, tileY, rotation);
                break;
            default:
                console.warn(`No building class for type: ${buildingType}`);
                return null;
        }

        this.buildings.push(building);

        // Update pathfinding with blocked tiles
        this.pathfinding.updateWorld(this.world);

        return building;
    }

    /**
     * Check if a building can be placed at a location
     */
    canPlaceBuilding(tileX: number, tileY: number, buildingType: string, rotation: number = 0): boolean {
        const config = PLACEABLE_CONFIGS[buildingType];
        if (!config) return false;

        // Get rotated dimensions
        const isRotated = rotation === 1 || rotation === 3;
        const width = isRotated ? config.depth : config.width;
        const depth = isRotated ? config.width : config.depth;

        // Check all tiles the building would occupy
        for (let dx = 0; dx < width; dx++) {
            for (let dy = 0; dy < depth; dy++) {
                const checkX = tileX + dx;
                const checkY = tileY + dy;

                // Check tile exists and is valid terrain
                const tile = this.world.getTile(checkX, checkY);
                if (!tile) return false;

                // Can't place on water
                if (tile.terrain === 'water') return false;

                // Can't place on paths (buildings should be off-path)
                if (tile.path) return false;

                // Check for existing buildings
                if (this.getBuildingAtTile(checkX, checkY)) return false;

                // Check for existing shelters
                if (this.getShelterAtTile(checkX, checkY)) return false;
            }
        }

        return true;
    }

    /**
     * Remove a building from the game
     */
    removeBuilding(buildingOrId: Building | number): void {
        let removed = false;
        if (typeof buildingOrId === 'number') {
            const index = this.buildings.findIndex(b => b.id === buildingOrId);
            if (index !== -1) {
                this.buildings.splice(index, 1);
                removed = true;
            }
        } else {
            const index = this.buildings.indexOf(buildingOrId);
            if (index !== -1) {
                this.buildings.splice(index, 1);
                removed = true;
            }
        }

        // Update pathfinding
        if (removed) {
            this.pathfinding.updateWorld(this.world);
        }
    }

    /**
     * Get building at a specific tile
     */
    getBuildingAtTile(tileX: number, tileY: number): Building | null {
        for (const building of this.buildings) {
            if (building.occupiesTile(tileX, tileY)) {
                return building;
            }
        }
        return null;
    }

    /**
     * Get all buildings with purchase interactions (for guest AI)
     */
    getPurchaseBuildings(): Building[] {
        return this.buildings.filter(building => {
            const config = PLACEABLE_CONFIGS[building.placeableType];
            return config?.interactions.some(i => i.type === 'purchase');
        });
    }

    /**
     * Get all vendor buildings
     */
    getVendors(): Building[] {
        return this.buildings.filter(b => b.getBuildingCategory() === 'vendor');
    }

    /**
     * Get all shop buildings
     */
    getShops(): Building[] {
        return this.buildings.filter(b => b.getBuildingCategory() === 'shop');
    }

    /**
     * Get all amenity buildings
     */
    getAmenities(): Building[] {
        return this.buildings.filter(b => b.getBuildingCategory() === 'amenity');
    }

    /**
     * Get all attraction buildings
     */
    getAttractions(): Building[] {
        return this.buildings.filter(b => b.getBuildingCategory() === 'attraction');
    }

    // =============================================
    // Exhibit Methods
    // =============================================

    // Pending exhibit waiting for user naming
    private pendingExhibit: Exhibit | null = null;

    /**
     * Check for and create an exhibit when a fence is placed
     * @param gateEdge - Optional edge to use as the gate (defaults to the checking edge)
     */
    checkForNewExhibit(tileX: number, tileY: number, edge: string, gateEdge?: { tileX: number; tileY: number; edge: string }): Exhibit | null {
        console.log(`Checking for enclosure at (${tileX}, ${tileY}) edge: ${edge}`);

        const result = checkForEnclosure(
            this,
            tileX,
            tileY,
            edge as any,
            this.exhibits
        );

        console.log(`Enclosure result: enclosed=${result.enclosed}, tiles=${result.interiorTiles.length}`);

        if (result.enclosed && result.interiorTiles.length > 0) {
            console.log('*** ENCLOSURE DETECTED! Creating exhibit... ***');

            const exhibit = new Exhibit(this);
            exhibit.setInteriorTiles(result.interiorTiles);
            exhibit.setPerimeter(result.perimeterFences);

            // Use the provided gate edge, or default to the checking edge
            const gateX = gateEdge?.tileX ?? tileX;
            const gateY = gateEdge?.tileY ?? tileY;
            const gateEdgeName = gateEdge?.edge ?? edge;

            const tile = this.world.getTile(gateX, gateY);
            const fenceType = tile?.fences[gateEdgeName as keyof typeof tile.fences] || null;
            exhibit.setGate(gateX, gateY, gateEdgeName as any, fenceType);

            // Show the naming modal
            console.log('Showing exhibit modal...');
            this.showExhibitModal(exhibit);
            return exhibit;
        }

        console.log('No enclosure detected');
        return null;
    }

    /**
     * Show the exhibit creation modal
     */
    private showExhibitModal(exhibit: Exhibit): void {
        this.pendingExhibit = exhibit;

        const modal = document.getElementById('exhibit-modal');
        const sizeSpan = document.getElementById('exhibit-size');
        const nameInput = document.getElementById('exhibit-name-input') as HTMLInputElement;
        const confirmBtn = document.getElementById('exhibit-confirm-btn');
        const cancelBtn = document.getElementById('exhibit-cancel-btn');
        const backdrop = modal?.querySelector('.modal-backdrop');

        if (!modal || !sizeSpan || !nameInput || !confirmBtn || !cancelBtn) return;

        // Update modal content
        sizeSpan.textContent = exhibit.interiorTiles.length.toString();
        nameInput.value = '';
        nameInput.placeholder = `Exhibit #${exhibit.id}`;

        // Show modal
        modal.classList.remove('hidden');

        // Focus input
        setTimeout(() => nameInput.focus(), 100);

        // Handle confirm
        const handleConfirm = () => {
            const name = nameInput.value.trim() || `Exhibit #${exhibit.id}`;
            exhibit.setName(name);
            this.exhibits.push(exhibit);
            console.log(`Created new exhibit: ${exhibit.name} with ${exhibit.interiorTiles.length} tiles`);
            this.hideExhibitModal();
            cleanup();
        };

        // Handle cancel
        const handleCancel = () => {
            // Remove the fences that created this exhibit? Or just don't register it
            this.pendingExhibit = null;
            this.hideExhibitModal();
            cleanup();
        };

        // Handle enter key
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                handleConfirm();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };

        // Cleanup event listeners
        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            backdrop?.removeEventListener('click', handleCancel);
            nameInput.removeEventListener('keydown', handleKeydown);
        };

        // Add event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        backdrop?.addEventListener('click', handleCancel);
        nameInput.addEventListener('keydown', handleKeydown);
    }

    /**
     * Hide the exhibit creation modal
     */
    private hideExhibitModal(): void {
        const modal = document.getElementById('exhibit-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.pendingExhibit = null;
    }

    /**
     * Get the exhibit at a specific tile
     */
    getExhibitAtTile(tileX: number, tileY: number): Exhibit | null {
        for (const exhibit of this.exhibits) {
            if (exhibit.containsTile(tileX, tileY)) {
                return exhibit;
            }
        }
        return null;
    }

    /**
     * Get animals in an exhibit
     */
    getAnimalsInExhibit(exhibit: Exhibit): Animal[] {
        return this.animals.filter(animal =>
            exhibit.containsTile(animal.tileX, animal.tileY)
        );
    }

    /**
     * Get food piles in an exhibit
     */
    getFoodPilesInExhibit(exhibit: Exhibit): FoodPile[] {
        return this.foodPiles.filter(pile =>
            exhibit.containsTile(pile.tileX, pile.tileY)
        );
    }

    /**
     * Get foliage in an exhibit
     */
    getFoliageInExhibit(exhibit: Exhibit): Foliage[] {
        return this.foliage.filter(f =>
            exhibit.containsTile(f.tileX, f.tileY)
        );
    }

    /**
     * Remove an exhibit
     */
    removeExhibit(exhibit: Exhibit): void {
        const index = this.exhibits.indexOf(exhibit);
        if (index !== -1) {
            this.exhibits.splice(index, 1);
        }
    }

    /**
     * Check if a fence edge is a gate
     */
    isGateAt(tileX: number, tileY: number, edge: string): boolean {
        for (const exhibit of this.exhibits) {
            if (exhibit.isGateAt(tileX, tileY, edge as any)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get the exhibit that has a gate at this location
     */
    getExhibitByGate(tileX: number, tileY: number, edge: string): Exhibit | null {
        for (const exhibit of this.exhibits) {
            if (exhibit.isGateAt(tileX, tileY, edge as any)) {
                return exhibit;
            }
        }
        return null;
    }

    // ==========================================
    // Fence Condition System
    // ==========================================

    /**
     * Get the key for fence condition lookup
     */
    private getFenceKey(tileX: number, tileY: number, edge: EdgeDirection): string {
        return `${tileX},${tileY},${edge}`;
    }

    /**
     * Get a random degradation timer with variance
     */
    private getRandomDegradeTimer(): number {
        const variance = (Math.random() * 2 - 1) * this.fenceDegradeVariance;
        return this.fenceDegradeBaseTime + variance;
    }

    /**
     * Initialize fence condition when a fence is placed
     */
    initializeFenceCondition(tileX: number, tileY: number, edge: EdgeDirection): void {
        const key = this.getFenceKey(tileX, tileY, edge);
        this.fenceConditions.set(key, {
            condition: 'good',
            degradeTimer: this.getRandomDegradeTimer(),
        });
    }

    /**
     * Remove fence condition tracking when fence is removed
     */
    removeFenceCondition(tileX: number, tileY: number, edge: EdgeDirection): void {
        const key = this.getFenceKey(tileX, tileY, edge);
        this.fenceConditions.delete(key);
    }

    /**
     * Get fence condition (defaults to 'good' if not tracked)
     */
    getFenceCondition(tileX: number, tileY: number, edge: EdgeDirection): FenceCondition {
        const key = this.getFenceKey(tileX, tileY, edge);
        const data = this.fenceConditions.get(key);
        return data?.condition ?? 'good';
    }

    /**
     * Set fence condition (e.g., when repaired)
     */
    setFenceCondition(tileX: number, tileY: number, edge: EdgeDirection, condition: FenceCondition): void {
        const key = this.getFenceKey(tileX, tileY, edge);
        const existing = this.fenceConditions.get(key);
        if (existing) {
            existing.condition = condition;
            // Reset timer when repaired to good
            if (condition === 'good') {
                existing.degradeTimer = this.getRandomDegradeTimer();
            }
        } else {
            this.fenceConditions.set(key, {
                condition,
                degradeTimer: this.getRandomDegradeTimer(),
            });
        }
    }

    /**
     * Check if a fence has failed (animals can escape)
     */
    isFenceFailed(tileX: number, tileY: number, edge: EdgeDirection): boolean {
        return this.getFenceCondition(tileX, tileY, edge) === 'failed';
    }

    /**
     * Repair a fence (called by maintenance workers)
     * Restores fence to 'good' condition
     */
    repairFence(tileX: number, tileY: number, edge: EdgeDirection): void {
        const fenceType = this.world.getFence(tileX, tileY, edge);
        if (!fenceType) return; // No fence to repair

        this.setFenceCondition(tileX, tileY, edge, 'good');

        // Update pathfinding with the repaired fence
        this.pathfinding.updateWorld(this.world);
    }

    /**
     * Update all fence conditions (called during simulation tick)
     */
    private updateFenceConditions(dt: number): void {
        // Only degrade fences that exist in the world
        for (const [key, data] of this.fenceConditions) {
            // Parse key to check if fence still exists
            const [x, y, edge] = key.split(',');
            const tileX = parseInt(x);
            const tileY = parseInt(y);
            const fenceType = this.world.getFence(tileX, tileY, edge as EdgeDirection);

            // Skip if fence no longer exists
            if (!fenceType) {
                this.fenceConditions.delete(key);
                continue;
            }

            // Skip if already failed
            if (data.condition === 'failed') continue;

            // Decrease timer
            data.degradeTimer -= dt;

            // Check for degradation
            if (data.degradeTimer <= 0) {
                // Degrade to next state
                switch (data.condition) {
                    case 'good':
                        data.condition = 'light_damage';
                        break;
                    case 'light_damage':
                        data.condition = 'damaged';
                        break;
                    case 'damaged':
                        data.condition = 'failed';
                        break;
                }

                // Set new random timer for next degradation (with increasing speed)
                const speedMultiplier = data.condition === 'light_damage' ? 0.8 :
                                        data.condition === 'damaged' ? 0.6 : 1;
                data.degradeTimer = this.getRandomDegradeTimer() * speedMultiplier;
            }
        }
    }

    /**
     * Get the exhibit that has a fence at this location
     */
    getExhibitByFence(tileX: number, tileY: number, edge: string): Exhibit | null {
        for (const exhibit of this.exhibits) {
            if (exhibit.hasFenceEdge(tileX, tileY, edge as any)) {
                return exhibit;
            }
        }
        return null;
    }

    // =============================================
    // Query Methods
    // =============================================

    /**
     * Get all entities at a tile
     */
    getEntitiesAtTile(tileX: number, tileY: number): Array<Animal | Staff | Guest> {
        const entities: Array<Animal | Staff | Guest> = [];

        for (const animal of this.animals) {
            if (animal.tileX === tileX && animal.tileY === tileY) {
                entities.push(animal);
            }
        }
        for (const staff of this.staff) {
            if (staff.tileX === tileX && staff.tileY === tileY) {
                entities.push(staff);
            }
        }
        for (const guest of this.guests) {
            if (guest.tileX === tileX && guest.tileY === tileY) {
                entities.push(guest);
            }
        }

        return entities;
    }

    /**
     * Get foliage at a tile
     */
    getFoliageAtTile(tileX: number, tileY: number): Foliage[] {
        return this.foliage.filter(f => f.tileX === tileX && f.tileY === tileY);
    }

    /**
     * Get food piles at a tile
     */
    getFoodPilesAtTile(tileX: number, tileY: number): FoodPile[] {
        return this.foodPiles.filter(fp => fp.tileX === tileX && fp.tileY === tileY);
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this.pathfinding.destroy();
        this.app.destroy(true);
    }
}
