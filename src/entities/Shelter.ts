import type { Game } from '../core/Game';
import type { ShelterType, ShelterSize } from '../core/types';
import { Placeable } from './Placeable';
import type { Animal } from './Animal';

/**
 * Shelter class - provides cover for animals
 * Extends Placeable for common functionality
 */
export class Shelter extends Placeable {
    // Shelter-specific properties
    public readonly shelterType: ShelterType;
    public readonly size: ShelterSize;

    constructor(
        game: Game,
        tileX: number,
        tileY: number,
        shelterType: ShelterType,
        size: ShelterSize,
        rotation: number = 0
    ) {
        // Map size to placeable type
        const placeableType = `shelter_${size}`;

        super(game, placeableType, tileX, tileY, rotation);

        this.shelterType = shelterType;
        this.size = size;
    }

    /**
     * Get display name with shelter type
     */
    getDisplayName(): string {
        const typeName = this.shelterType.charAt(0).toUpperCase() + this.shelterType.slice(1);
        return `${this.config.name} ${typeName} Shelter`;
    }

    /**
     * Check if shelter placement is valid at the given position
     */
    static canPlaceShelter(
        game: Game,
        tileX: number,
        tileY: number,
        size: ShelterSize,
        rotation: number = 0
    ): boolean {
        const placeableType = `shelter_${size}`;
        return Placeable.canPlace(game, placeableType, tileX, tileY, rotation);
    }

    /**
     * Get animals currently inside this shelter
     */
    getAnimalsInside(): Animal[] {
        const animalsInside: Animal[] = [];

        for (const animal of this.game.animals) {
            if (animal.insideShelter) {
                // Check if this animal has a reservation with this shelter
                const reservation = this.getEntityReservation(animal.id);
                if (reservation) {
                    animalsInside.push(animal);
                }
            }
        }

        return animalsInside;
    }

    /**
     * Get total capacity of this shelter
     */
    getCapacity(): number {
        let capacity = 0;
        const interactions = this.getInteractionPoints();
        for (const point of interactions) {
            if (point.type === 'enter') {
                capacity += point.capacity || 1;
            }
        }
        return capacity;
    }
}
