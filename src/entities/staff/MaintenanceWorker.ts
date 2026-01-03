import { Staff } from '../Staff';
import type { Game } from '../../core/Game';
import type { StaffType } from '../../core/types';
import { GarbageCan } from '../buildings/Amenity';

/**
 * Maintenance Worker info for UI
 */
export const MaintenanceWorkerInfo = {
    type: 'Maintenance Worker',
    description: 'Maintenance workers repair fences, clean trash, and empty garbage cans.',
    salary: 40, // Per day
    tasks: ['Repair fences', 'Clean trash', 'Empty garbage'],
};

/**
 * MaintenanceWorker class - repairs fences, cleans trash, empties garbage
 * Task claiming is handled by Staff base class via TaskManager
 */
export class MaintenanceWorker extends Staff {
    public readonly staffType: StaffType = 'maintenance';

    constructor(game: Game, tileX: number, tileY: number) {
        const id = game.getNextStaffId?.('maintenance') || 1;
        super(game, tileX, tileY, `Maintenance #${id}`);

        // Maintenance-specific settings
        this.workDuration = 5; // Takes 5 seconds to complete task
        this.workCheckInterval = 2; // Check for tasks every 2 seconds

        // Initialize enabled task types from defaults
        this.initializeEnabledTasks();
    }

    /**
     * Perform the current task (called when work duration complete)
     */
    protected performTask(): void {
        if (!this.currentTask) {
            this.completeCurrentTask();
            return;
        }

        switch (this.currentTask.type) {
            case 'repair_fence':
                this.performRepairFenceTask();
                break;

            case 'clean_trash':
                this.performCleanTrashTask();
                break;

            case 'empty_garbage':
                this.performEmptyGarbageTask();
                break;

            default:
                console.warn(`MaintenanceWorker received unknown task type: ${this.currentTask.type}`);
                break;
        }

        this.completeCurrentTask();
    }

    /**
     * Repair the fence
     */
    private performRepairFenceTask(): void {
        if (!this.currentTask) return;

        const { fenceTileX, fenceTileY, fenceEdge } = this.currentTask.data;
        if (fenceTileX !== undefined && fenceTileY !== undefined && fenceEdge) {
            this.game.repairFence?.(fenceTileX, fenceTileY, fenceEdge);
            console.log(`${this.name} repaired fence at (${fenceTileX}, ${fenceTileY}) ${fenceEdge} edge`);
        }
    }

    /**
     * Clean trash at current location
     */
    private performCleanTrashTask(): void {
        if (!this.currentTask) return;

        // Remove trash at the target tile
        const { x, y } = this.currentTask.targetTile;
        this.game.removeTrashAt?.(x, y);
        console.log(`${this.name} cleaned trash at (${x}, ${y})`);
    }

    /**
     * Empty a garbage can
     */
    private performEmptyGarbageTask(): void {
        if (!this.currentTask) return;

        const { buildingId } = this.currentTask.data;
        if (buildingId !== undefined) {
            const building = this.game.buildings?.find((b: any) => b.id === buildingId);
            if (building && building instanceof GarbageCan) {
                building.empty();
                console.log(`${this.name} emptied garbage can at (${building.tileX}, ${building.tileY})`);
            }
        }
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return '🔧';
    }
}
