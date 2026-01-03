import type { GridPos, EdgeDirection, FoodType, StaffType } from '../core/types';

/**
 * All possible task types
 */
export type TaskType =
    // Zookeeper tasks (exhibit-bound)
    | 'feed_animals'
    | 'clean_poop'
    // Maintenance tasks (exhibit-bound)
    | 'repair_fence'
    // Global tasks (no exhibit)
    | 'clean_trash'
    | 'empty_garbage';

/**
 * Which staff type can perform which tasks
 */
export const TASK_STAFF_TYPE: Record<TaskType, StaffType> = {
    'feed_animals': 'zookeeper',
    'clean_poop': 'zookeeper',
    'repair_fence': 'maintenance',
    'clean_trash': 'maintenance',
    'empty_garbage': 'maintenance',
};

/**
 * Default task types enabled for each staff type
 */
export const DEFAULT_ENABLED_TASKS: Record<StaffType, TaskType[]> = {
    'zookeeper': ['feed_animals', 'clean_poop'],
    'maintenance': ['repair_fence', 'clean_trash', 'empty_garbage'],
};

/**
 * Priority levels
 */
export const Priority = {
    URGENT: 0,
    NORMAL: 1,
    LOW: 2,
} as const;

/**
 * Task interface
 */
export interface Task {
    id: number;
    type: TaskType;
    createdAt: number;
    priority: number;

    // Location to perform task
    targetTile: GridPos;

    // Exhibit association (null for global tasks)
    exhibitId: number | null;

    // Task-specific data
    data: {
        fenceEdge?: EdgeDirection;
        fenceTileX?: number;
        fenceTileY?: number;
        foodType?: FoodType;
        animalId?: number;
        buildingId?: number;
        poopTileX?: number;
        poopTileY?: number;
    };

    // Retry tracking
    failCount: number;
    maxRetries: number;
}

/**
 * Task creation input (without auto-generated fields)
 */
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'failCount'>;

/**
 * Active task tracking
 */
interface ActiveTask {
    task: Task;
    workerId: number;
    startedAt: number;
}

/**
 * Exhibit queue structure
 */
interface ExhibitQueue {
    zookeeper: Task[];
    maintenance: Task[];
}

/**
 * TaskManager - Central task queue system for staff
 */
export class TaskManager {
    private nextTaskId: number = 1;

    // Exhibit-specific queues
    private exhibitQueues: Map<number, ExhibitQueue> = new Map();

    // Global queues (tasks not tied to exhibits)
    private globalQueues: ExhibitQueue = {
        zookeeper: [],
        maintenance: [],
    };

    // Tasks currently being worked on
    private activeTasks: Map<number, ActiveTask> = new Map();

    // =========================================
    // Task Creation
    // =========================================

    /**
     * Add a new task to the appropriate queue
     */
    addTask(input: TaskInput): number {
        const task: Task = {
            ...input,
            id: this.nextTaskId++,
            createdAt: Date.now(),
            failCount: 0,
        };

        const queue = this.getQueueForTask(task);
        queue.push(task);

        return task.id;
    }

    /**
     * Check if a task already exists for a specific target
     * Useful to prevent duplicate tasks
     * Note: Checks ALL queues, not just the one matching exhibitId
     */
    hasTaskFor(type: TaskType, exhibitId: number | null, data?: Partial<Task['data']>): boolean {
        // Check active tasks
        for (const active of this.activeTasks.values()) {
            if (this.taskMatches(active.task, type, data)) {
                return true;
            }
        }

        // Check ALL queued tasks (not just one queue)
        // This is important because fence repair tasks may be in exhibit queues
        // but the caller doesn't know the exhibit ID
        const allTasks = this.getAllQueuedTasks();
        for (const task of allTasks) {
            if (this.taskMatches(task, type, data)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if a task matches criteria (ignores exhibitId - matches by type and data only)
     */
    private taskMatches(task: Task, type: TaskType, data?: Partial<Task['data']>): boolean {
        if (task.type !== type) return false;

        if (data) {
            // Check specific data fields
            if (data.fenceEdge !== undefined && task.data.fenceEdge !== data.fenceEdge) return false;
            if (data.fenceTileX !== undefined && task.data.fenceTileX !== data.fenceTileX) return false;
            if (data.fenceTileY !== undefined && task.data.fenceTileY !== data.fenceTileY) return false;
            if (data.animalId !== undefined && task.data.animalId !== data.animalId) return false;
            if (data.poopTileX !== undefined && task.data.poopTileX !== data.poopTileX) return false;
            if (data.poopTileY !== undefined && task.data.poopTileY !== data.poopTileY) return false;
        }

        return true;
    }

    // =========================================
    // Task Claiming
    // =========================================

    /**
     * Worker claims the next available task
     * Returns null if no matching tasks available
     */
    claimTask(
        workerId: number,
        staffType: StaffType,
        assignedExhibitIds: Set<number>,
        enabledTaskTypes: Set<TaskType>,
        workerX?: number,
        workerY?: number
    ): Task | null {
        // Gather all eligible tasks
        const candidateTasks: Task[] = [];

        // Tasks from assigned exhibits
        for (const exhibitId of assignedExhibitIds) {
            const exhibitQueue = this.exhibitQueues.get(exhibitId);
            if (!exhibitQueue) continue;

            const queue = staffType === 'zookeeper'
                ? exhibitQueue.zookeeper
                : exhibitQueue.maintenance;

            candidateTasks.push(...queue);
        }

        // Global tasks (always available)
        const globalQueue = staffType === 'zookeeper'
            ? this.globalQueues.zookeeper
            : this.globalQueues.maintenance;

        candidateTasks.push(...globalQueue);

        // Filter by enabled task types and staff type
        const filtered = candidateTasks.filter(task =>
            enabledTaskTypes.has(task.type) &&
            TASK_STAFF_TYPE[task.type] === staffType &&
            !this.activeTasks.has(task.id)
        );

        if (filtered.length === 0) return null;

        // Calculate distance for each task if worker position provided
        const getDistance = (task: Task): number => {
            if (workerX === undefined || workerY === undefined) return 0;
            const dx = task.targetTile.x - workerX;
            const dy = task.targetTile.y - workerY;
            return Math.abs(dx) + Math.abs(dy); // Manhattan distance
        };

        // Sort: priority first, then distance (closer is better), then createdAt (FIFO)
        filtered.sort((a, b) => {
            // Priority is most important
            if (a.priority !== b.priority) return a.priority - b.priority;

            // Within same priority, prefer closer tasks
            const distA = getDistance(a);
            const distB = getDistance(b);
            if (distA !== distB) return distA - distB;

            // Same priority and distance, use FIFO
            return a.createdAt - b.createdAt;
        });

        // Claim the first task
        const task = filtered[0];

        // Remove from queue
        this.removeFromQueue(task);

        // Add to active tasks
        this.activeTasks.set(task.id, {
            task,
            workerId,
            startedAt: Date.now(),
        });

        return task;
    }

    /**
     * Get a worker's current active task
     */
    getActiveTaskForWorker(workerId: number): Task | null {
        for (const active of this.activeTasks.values()) {
            if (active.workerId === workerId) {
                return active.task;
            }
        }
        return null;
    }

    // =========================================
    // Task Completion
    // =========================================

    /**
     * Mark a task as successfully completed
     */
    completeTask(taskId: number): void {
        this.activeTasks.delete(taskId);
    }

    /**
     * Mark a task as failed - return to end of queue if retries remain
     */
    failTask(taskId: number): void {
        const active = this.activeTasks.get(taskId);
        if (!active) return;

        const task = active.task;
        this.activeTasks.delete(taskId);

        task.failCount++;

        if (task.failCount < task.maxRetries) {
            // Return to end of queue
            const queue = this.getQueueForTask(task);
            queue.push(task);
        }
        // Otherwise task is discarded
    }

    /**
     * Cancel a task entirely (remove from queue or active)
     */
    cancelTask(taskId: number): void {
        // Check active tasks
        if (this.activeTasks.has(taskId)) {
            this.activeTasks.delete(taskId);
            return;
        }

        // Check all queues
        this.removeTaskById(taskId);
    }

    // =========================================
    // Queue Management
    // =========================================

    /**
     * Ensure an exhibit queue exists
     */
    ensureExhibitQueue(exhibitId: number): void {
        if (!this.exhibitQueues.has(exhibitId)) {
            this.exhibitQueues.set(exhibitId, {
                zookeeper: [],
                maintenance: [],
            });
        }
    }

    /**
     * Remove all tasks for an exhibit (when exhibit is deleted)
     */
    removeExhibitTasks(exhibitId: number): void {
        this.exhibitQueues.delete(exhibitId);

        // Also remove any active tasks for this exhibit
        for (const [taskId, active] of this.activeTasks.entries()) {
            if (active.task.exhibitId === exhibitId) {
                this.activeTasks.delete(taskId);
            }
        }
    }

    /**
     * Get queue for a task (based on exhibit and staff type)
     */
    private getQueueForTask(task: Task): Task[] {
        const staffType = TASK_STAFF_TYPE[task.type];
        return this.getQueueForType(task.type, task.exhibitId);
    }

    /**
     * Get queue for a task type and exhibit
     */
    private getQueueForType(type: TaskType, exhibitId: number | null): Task[] {
        const staffType = TASK_STAFF_TYPE[type];

        if (exhibitId === null) {
            return staffType === 'zookeeper'
                ? this.globalQueues.zookeeper
                : this.globalQueues.maintenance;
        }

        this.ensureExhibitQueue(exhibitId);
        const exhibitQueue = this.exhibitQueues.get(exhibitId)!;

        return staffType === 'zookeeper'
            ? exhibitQueue.zookeeper
            : exhibitQueue.maintenance;
    }

    /**
     * Remove a task from its queue
     */
    private removeFromQueue(task: Task): void {
        const queue = this.getQueueForTask(task);
        const index = queue.findIndex(t => t.id === task.id);
        if (index !== -1) {
            queue.splice(index, 1);
        }
    }

    /**
     * Remove a task by ID from any queue
     */
    private removeTaskById(taskId: number): void {
        // Check exhibit queues
        for (const exhibitQueue of this.exhibitQueues.values()) {
            for (const queue of [exhibitQueue.zookeeper, exhibitQueue.maintenance]) {
                const index = queue.findIndex(t => t.id === taskId);
                if (index !== -1) {
                    queue.splice(index, 1);
                    return;
                }
            }
        }

        // Check global queues
        for (const queue of [this.globalQueues.zookeeper, this.globalQueues.maintenance]) {
            const index = queue.findIndex(t => t.id === taskId);
            if (index !== -1) {
                queue.splice(index, 1);
                return;
            }
        }
    }

    // =========================================
    // Debug / Stats
    // =========================================

    /**
     * Get task counts for debugging
     */
    getStats(): { queued: number; active: number } {
        let queued = 0;

        for (const exhibitQueue of this.exhibitQueues.values()) {
            queued += exhibitQueue.zookeeper.length;
            queued += exhibitQueue.maintenance.length;
        }
        queued += this.globalQueues.zookeeper.length;
        queued += this.globalQueues.maintenance.length;

        return {
            queued,
            active: this.activeTasks.size,
        };
    }

    /**
     * Get all tasks for an exhibit (for UI)
     */
    getTasksForExhibit(exhibitId: number): Task[] {
        const exhibitQueue = this.exhibitQueues.get(exhibitId);
        if (!exhibitQueue) return [];

        return [
            ...exhibitQueue.zookeeper,
            ...exhibitQueue.maintenance,
        ];
    }

    /**
     * Get all queued tasks (for debugging)
     */
    getAllQueuedTasks(): Task[] {
        const tasks: Task[] = [];

        for (const exhibitQueue of this.exhibitQueues.values()) {
            tasks.push(...exhibitQueue.zookeeper);
            tasks.push(...exhibitQueue.maintenance);
        }
        tasks.push(...this.globalQueues.zookeeper);
        tasks.push(...this.globalQueues.maintenance);

        return tasks;
    }

    /**
     * Get all active tasks with worker info
     */
    getAllActiveTasks(): Array<{ task: Task; workerId: number }> {
        return Array.from(this.activeTasks.values()).map(active => ({
            task: active.task,
            workerId: active.workerId,
        }));
    }
}
