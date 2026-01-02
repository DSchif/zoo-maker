import { Building } from './Building';
import type { Game } from '../../core/Game';

/**
 * Attraction - Entertainment venues guests pay to enter.
 * Has capacity, entry fee, experience duration. Requires staff.
 */
export abstract class Attraction extends Building {
    // Entry fee
    protected entryFee: number = 10;

    // Capacity
    protected capacity: number = 20;
    protected currentGuests: number = 0;

    // Experience duration (seconds)
    protected experienceDuration: number = 60;

    // Staffing
    protected staffCount: number = 0;
    protected requiredStaff: number = 1;

    // Excitement/entertainment value (affects guest happiness)
    protected excitement: number = 50;

    constructor(
        game: Game,
        buildingType: string,
        tileX: number,
        tileY: number,
        rotation: number = 0
    ) {
        super(game, buildingType, tileX, tileY, rotation);
    }

    getBuildingCategory(): 'attraction' {
        return 'attraction';
    }

    // =========================================
    // Entry & Capacity
    // =========================================

    /**
     * Get entry fee
     */
    getEntryFee(): number {
        return this.entryFee;
    }

    /**
     * Check if attraction has room
     */
    hasCapacity(): boolean {
        return this.currentGuests < this.capacity;
    }

    /**
     * Get current occupancy
     */
    getOccupancy(): number {
        return this.currentGuests;
    }

    /**
     * Get max capacity
     */
    getCapacity(): number {
        return this.capacity;
    }

    /**
     * Check if attraction can accept guests
     */
    canAcceptGuests(): boolean {
        return this.isOpen && this.hasCapacity() && this.isFullyStaffed();
    }

    /**
     * Guest enters the attraction (pays entry fee)
     */
    guestEnter(): boolean {
        if (!this.canAcceptGuests()) return false;

        this.currentGuests++;
        this.recordRevenue(this.entryFee);
        this.recordUsage();
        return true;
    }

    /**
     * Guest leaves the attraction
     */
    guestLeave(): void {
        this.currentGuests = Math.max(0, this.currentGuests - 1);
    }

    /**
     * Get experience duration
     */
    getExperienceDuration(): number {
        return this.experienceDuration;
    }

    /**
     * Get excitement value
     */
    getExcitement(): number {
        return this.excitement;
    }

    // =========================================
    // Staffing
    // =========================================

    /**
     * Assign a staff member
     */
    assignStaff(): void {
        this.staffCount++;
    }

    /**
     * Remove a staff member
     */
    removeStaff(): void {
        this.staffCount = Math.max(0, this.staffCount - 1);
    }

    /**
     * Get current staff count
     */
    getStaffCount(): number {
        return this.staffCount;
    }

    /**
     * Get required staff count
     */
    getRequiredStaff(): number {
        return this.requiredStaff;
    }

    /**
     * Check if fully staffed
     */
    isFullyStaffed(): boolean {
        return this.staffCount >= this.requiredStaff;
    }

    update(dt: number): void {
        // Attractions could process guest experiences here
    }
}

/**
 * IndoorAttraction - Generic indoor experience
 * Could be an aquarium, reptile house, butterfly garden, etc.
 */
export class IndoorAttraction extends Attraction {
    // Type of indoor attraction for theming
    public readonly attractionType: 'aquarium' | 'reptile_house' | 'aviary' | 'insectarium' | 'generic';

    constructor(
        game: Game,
        tileX: number,
        tileY: number,
        rotation: number = 0,
        attractionType: 'aquarium' | 'reptile_house' | 'aviary' | 'insectarium' | 'generic' = 'generic'
    ) {
        super(game, 'indoor_attraction', tileX, tileY, rotation);
        this.attractionType = attractionType;

        // Set properties based on type
        switch (attractionType) {
            case 'aquarium':
                this.entryFee = 15;
                this.capacity = 30;
                this.experienceDuration = 90;
                this.excitement = 60;
                this.requiredStaff = 2;
                break;
            case 'reptile_house':
                this.entryFee = 12;
                this.capacity = 25;
                this.experienceDuration = 60;
                this.excitement = 55;
                this.requiredStaff = 1;
                break;
            case 'aviary':
                this.entryFee = 10;
                this.capacity = 40;
                this.experienceDuration = 45;
                this.excitement = 50;
                this.requiredStaff = 1;
                break;
            case 'insectarium':
                this.entryFee = 8;
                this.capacity = 20;
                this.experienceDuration = 30;
                this.excitement = 40;
                this.requiredStaff = 1;
                break;
            default:
                this.entryFee = 10;
                this.capacity = 25;
                this.experienceDuration = 60;
                this.excitement = 50;
                this.requiredStaff = 1;
        }
    }

    /**
     * Get display name based on type
     */
    getDisplayName(): string {
        switch (this.attractionType) {
            case 'aquarium': return 'Aquarium';
            case 'reptile_house': return 'Reptile House';
            case 'aviary': return 'Aviary';
            case 'insectarium': return 'Insectarium';
            default: return 'Indoor Attraction';
        }
    }
}
