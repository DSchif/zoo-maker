import type { Game } from '../core/Game';
import type { FoodType } from '../core/types';

/**
 * FoodPile class - food placed by zookeepers for animals
 */
export class FoodPile {
    private game: Game;

    public readonly id: number;
    public tileX: number;
    public tileY: number;

    // Food properties
    public readonly foodType: FoodType;
    public amount: number;
    public readonly maxAmount: number;

    // Visual properties
    public readonly offsetX: number = 0.5;
    public readonly offsetY: number = 0.5;

    // Static ID counter
    private static nextId: number = 1;

    constructor(game: Game, tileX: number, tileY: number, foodType: FoodType, amount: number = 500) {
        this.game = game;
        this.id = FoodPile.nextId++;
        this.tileX = tileX;
        this.tileY = tileY;
        this.foodType = foodType;
        this.amount = amount;
        this.maxAmount = amount;
    }

    /**
     * Animals call this to eat from the pile
     */
    consume(eatAmount: number): number {
        const consumed = Math.min(this.amount, eatAmount);
        this.amount -= consumed;
        return consumed;
    }

    /**
     * Check if the food pile is empty
     */
    isEmpty(): boolean {
        return this.amount <= 0;
    }

    /**
     * Get the percentage of food remaining
     */
    getPercentRemaining(): number {
        return this.amount / this.maxAmount;
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
     * Get depth value for rendering (isometric depth sorting)
     */
    getDepth(): number {
        return this.tileX + this.tileY + this.offsetY;
    }

    /**
     * Get the exhibit this food pile is in
     */
    getExhibit(): any {
        return this.game.getExhibitAtTile?.(this.tileX, this.tileY) || null;
    }

    /**
     * Get display icon based on food type
     */
    getIcon(): string {
        switch (this.foodType) {
            case 'meat':
                return '🥩';
            case 'vegetables':
                return '🥬';
            case 'fruit':
                return '🍎';
            case 'hay':
                return '🌾';
            default:
                return '🍖';
        }
    }
}
