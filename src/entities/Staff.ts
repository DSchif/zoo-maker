import { Entity } from './Entity';
import type { Game } from '../core/Game';
import type { EntityType, StaffType, GridPos } from '../core/types';

/**
 * Task interface for staff actions
 */
export interface StaffTask {
    type: string;
    exhibit?: any;
    targetTile?: GridPos;
    foodType?: string;
    priority?: number;
}

/**
 * Base Staff class - handles staff behavior and pathfinding
 */
export abstract class Staff extends Entity {
    public readonly type: EntityType = 'staff';
    public abstract readonly staffType: StaffType;

    // Identity
    public name: string;

    // State
    public state: 'idle' | 'walking' | 'working' | 'wandering' = 'idle';
    protected stateTimer: number = 0;

    // Task management
    protected currentTask: StaffTask | null = null;
    protected taskQueue: StaffTask[] = [];
    protected taskTimer: number = 0;
    protected workDuration: number = 3; // Seconds to complete a task

    // Assigned exhibits
    public assignedExhibits: any[] = [];

    // Failed exhibits (for pathfinding failures)
    public failedExhibits: Map<number, string> = new Map();

    // Work check interval
    protected workCheckTimer: number = 0;
    protected workCheckInterval: number = 8; // Check for tasks every 8 seconds

    // Wandering
    protected wanderTimer: number = 0;
    protected wanderInterval: number = 3; // Seconds between wander moves

    constructor(game: Game, tileX: number, tileY: number, name: string) {
        super(game, tileX, tileY);
        this.name = name;
        this.speed = 2.5; // Staff move faster than animals
        this.canPassGates = true; // Staff can pass through gates
    }

    /**
     * Update staff
     */
    update(dt: number): void {
        this.updateTask(dt);
        this.updateMovement(dt);
    }

    /**
     * Check for work to do (override in subclasses)
     */
    protected abstract checkForWork(): void;

    /**
     * Update current task and state
     */
    protected updateTask(dt: number): void {
        // If working on a task, update work timer
        if (this.state === 'working' && this.currentTask) {
            this.taskTimer += dt;
            if (this.taskTimer >= this.workDuration) {
                this.performTask();
            }
            return;
        }

        // If walking to a task, check if arrived
        if (this.currentTask && this.state === 'walking') {
            if (this.isAtTaskLocation()) {
                this.startWorking();
                return;
            }

            // If stuck (no path and not moving), try to repath or fail
            if (!this.isMoving && this.currentPath.length === 0) {
                const target = this.currentTask.targetTile;
                if (target && !this.isAtTaskLocation()) {
                    // Try to find path again
                    this.requestPath(target.x, target.y, true, true).then(success => {
                        if (!success) {
                            this.markTaskFailed('Cannot reach destination');
                            this.currentTask = null;
                            this.state = 'idle';
                        }
                    });
                }
            }
            return;
        }

        // Check for new tasks periodically
        this.workCheckTimer += dt;
        if (this.workCheckTimer >= this.workCheckInterval) {
            this.workCheckTimer = 0;
            if (!this.currentTask) {
                this.checkForWork();
            }
        }

        // If idle and no task, wander
        if (this.state === 'idle' && !this.currentTask) {
            this.wanderTimer += dt;
            if (this.wanderTimer >= this.wanderInterval) {
                this.wanderTimer = 0;
                this.startWandering();
            }
        }

        // If wandering and finished path, go back to idle
        if (this.state === 'wandering' && !this.isMoving && this.currentPath.length === 0) {
            this.state = 'idle';
        }
    }

    /**
     * Check if at task location
     */
    protected isAtTaskLocation(): boolean {
        if (!this.currentTask?.targetTile) return false;
        return this.tileX === this.currentTask.targetTile.x &&
               this.tileY === this.currentTask.targetTile.y;
    }

    /**
     * Start working on task (called when arrived at destination)
     */
    protected startWorking(): void {
        this.state = 'working';
        this.taskTimer = 0;
        this.isMoving = false;
        this.currentPath = [];
    }

    /**
     * Perform the task (override in subclass)
     */
    protected abstract performTask(): void;

    /**
     * Mark current task as failed
     */
    protected markTaskFailed(reason: string): void {
        if (this.currentTask?.exhibit) {
            this.failedExhibits.set(this.currentTask.exhibit.id, reason);
        }
    }

    /**
     * Start a task
     */
    protected async startTask(task: StaffTask): Promise<boolean> {
        if (!task.targetTile) return false;

        // Check if already at location
        if (this.tileX === task.targetTile.x && this.tileY === task.targetTile.y) {
            this.currentTask = task;
            this.startWorking();
            return true;
        }

        const success = await this.requestPath(
            task.targetTile.x,
            task.targetTile.y,
            true, // Staff can use paths
            true  // Staff can pass gates
        );

        if (success) {
            this.currentTask = task;
            this.state = 'walking';
            // Clear any previous failure for this exhibit
            if (task.exhibit) {
                this.failedExhibits.delete(task.exhibit.id);
            }
            return true;
        } else {
            // Mark exhibit as failed for pathfinding
            if (task.exhibit) {
                this.failedExhibits.set(task.exhibit.id, 'Cannot reach exhibit');
            }
            return false;
        }
    }

    /**
     * Complete current task
     */
    protected completeTask(): void {
        if (this.currentTask?.exhibit) {
            this.failedExhibits.delete(this.currentTask.exhibit.id);
        }
        this.currentTask = null;
        this.state = 'idle';
        this.taskTimer = 0;
        this.wanderTimer = 0;
    }

    /**
     * Find nearby path tiles for wandering
     */
    protected findNearbyPathTiles(radius: number): GridPos[] {
        const pathTiles: GridPos[] = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = this.tileX + dx;
                const y = this.tileY + dy;
                const tile = this.game.world.getTile(x, y);
                if (tile && tile.path) {
                    pathTiles.push({ x, y });
                }
            }
        }
        return pathTiles;
    }

    /**
     * Check if currently standing on a path
     */
    protected isOnPath(): boolean {
        const tile = this.game.world.getTile(this.tileX, this.tileY);
        return tile?.path !== null && tile?.path !== undefined;
    }

    /**
     * Start wandering - only walks on paths (or walks to nearest path first)
     */
    protected async startWandering(): Promise<void> {
        // If not on a path, walk to the nearest path first
        if (!this.isOnPath()) {
            const nearestPath = this.findNearestPathTile();
            if (nearestPath) {
                const success = await this.requestPath(nearestPath.x, nearestPath.y, true, true);
                if (success) {
                    this.state = 'wandering';
                    return;
                }
            }
            // Can't reach any path, just stay idle
            this.state = 'idle';
            return;
        }

        // Already on a path - find another path tile to wander to
        const pathTiles = this.findNearbyPathTiles(5);

        if (pathTiles.length > 0) {
            // Pick a random path tile
            const target = pathTiles[Math.floor(Math.random() * pathTiles.length)];
            const success = await this.requestPath(target.x, target.y, true, true);
            if (success) {
                this.state = 'wandering';
                return;
            }
        }

        // No other path tiles reachable - try adjacent path tiles
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
            const tile = this.game.world.getTile(targetX, targetY);

            // Only move to path tiles when wandering
            if (tile?.path &&
                !this.isMovementBlocked(this.tileX, this.tileY, targetX, targetY)) {
                this.targetTileX = targetX;
                this.targetTileY = targetY;
                this.isMoving = true;
                this.state = 'wandering';
                return;
            }
        }

        // Can't move anywhere on paths
        this.state = 'idle';
    }

    /**
     * Find the nearest path tile
     */
    protected findNearestPathTile(): GridPos | null {
        let nearestPath: GridPos | null = null;
        let nearestDist = Infinity;

        // Search in expanding squares
        for (let radius = 1; radius <= 10; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;

                    const x = this.tileX + dx;
                    const y = this.tileY + dy;
                    const tile = this.game.world.getTile(x, y);

                    if (tile?.path) {
                        const dist = Math.abs(dx) + Math.abs(dy);
                        if (dist < nearestDist) {
                            nearestDist = dist;
                            nearestPath = { x, y };
                        }
                    }
                }
            }

            // If we found a path at this radius, return it
            if (nearestPath) return nearestPath;
        }

        return null;
    }

    /**
     * Check if staff can walk on tile (can use paths and terrain)
     */
    protected canWalkOn(tileX: number, tileY: number): boolean {
        const tile = this.game.world.getTile(tileX, tileY);
        if (!tile) return false;
        if (tile.terrain === 'water') return false;
        return true;
    }

    /**
     * Assign an exhibit to this staff member
     */
    assignExhibit(exhibit: any): void {
        if (!this.assignedExhibits.includes(exhibit)) {
            this.assignedExhibits.push(exhibit);
            this.failedExhibits.delete(exhibit.id);
        }
    }

    /**
     * Unassign an exhibit
     */
    unassignExhibit(exhibit: any): void {
        const index = this.assignedExhibits.indexOf(exhibit);
        if (index !== -1) {
            this.assignedExhibits.splice(index, 1);
            this.failedExhibits.delete(exhibit.id);
        }
    }

    /**
     * Set name
     */
    setName(name: string): void {
        this.name = name;
    }

    /**
     * Get task description for UI
     */
    getTaskDescription(): string | null {
        if (!this.currentTask) return null;

        switch (this.currentTask.type) {
            case 'feed':
                return `Feeding ${this.currentTask.exhibit?.name || 'animals'}`;
            default:
                return 'Working';
        }
    }
}
