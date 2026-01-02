import { Entity } from './Entity';
import type { Game } from '../core/Game';
import type { EntityType, GridPos } from '../core/types';

/**
 * Guest class - visitors who walk around the zoo
 */
export class Guest extends Entity {
    public readonly type: EntityType = 'guest';

    // State
    public state: 'entering' | 'wandering' | 'viewing' | 'leaving' | 'left' = 'entering';
    protected stateTimer: number = 0;

    // Appearance (random colors)
    public readonly shirtColor: number;
    public readonly pantsColor: number;
    public readonly skinColor: number;
    public readonly hairColor: number;

    // Guest stats
    public happiness: number = 100;
    public energy: number = 100;

    // Visit tracking
    protected visitDuration: number = 0;
    protected maxVisitDuration: number;
    protected exhibitsViewed: Set<number> = new Set();

    // Leaving tracking
    protected leavingTimer: number = 0;
    protected targetEntranceX: number = 0; // Which entrance tile to target

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

        // Energy decreases over time
        this.energy = Math.max(0, this.energy - dt * 0.1);

        // Leave if visit is too long or energy is depleted
        if (this.visitDuration >= this.maxVisitDuration || this.energy <= 0) {
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
        this.happiness = Math.min(100, this.happiness + 10);
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return '🧑';
    }
}
