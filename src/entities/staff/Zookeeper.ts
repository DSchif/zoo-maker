import { Staff } from '../Staff';
import type { Game } from '../../core/Game';
import type { StaffType, FoodType } from '../../core/types';

/**
 * Zookeeper info for UI
 */
export const ZookeeperInfo = {
    type: 'Zookeeper',
    description: 'Zookeepers feed animals and clean exhibits.',
    salary: 50, // Per day
    tasks: ['Feed animals', 'Clean poop'],
};

/**
 * Zookeeper class - feeds animals and cleans exhibits
 * Task claiming is handled by Staff base class via TaskManager
 */
export class Zookeeper extends Staff {
    public readonly staffType: StaffType = 'zookeeper';

    constructor(game: Game, tileX: number, tileY: number) {
        const id = game.getNextStaffId?.('zookeeper') || 1;
        super(game, tileX, tileY, `Zookeeper #${id}`);

        // Zookeeper-specific settings
        this.workDuration = 4; // Takes 4 seconds to complete task
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
            case 'feed_animals':
                this.performFeedTask();
                break;

            case 'clean_poop':
                this.performCleanPoopTask();
                break;

            default:
                console.warn(`Zookeeper received unknown task type: ${this.currentTask.type}`);
                break;
        }

        this.completeCurrentTask();
    }

    /**
     * Place food at current location
     */
    private performFeedTask(): void {
        if (!this.currentTask) return;

        const foodType = (this.currentTask.data.foodType || 'meat') as FoodType;
        const amount = 500;

        this.game.addFoodPile?.(this.tileX, this.tileY, foodType, amount);

        // Find exhibit name for logging
        let exhibitName = 'unknown exhibit';
        if (this.currentTask.exhibitId !== null) {
            const exhibit = this.game.exhibits?.find((e: any) => e.id === this.currentTask!.exhibitId);
            if (exhibit) exhibitName = exhibit.name;
        }

        console.log(`${this.name} placed ${foodType} in ${exhibitName}`);
    }

    /**
     * Clean poop at current location
     */
    private performCleanPoopTask(): void {
        if (!this.currentTask) return;

        const { poopTileX, poopTileY } = this.currentTask.data;
        if (poopTileX !== undefined && poopTileY !== undefined) {
            this.game.removePoopAt?.(poopTileX, poopTileY);
            console.log(`${this.name} cleaned poop at (${poopTileX}, ${poopTileY})`);
        }
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return '🧑‍🌾';
    }
}
