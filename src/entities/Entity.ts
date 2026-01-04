import type { Game } from '../core/Game';
import type { GridPos, EntityType } from '../core/types';

/**
 * Base Entity class for all game entities (animals, guests, staff, etc.)
 * Handles common functionality like position, movement, and pathfinding.
 */
export abstract class Entity {
    // Reference to game
    protected game: Game;

    // Unique identifier
    public readonly id: number;
    public abstract readonly type: EntityType;

    // Tile position (integer grid coordinates)
    public tileX: number;
    public tileY: number;

    // Sub-tile position for smooth movement (0-1 within tile)
    public offsetX: number = 0.5;
    public offsetY: number = 0.5;

    // Movement
    protected targetTileX: number;
    protected targetTileY: number;
    public speed: number = 1.5; // Tiles per second
    public isMoving: boolean = false;

    // Facing direction: 1 = right/east, -1 = left/west
    public facingX: number = 1;
    public facingY: number = 0;

    // 4-way isometric facing direction: ne, se, sw, nw
    public facingDirection: 'ne' | 'se' | 'sw' | 'nw' = 'ne';

    // Animation timer (increases while moving)
    public animTimer: number = 0;

    // Pathfinding
    protected currentPath: GridPos[] = [];
    protected pathTarget: GridPos | null = null;
    protected pathPending: boolean = false;

    // Can this entity pass through gates?
    protected canPassGates: boolean = false;

    // Static ID counter
    private static nextId: number = 1;

    constructor(game: Game, tileX: number, tileY: number) {
        this.game = game;
        this.id = Entity.nextId++;
        this.tileX = tileX;
        this.tileY = tileY;
        this.targetTileX = tileX;
        this.targetTileY = tileY;

        // Random initial facing direction (4-way)
        const directions: ('ne' | 'se' | 'sw' | 'nw')[] = ['ne', 'se', 'sw', 'nw'];
        this.facingDirection = directions[Math.floor(Math.random() * 4)];
        this.facingX = (this.facingDirection === 'ne' || this.facingDirection === 'se') ? 1 : -1;
    }

    /**
     * Update entity (called every simulation tick)
     */
    abstract update(dt: number): void;

    /**
     * Update movement along path
     */
    protected updateMovement(dt: number): void {
        if (!this.isMoving) {
            // Try to follow path if we have one
            if (this.currentPath.length > 0) {
                this.followPath();
            }
            return;
        }

        // Update animation timer while moving
        this.animTimer += dt * 8; // Speed of animation cycle

        // Calculate target position
        const targetX = this.targetTileX + 0.5;
        const targetY = this.targetTileY + 0.5;
        const currentX = this.tileX + this.offsetX;
        const currentY = this.tileY + this.offsetY;

        // Calculate distance and direction
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 0.05) {
            // Arrived at target tile
            this.tileX = this.targetTileX;
            this.tileY = this.targetTileY;
            this.offsetX = 0.5;
            this.offsetY = 0.5;
            this.isMoving = false;

            // Continue following path
            if (this.currentPath.length > 0) {
                this.followPath();
            }
        } else {
            // Move towards target
            const moveDistance = this.speed * dt;
            const ratio = Math.min(moveDistance / distance, 1);

            // Update facing direction based on movement
            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                // In isometric view, moving right (+x) or down (+y) = facing right
                // Moving left (-x) or up (-y) = facing left
                this.facingX = (dx + dy) >= 0 ? 1 : -1;
                this.facingY = dy >= 0 ? 1 : -1;

                // Determine 4-way isometric direction based on dominant movement
                // +X = NE (top-right), +Y = NW (top-left)
                // -X = SW (bottom-left), -Y = SE (bottom-right)
                if (Math.abs(dx) >= Math.abs(dy)) {
                    this.facingDirection = dx >= 0 ? 'ne' : 'sw';
                } else {
                    this.facingDirection = dy >= 0 ? 'nw' : 'se';
                }
            }

            this.offsetX += dx * ratio;
            this.offsetY += dy * ratio;

            // Handle tile transitions
            while (this.offsetX >= 1) {
                this.offsetX -= 1;
                this.tileX += 1;
            }
            while (this.offsetX < 0) {
                this.offsetX += 1;
                this.tileX -= 1;
            }
            while (this.offsetY >= 1) {
                this.offsetY -= 1;
                this.tileY += 1;
            }
            while (this.offsetY < 0) {
                this.offsetY += 1;
                this.tileY -= 1;
            }
        }
    }

    /**
     * Follow the current path
     */
    protected followPath(): boolean {
        if (this.currentPath.length === 0 || this.isMoving) return false;

        const nextStep = this.currentPath[0];

        // Verify we can still move there
        if (this.isMovementBlocked(this.tileX, this.tileY, nextStep.x, nextStep.y)) {
            // Path is blocked, clear it
            this.clearPath();
            return false;
        }

        // Move to next step
        this.targetTileX = nextStep.x;
        this.targetTileY = nextStep.y;
        this.isMoving = true;
        this.currentPath.shift();

        return true;
    }

    /**
     * Request a path to a destination (async)
     */
    protected async requestPath(
        endX: number,
        endY: number,
        canUsePaths: boolean = true,
        canPassGates: boolean = false,
        maxOffPathDistance?: number
    ): Promise<boolean> {
        if (this.pathPending) return false;

        this.pathPending = true;

        try {
            const path = await this.game.pathfinding.findPath(
                this.id,
                this.tileX,
                this.tileY,
                endX,
                endY,
                canUsePaths,
                canPassGates,
                maxOffPathDistance
            );

            this.pathPending = false;

            if (path.length > 0) {
                this.currentPath = path;
                this.pathTarget = { x: endX, y: endY };
                return true;
            }
        } catch (e) {
            this.pathPending = false;
        }

        return false;
    }

    /**
     * Clear the current path
     */
    protected clearPath(): void {
        this.currentPath = [];
        this.pathTarget = null;
    }

    /**
     * Check if movement between tiles is blocked
     */
    protected isMovementBlocked(fromX: number, fromY: number, toX: number, toY: number): boolean {
        return this.game.world.isMovementBlocked(fromX, fromY, toX, toY, this.canPassGates, this.game);
    }

    /**
     * Check if a tile is walkable for this entity
     */
    protected abstract canWalkOn(tileX: number, tileY: number): boolean;

    /**
     * Get depth value for rendering (isometric depth sorting)
     */
    getDepth(): number {
        return this.tileX + this.tileY + this.offsetY;
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
     * Get screen position for rendering
     */
    getScreenPos(): { x: number; y: number } {
        const worldPos = this.getWorldPos();
        return this.game.camera.tileToScreen(worldPos.x, worldPos.y);
    }
}
