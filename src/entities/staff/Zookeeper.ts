import { Staff, StaffTask } from '../Staff';
import type { Game } from '../../core/Game';
import type { StaffType, GridPos, FoodType } from '../../core/types';

/**
 * Zookeeper info for UI
 */
export const ZookeeperInfo = {
    type: 'Zookeeper',
    description: 'Zookeepers feed animals and maintain exhibits.',
    salary: 50, // Per day
    tasks: ['Feed animals', 'Check animal health'],
};

/**
 * Zookeeper class - feeds animals in assigned exhibits
 */
export class Zookeeper extends Staff {
    public readonly staffType: StaffType = 'zookeeper';

    constructor(game: Game, tileX: number, tileY: number) {
        const id = game.getNextStaffId?.('zookeeper') || 1;
        super(game, tileX, tileY, `Zookeeper #${id}`);

        // Zookeeper-specific settings
        this.workDuration = 4; // Takes 4 seconds to place food
        this.workCheckInterval = 8; // Check for tasks every 8 seconds
    }

    /**
     * Check for work to do
     */
    protected checkForWork(): void {
        if (this.currentTask) return;
        if (this.assignedExhibits.length === 0) return;

        // Check each assigned exhibit for hungry animals
        for (const exhibit of this.assignedExhibits) {
            // Skip failed exhibits temporarily
            if (this.failedExhibits.has(exhibit.id)) continue;

            const animals = this.game.getAnimalsInExhibit?.(exhibit) || [];
            if (animals.length === 0) continue;

            // Check if any animal is hungry (below 50%)
            const hungryAnimals = animals.filter((a: any) => a.hunger < 50);
            if (hungryAnimals.length === 0) continue;

            // Check if there's already enough food in the exhibit
            const existingFood = this.game.getFoodPilesInExhibit?.(exhibit) || [];
            const totalFood = existingFood.reduce((sum: number, pile: any) => sum + pile.amount, 0);

            // If there's plenty of food already (100 per animal), skip
            if (totalFood >= animals.length * 100) continue;

            // Find a spot to place food
            const feedSpot = this.findFoodPlacementSpot(exhibit);
            if (!feedSpot) continue;

            // Determine food type
            const foodType = this.determineFoodType(animals);

            const task: StaffTask = {
                type: 'feed',
                exhibit: exhibit,
                foodType: foodType,
                targetTile: feedSpot,
            };

            this.startTask(task);
            return;
        }
    }

    /**
     * Find a spot inside exhibit to place food
     */
    private findFoodPlacementSpot(exhibit: any): GridPos | null {
        const interiorTiles = exhibit.interiorTiles || [];
        if (interiorTiles.length === 0) return null;

        // Shuffle tiles for variety
        const shuffled = [...interiorTiles].sort(() => Math.random() - 0.5);

        for (const tile of shuffled) {
            // Check if we can walk there and it's valid
            const tileData = this.game.world.getTile(tile.x, tile.y);
            if (!tileData) continue;
            if (tileData.terrain === 'water') continue;
            if (tileData.path) continue; // Don't place food on paths

            // Check if there's already food here
            const existingFood = this.game.getFoodPilesAtTile?.(tile.x, tile.y) || [];
            if (existingFood.length > 0) continue;

            return tile;
        }

        return null;
    }

    /**
     * Determine food type based on animals in exhibit
     */
    private determineFoodType(animals: any[]): string {
        for (const animal of animals) {
            if (animal.preferredFood && animal.preferredFood.length > 0) {
                return animal.preferredFood[0];
            }
        }
        return 'meat'; // Default
    }

    /**
     * Perform the current task (called when work duration complete)
     */
    protected performTask(): void {
        if (!this.currentTask) {
            this.completeTask();
            return;
        }

        if (this.currentTask.type === 'feed') {
            // Place food
            const foodType = (this.currentTask.foodType || 'meat') as FoodType;
            const amount = 500;

            this.game.addFoodPile?.(this.tileX, this.tileY, foodType, amount);

            console.log(`${this.name} placed ${foodType} in ${this.currentTask.exhibit?.name}`);
        }

        this.completeTask();
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return '🧑‍🌾';
    }
}
