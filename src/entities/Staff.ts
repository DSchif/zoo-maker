import { Entity } from './Entity';
import type { Game } from '../core/Game';
import type { EntityType, StaffType, GridPos } from '../core/types';
import type { Task, TaskType } from '../systems/TaskManager';
import { TASK_STAFF_TYPE, DEFAULT_ENABLED_TASKS } from '../systems/TaskManager';

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

    // Task management (uses central TaskManager)
    protected currentTask: Task | null = null;
    protected taskTimer: number = 0;
    protected workDuration: number = 3; // Seconds to complete a task

    // Assigned exhibits (by ID)
    public assignedExhibitIds: Set<number> = new Set();

    // Enabled task types (what this worker will do)
    public enabledTaskTypes: Set<TaskType> = new Set();

    // Legacy: for UI compatibility
    public assignedExhibits: any[] = [];

    // Failed locations (for pathfinding failures) - cleared periodically
    public failedLocations: Map<string, number> = new Map(); // key -> timestamp

    // Work check interval
    protected workCheckTimer: number = 0;
    protected workCheckInterval: number = 2; // Check for tasks every 2 seconds (faster now)

    // Wandering
    protected wanderTimer: number = 0;
    protected wanderInterval: number = 5; // Seconds between wander moves

    constructor(game: Game, tileX: number, tileY: number, name: string) {
        super(game, tileX, tileY);
        this.name = name;
        this.speed = 2.5; // Staff move faster than animals
        this.canPassGates = true; // Staff can pass through gates
    }

    /**
     * Initialize enabled task types based on staff type
     * Called after construction when staffType is available
     */
    protected initializeEnabledTasks(): void {
        const defaults = DEFAULT_ENABLED_TASKS[this.staffType] || [];
        this.enabledTaskTypes = new Set(defaults);
    }

    /**
     * Update staff
     */
    update(dt: number): void {
        this.updateTask(dt);
        this.updateMovement(dt);
        this.cleanupFailedLocations();
    }

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

            // If stuck (no path and not moving), fail the task
            if (!this.isMoving && this.currentPath.length === 0) {
                const target = this.currentTask.targetTile;
                if (target && !this.isAtTaskLocation()) {
                    // Try to find path again once
                    this.requestPath(target.x, target.y, true, true).then(success => {
                        if (!success) {
                            this.failCurrentTask('Cannot reach destination');
                        }
                    });
                }
            }
            return;
        }

        // Check for new tasks frequently (no need to return to path first)
        this.workCheckTimer += dt;
        if (this.workCheckTimer >= this.workCheckInterval) {
            this.workCheckTimer = 0;
            if (!this.currentTask) {
                this.tryClaimTask();
            }
        }

        // If idle and no task for a while, wander
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
     * Try to claim a task from the TaskManager
     */
    protected tryClaimTask(): void {
        const taskManager = this.game.taskManager;
        if (!taskManager) return;

        const task = taskManager.claimTask(
            this.id,
            this.staffType,
            this.assignedExhibitIds,
            this.enabledTaskTypes,
            this.tileX,
            this.tileY
        );

        if (task) {
            this.startTask(task);
        }
    }

    /**
     * Start working on a claimed task
     */
    protected async startTask(task: Task): Promise<void> {
        this.currentTask = task;

        // Check if already at location
        if (this.tileX === task.targetTile.x && this.tileY === task.targetTile.y) {
            this.startWorking();
            return;
        }

        // Path to task location
        const success = await this.requestPath(
            task.targetTile.x,
            task.targetTile.y,
            true, // Staff can use paths
            true  // Staff can pass gates
        );

        if (success) {
            this.state = 'walking';
        } else {
            this.failCurrentTask('Cannot reach task location');
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
     * Perform the task (override in subclass for task-specific behavior)
     */
    protected abstract performTask(): void;

    /**
     * Complete current task successfully
     */
    protected completeCurrentTask(): void {
        if (this.currentTask) {
            this.game.taskManager?.completeTask(this.currentTask.id);
        }
        this.currentTask = null;
        this.state = 'idle';
        this.taskTimer = 0;
        this.wanderTimer = 0;

        // Immediately check for next task
        this.workCheckTimer = this.workCheckInterval;
    }

    /**
     * Fail current task - returns to queue for retry
     */
    protected failCurrentTask(reason: string): void {
        if (this.currentTask) {
            // Mark location as failed temporarily
            const key = `${this.currentTask.targetTile.x},${this.currentTask.targetTile.y}`;
            this.failedLocations.set(key, Date.now());

            this.game.taskManager?.failTask(this.currentTask.id);
        }
        this.currentTask = null;
        this.state = 'idle';
        this.taskTimer = 0;
    }

    /**
     * Clean up old failed location entries
     */
    private cleanupFailedLocations(): void {
        const now = Date.now();
        const timeout = 30000; // 30 seconds

        for (const [key, timestamp] of this.failedLocations.entries()) {
            if (now - timestamp > timeout) {
                this.failedLocations.delete(key);
            }
        }
    }

    // =========================================
    // Exhibit Assignment
    // =========================================

    /**
     * Assign an exhibit to this staff member
     */
    assignExhibit(exhibit: any): void {
        if (exhibit?.id !== undefined) {
            this.assignedExhibitIds.add(exhibit.id);

            // Legacy compatibility
            if (!this.assignedExhibits.includes(exhibit)) {
                this.assignedExhibits.push(exhibit);
            }
        }
    }

    /**
     * Unassign an exhibit
     */
    unassignExhibit(exhibit: any): void {
        if (exhibit?.id !== undefined) {
            this.assignedExhibitIds.delete(exhibit.id);

            // Legacy compatibility
            const index = this.assignedExhibits.indexOf(exhibit);
            if (index !== -1) {
                this.assignedExhibits.splice(index, 1);
            }
        }
    }

    // =========================================
    // Task Type Toggles
    // =========================================

    /**
     * Enable a task type
     */
    enableTaskType(type: TaskType): void {
        if (TASK_STAFF_TYPE[type] === this.staffType) {
            this.enabledTaskTypes.add(type);
        }
    }

    /**
     * Disable a task type
     */
    disableTaskType(type: TaskType): void {
        this.enabledTaskTypes.delete(type);
    }

    /**
     * Toggle a task type
     */
    toggleTaskType(type: TaskType): void {
        if (this.enabledTaskTypes.has(type)) {
            this.enabledTaskTypes.delete(type);
        } else if (TASK_STAFF_TYPE[type] === this.staffType) {
            this.enabledTaskTypes.add(type);
        }
    }

    /**
     * Check if task type is enabled
     */
    isTaskTypeEnabled(type: TaskType): boolean {
        return this.enabledTaskTypes.has(type);
    }

    // =========================================
    // Wandering (unchanged)
    // =========================================

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
            this.state = 'idle';
            return;
        }

        // Already on a path - find another path tile to wander to
        const pathTiles = this.findNearbyPathTiles(5);

        if (pathTiles.length > 0) {
            const target = pathTiles[Math.floor(Math.random() * pathTiles.length)];
            const success = await this.requestPath(target.x, target.y, true, true);
            if (success) {
                this.state = 'wandering';
                return;
            }
        }

        // Try adjacent path tiles
        const directions = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
        ];

        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }

        for (const dir of directions) {
            const targetX = this.tileX + dir.dx;
            const targetY = this.tileY + dir.dy;
            const tile = this.game.world.getTile(targetX, targetY);

            if (tile?.path &&
                !this.isMovementBlocked(this.tileX, this.tileY, targetX, targetY)) {
                this.targetTileX = targetX;
                this.targetTileY = targetY;
                this.isMoving = true;
                this.state = 'wandering';
                return;
            }
        }

        this.state = 'idle';
    }

    /**
     * Find the nearest path tile
     */
    protected findNearestPathTile(): GridPos | null {
        let nearestPath: GridPos | null = null;
        let nearestDist = Infinity;

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

            if (nearestPath) return nearestPath;
        }

        return null;
    }

    /**
     * Check if staff can walk on tile
     */
    protected canWalkOn(tileX: number, tileY: number): boolean {
        const tile = this.game.world.getTile(tileX, tileY);
        if (!tile) return false;
        if (tile.terrain === 'fresh_water' || tile.terrain === 'salt_water') return false;
        return true;
    }

    // =========================================
    // Utility
    // =========================================

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
            case 'feed_animals':
                return 'Feeding animals';
            case 'clean_poop':
                return 'Cleaning';
            case 'repair_fence':
                return 'Repairing fence';
            case 'clean_trash':
                return 'Cleaning trash';
            case 'empty_garbage':
                return 'Emptying garbage';
            default:
                return 'Working';
        }
    }

    /**
     * Get current task (for UI)
     */
    getCurrentTask(): Task | null {
        return this.currentTask;
    }
}
