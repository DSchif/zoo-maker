import { Staff, StaffTask } from '../Staff';
import type { Game } from '../../core/Game';
import type { StaffType, GridPos, EdgeDirection } from '../../core/types';

/**
 * Maintenance Worker info for UI
 */
export const MaintenanceWorkerInfo = {
    type: 'Maintenance Worker',
    description: 'Maintenance workers repair damaged fences to keep animals contained.',
    salary: 40, // Per day
    tasks: ['Repair fences'],
};

/**
 * Fence repair task data
 */
interface FenceRepairTask extends StaffTask {
    type: 'repair_fence';
    fenceLocation: {
        tileX: number;
        tileY: number;
        edge: EdgeDirection;
    };
}

/**
 * MaintenanceWorker class - repairs damaged fences
 */
export class MaintenanceWorker extends Staff {
    public readonly staffType: StaffType = 'maintenance';

    // Track failed fence locations (for pathfinding failures)
    private failedFenceLocations: Set<string> = new Set();

    constructor(game: Game, tileX: number, tileY: number) {
        const id = game.getNextStaffId?.('maintenance') || 1;
        super(game, tileX, tileY, `Maintenance #${id}`);

        // Maintenance-specific settings
        this.workDuration = 5; // Takes 5 seconds to repair a fence
        this.workCheckInterval = 6; // Check for tasks every 6 seconds
    }

    /**
     * Check for work to do - find damaged fences
     */
    protected checkForWork(): void {
        if (this.currentTask) return;

        // Find all fences that need repair (not in 'good' condition)
        const damagedFences = this.findDamagedFences();

        if (damagedFences.length === 0) return;

        // Sort by priority: failed > damaged > light_damage
        damagedFences.sort((a, b) => {
            const priority: Record<string, number> = {
                'failed': 0,
                'damaged': 1,
                'light_damage': 2,
            };
            return priority[a.condition] - priority[b.condition];
        });

        // Try to find a reachable fence
        for (const fence of damagedFences) {
            const fenceKey = `${fence.tileX},${fence.tileY},${fence.edge}`;

            // Skip if we've recently failed to reach this fence
            if (this.failedFenceLocations.has(fenceKey)) continue;

            // Find an adjacent tile to work from
            const workSpot = this.findWorkSpotForFence(fence.tileX, fence.tileY, fence.edge);
            if (!workSpot) continue;

            const task: FenceRepairTask = {
                type: 'repair_fence',
                targetTile: workSpot,
                fenceLocation: {
                    tileX: fence.tileX,
                    tileY: fence.tileY,
                    edge: fence.edge,
                },
            };

            this.startTask(task).then(success => {
                if (!success) {
                    // Mark this fence as unreachable temporarily
                    this.failedFenceLocations.add(fenceKey);
                    // Clear after 30 seconds to retry
                    setTimeout(() => {
                        this.failedFenceLocations.delete(fenceKey);
                    }, 30000);
                }
            });
            return;
        }
    }

    /**
     * Find all fences that need repair
     */
    private findDamagedFences(): Array<{
        tileX: number;
        tileY: number;
        edge: EdgeDirection;
        condition: string;
    }> {
        const damagedFences: Array<{
            tileX: number;
            tileY: number;
            edge: EdgeDirection;
            condition: string;
        }> = [];

        const world = this.game.world;
        const edges: EdgeDirection[] = ['north', 'south', 'east', 'west'];

        for (let y = 0; y < world.height; y++) {
            for (let x = 0; x < world.width; x++) {
                for (const edge of edges) {
                    const fenceType = world.getFence(x, y, edge);
                    if (!fenceType) continue;

                    const condition = this.game.getFenceCondition(x, y, edge);
                    if (condition !== 'good') {
                        damagedFences.push({
                            tileX: x,
                            tileY: y,
                            edge,
                            condition,
                        });
                    }
                }
            }
        }

        return damagedFences;
    }

    /**
     * Find a tile adjacent to the fence where the worker can stand
     */
    private findWorkSpotForFence(tileX: number, tileY: number, edge: EdgeDirection): GridPos | null {
        // The worker should stand on a walkable tile adjacent to the fence
        // Prefer the tile on the fence's edge side, or the fence's tile itself
        const spots: GridPos[] = [];

        // The tile that has the fence
        spots.push({ x: tileX, y: tileY });

        // The adjacent tile across the fence edge
        const adjacentOffsets: Record<EdgeDirection, { dx: number; dy: number }> = {
            north: { dx: -1, dy: 0 },
            south: { dx: 1, dy: 0 },
            east: { dx: 0, dy: -1 },
            west: { dx: 0, dy: 1 },
        };

        const offset = adjacentOffsets[edge];
        spots.push({ x: tileX + offset.dx, y: tileY + offset.dy });

        // Find a walkable spot
        for (const spot of spots) {
            const tile = this.game.world.getTile(spot.x, spot.y);
            if (!tile) continue;
            if (tile.terrain === 'water') continue;

            // Prefer tiles with paths
            if (tile.path) {
                return spot;
            }
        }

        // No path tile found, try any walkable tile
        for (const spot of spots) {
            const tile = this.game.world.getTile(spot.x, spot.y);
            if (!tile) continue;
            if (tile.terrain === 'water') continue;
            return spot;
        }

        return null;
    }

    /**
     * Perform the current task (called when work duration complete)
     */
    protected performTask(): void {
        if (!this.currentTask) {
            this.completeTask();
            return;
        }

        if (this.currentTask.type === 'repair_fence') {
            const repairTask = this.currentTask as FenceRepairTask;
            const { tileX, tileY, edge } = repairTask.fenceLocation;

            // Repair the fence
            this.game.repairFence?.(tileX, tileY, edge);

            console.log(`${this.name} repaired fence at (${tileX}, ${tileY}) ${edge} edge`);
        }

        this.completeTask();
    }

    /**
     * Get task description for UI
     */
    getTaskDescription(): string | null {
        if (!this.currentTask) return null;

        switch (this.currentTask.type) {
            case 'repair_fence':
                return 'Repairing fence';
            default:
                return 'Working';
        }
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return '🔧';
    }
}
