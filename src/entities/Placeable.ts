import type { Game } from '../core/Game';
import type {
    GridPos,
    EdgeDirection,
    PlaceableConfig,
    PlaceableCategory,
    InteractionPoint,
    InteractionType,
    InteractingEntityType,
    GuestNeed,
    ApproachType
} from '../core/types';
import { PLACEABLE_CONFIGS } from '../core/types';

// Unique ID counter for all placeables
let nextPlaceableId = 1;

// Active interaction reservation
interface InteractionReservation {
    interactionIndex: number;
    entityId: number;
    entityType: InteractingEntityType;
}

/**
 * Base class for all placeable objects (shelters, benches, shops, etc.)
 * Handles positioning, rotation, tile occupation, and interaction points.
 */
export class Placeable {
    public readonly id: number;
    public readonly placeableType: string;

    // Position (anchor point - top-left corner in world coords before rotation)
    public readonly tileX: number;
    public readonly tileY: number;

    // Rotation (0, 1, 2, 3 = 0°, 90°, 180°, 270°)
    public readonly rotation: number;

    // Dimensions (after rotation applied)
    public readonly width: number;
    public readonly depth: number;

    // Config reference
    public readonly config: PlaceableConfig;

    // Interaction reservations (tracks who is using each interaction point)
    private reservations: InteractionReservation[] = [];

    // Statistics tracking
    public guestsServed: number = 0;

    // Reference to game
    protected game: Game;

    constructor(
        game: Game,
        placeableType: string,
        tileX: number,
        tileY: number,
        rotation: number = 0
    ) {
        this.id = nextPlaceableId++;
        this.game = game;
        this.placeableType = placeableType;
        this.tileX = tileX;
        this.tileY = tileY;
        this.rotation = rotation % 4;

        // Get config
        this.config = PLACEABLE_CONFIGS[placeableType];
        if (!this.config) {
            throw new Error(`Unknown placeable type: ${placeableType}`);
        }

        // Swap width/depth for 90° and 270° rotations
        if (rotation % 2 === 1) {
            this.width = this.config.depth;
            this.depth = this.config.width;
        } else {
            this.width = this.config.width;
            this.depth = this.config.depth;
        }
    }

    // =========================================
    // Position & Tile Methods
    // =========================================

    /**
     * Get all tiles occupied by this placeable
     */
    getOccupiedTiles(): GridPos[] {
        const tiles: GridPos[] = [];
        for (let dx = 0; dx < this.width; dx++) {
            for (let dy = 0; dy < this.depth; dy++) {
                tiles.push({ x: this.tileX + dx, y: this.tileY + dy });
            }
        }
        return tiles;
    }

    /**
     * Check if a tile is occupied by this placeable
     */
    occupiesTile(x: number, y: number): boolean {
        return x >= this.tileX && x < this.tileX + this.width &&
               y >= this.tileY && y < this.tileY + this.depth;
    }

    /**
     * Get the world position (center of the placeable)
     */
    getWorldPos(): { x: number; y: number } {
        return {
            x: this.tileX + this.width / 2,
            y: this.tileY + this.depth / 2,
        };
    }

    /**
     * Get depth for rendering (based on front-most tile)
     * For multi-tile placeables, use the front corner (highest tileX + tileY)
     */
    getDepth(): number {
        // Front-most tile is at (tileX + width - 1, tileY + depth - 1)
        return (this.tileX + this.width - 1) + (this.tileY + this.depth - 1);
    }

    /**
     * Get display name
     */
    getDisplayName(): string {
        return this.config.name;
    }

    /**
     * Get category
     */
    getCategory(): PlaceableCategory {
        return this.config.category;
    }

    // =========================================
    // Rotation Transform Methods
    // =========================================

    /**
     * Transform a relative position based on rotation
     * Takes a position relative to unrotated anchor and returns world position
     */
    transformRelativePosition(relativeX: number, relativeY: number): GridPos {
        let rx = relativeX;
        let ry = relativeY;

        // Rotate around anchor based on rotation
        // Also need to account for dimension swapping
        const origWidth = this.config.width;
        const origDepth = this.config.depth;

        switch (this.rotation) {
            case 1: // 90° clockwise
                rx = origDepth - 1 - relativeY;
                ry = relativeX;
                break;
            case 2: // 180°
                rx = origWidth - 1 - relativeX;
                ry = origDepth - 1 - relativeY;
                break;
            case 3: // 270° clockwise (90° counter-clockwise)
                rx = relativeY;
                ry = origWidth - 1 - relativeX;
                break;
            // case 0: no transformation needed
        }

        return {
            x: this.tileX + rx,
            y: this.tileY + ry
        };
    }

    /**
     * Transform a facing direction based on rotation
     */
    transformFacing(facing: EdgeDirection): EdgeDirection {
        const directions: EdgeDirection[] = ['north', 'east', 'south', 'west'];
        const index = directions.indexOf(facing);
        const newIndex = (index + this.rotation) % 4;
        return directions[newIndex];
    }

    // =========================================
    // Interaction Point Methods
    // =========================================

    /**
     * Get all interaction points with world positions
     */
    getInteractionPoints(): Array<InteractionPoint & { worldX: number; worldY: number; worldFacing?: EdgeDirection }> {
        return this.config.interactions.map(interaction => {
            const worldPos = this.transformRelativePosition(interaction.relativeX, interaction.relativeY);
            return {
                ...interaction,
                worldX: worldPos.x,
                worldY: worldPos.y,
                worldFacing: interaction.facing ? this.transformFacing(interaction.facing) : undefined
            };
        });
    }

    /**
     * Get interaction points of a specific type
     */
    getInteractionPointsByType(type: InteractionType): Array<InteractionPoint & { worldX: number; worldY: number; worldFacing?: EdgeDirection; index: number }> {
        return this.config.interactions
            .map((interaction, index) => ({ ...interaction, index }))
            .filter(interaction => interaction.type === type)
            .map(interaction => {
                const worldPos = this.transformRelativePosition(interaction.relativeX, interaction.relativeY);
                return {
                    ...interaction,
                    worldX: worldPos.x,
                    worldY: worldPos.y,
                    worldFacing: interaction.facing ? this.transformFacing(interaction.facing) : undefined
                };
            });
    }

    /**
     * Find the nearest available interaction point of a type for an entity
     */
    findAvailableInteraction(
        type: InteractionType,
        entityType: InteractingEntityType,
        fromX: number,
        fromY: number
    ): { worldX: number; worldY: number; worldFacing?: EdgeDirection; index: number } | null {
        const points = this.getInteractionPointsByType(type)
            .filter(p => p.entities.includes(entityType));

        let nearest: typeof points[0] | null = null;
        let nearestDist = Infinity;

        for (const point of points) {
            // Check if this point has available capacity
            const capacity = point.capacity || 1;
            const currentUsers = this.reservations.filter(r => r.interactionIndex === point.index).length;

            if (currentUsers < capacity) {
                const dist = Math.abs(point.worldX - fromX) + Math.abs(point.worldY - fromY);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = point;
                }
            }
        }

        return nearest;
    }

    /**
     * Reserve an interaction point for an entity
     */
    reserveInteraction(interactionIndex: number, entityId: number, entityType: InteractingEntityType): boolean {
        const interaction = this.config.interactions[interactionIndex];
        if (!interaction) return false;

        const capacity = interaction.capacity || 1;
        const currentUsers = this.reservations.filter(r => r.interactionIndex === interactionIndex).length;

        if (currentUsers >= capacity) return false;

        this.reservations.push({ interactionIndex, entityId, entityType });
        return true;
    }

    /**
     * Release an interaction reservation
     */
    releaseInteraction(entityId: number): void {
        this.reservations = this.reservations.filter(r => r.entityId !== entityId);
    }

    /**
     * Check if an entity has a reservation at this placeable
     */
    hasReservation(entityId: number): boolean {
        return this.reservations.some(r => r.entityId === entityId);
    }

    /**
     * Get the interaction point an entity has reserved
     */
    getEntityReservation(entityId: number): { worldX: number; worldY: number; worldFacing?: EdgeDirection } | null {
        const reservation = this.reservations.find(r => r.entityId === entityId);
        if (!reservation) return null;

        const interaction = this.config.interactions[reservation.interactionIndex];
        const worldPos = this.transformRelativePosition(interaction.relativeX, interaction.relativeY);

        return {
            worldX: worldPos.x,
            worldY: worldPos.y,
            worldFacing: interaction.facing ? this.transformFacing(interaction.facing) : undefined
        };
    }

    /**
     * Get current usage count for an interaction type
     */
    getUsageCount(type: InteractionType): number {
        return this.reservations.filter(r => {
            const interaction = this.config.interactions[r.interactionIndex];
            return interaction && interaction.type === type;
        }).length;
    }

    /**
     * Get total active reservation count (for occupancy display)
     */
    getActiveReservationCount(): number {
        return this.reservations.length;
    }

    /**
     * Get total capacity for an interaction type
     */
    getTotalCapacity(type: InteractionType): number {
        return this.config.interactions
            .filter(i => i.type === type)
            .reduce((sum, i) => sum + (i.capacity || 1), 0);
    }

    /**
     * Get interaction points that satisfy a specific guest need
     */
    getInteractionsSatisfying(need: GuestNeed): Array<InteractionPoint & { worldX: number; worldY: number; worldFacing?: EdgeDirection; index: number; placeable: Placeable }> {
        return this.config.interactions
            .map((interaction, index) => ({ ...interaction, index }))
            .filter(interaction => interaction.satisfies?.includes(need))
            .filter(interaction => {
                // Check if this interaction has available capacity
                const capacity = interaction.capacity || 1;
                const currentUsers = this.reservations.filter(r => r.interactionIndex === interaction.index).length;
                return currentUsers < capacity;
            })
            .map(interaction => {
                const worldPos = this.transformRelativePosition(interaction.relativeX, interaction.relativeY);
                return {
                    ...interaction,
                    worldX: worldPos.x,
                    worldY: worldPos.y,
                    worldFacing: interaction.facing ? this.transformFacing(interaction.facing) : undefined,
                    placeable: this
                };
            })
            .filter(interaction => {
                // Check if the approach tile is accessible (not blocked by another building)
                const approachTile = this.calculateApproachTile(interaction, 0, 0);

                // Check if approach tile is blocked by water
                const tile = this.game.world.getTile(approachTile.x, approachTile.y);
                if (!tile || tile.terrain === 'fresh_water' || tile.terrain === 'salt_water') return false;

                // Check if approach tile is blocked by another placeable
                const blockingPlaceable = this.game.getPlaceableAtTile(approachTile.x, approachTile.y);
                if (blockingPlaceable && blockingPlaceable !== this) return false;

                // Check if approach tile is reachable (on a path or within 2 tiles of a path)
                // This prevents guests from targeting interactions they can't actually reach
                if (!tile.path) {
                    const maxDistance = 2;
                    let nearPath = false;
                    for (let dy = -maxDistance; dy <= maxDistance && !nearPath; dy++) {
                        for (let dx = -maxDistance; dx <= maxDistance && !nearPath; dx++) {
                            if (Math.abs(dx) + Math.abs(dy) <= maxDistance) {
                                const checkTile = this.game.world.getTile(approachTile.x + dx, approachTile.y + dy);
                                if (checkTile?.path) {
                                    nearPath = true;
                                }
                            }
                        }
                    }
                    if (!nearPath) return false;
                }

                return true;
            });
    }

    /**
     * Calculate the approach tile for an interaction point based on its approach type
     * Returns the tile position where the entity should stand to use this interaction
     */
    calculateApproachTile(
        interaction: InteractionPoint & { worldX: number; worldY: number; worldFacing?: EdgeDirection },
        entityX: number,
        entityY: number
    ): { x: number; y: number } {
        const approach = interaction.approach || 'direct';
        let targetX = interaction.worldX;
        let targetY = interaction.worldY;

        switch (approach) {
            case 'facing':
                // Stand adjacent on the side the interaction faces
                if (interaction.worldFacing) {
                    const offset = this.getApproachOffset(interaction.worldFacing);
                    targetX += offset.dx;
                    targetY += offset.dy;
                }
                break;

            case 'any':
                // Find nearest walkable adjacent tile
                const adjacent = this.findNearestAdjacentTile(
                    interaction.worldX,
                    interaction.worldY,
                    entityX,
                    entityY
                );
                if (adjacent) {
                    targetX = adjacent.x;
                    targetY = adjacent.y;
                }
                break;

            case 'enter':
                // Same as facing - approach first, then step inside (state machine handles entry)
                if (interaction.worldFacing) {
                    const offset = this.getApproachOffset(interaction.worldFacing);
                    targetX += offset.dx;
                    targetY += offset.dy;
                }
                break;

            case 'direct':
            default:
                // Walk directly onto the interaction tile
                break;
        }

        return { x: targetX, y: targetY };
    }

    /**
     * Get the offset for approaching from a facing direction
     */
    private getApproachOffset(facing: EdgeDirection): { dx: number; dy: number } {
        switch (facing) {
            case 'south': return { dx: 1, dy: 0 };  // Stand to the south (+X)
            case 'north': return { dx: -1, dy: 0 }; // Stand to the north (-X)
            case 'west': return { dx: 0, dy: 1 };   // Stand to the west (+Y)
            case 'east': return { dx: 0, dy: -1 };  // Stand to the east (-Y)
            default: return { dx: 0, dy: 0 };
        }
    }

    /**
     * Find the nearest walkable adjacent tile to an interaction point
     */
    private findNearestAdjacentTile(
        targetX: number,
        targetY: number,
        entityX: number,
        entityY: number
    ): { x: number; y: number } | null {
        const adjacents = [
            { x: targetX + 1, y: targetY },
            { x: targetX - 1, y: targetY },
            { x: targetX, y: targetY + 1 },
            { x: targetX, y: targetY - 1 },
        ];

        // Filter to walkable tiles and sort by distance
        const walkable = adjacents
            .filter(pos => {
                const tile = this.game.world.getTile(pos.x, pos.y);
                if (!tile) return false;
                if (tile.terrain === 'fresh_water' || tile.terrain === 'salt_water') return false;
                // Check not blocked by another placeable
                if (this.game.getPlaceableAtTile(pos.x, pos.y)) return false;
                return true;
            })
            .sort((a, b) => {
                const distA = Math.abs(a.x - entityX) + Math.abs(a.y - entityY);
                const distB = Math.abs(b.x - entityX) + Math.abs(b.y - entityY);
                return distA - distB;
            });

        return walkable[0] || null;
    }

    // =========================================
    // Static Methods
    // =========================================

    /**
     * Check if placement is valid at the given position
     */
    static canPlace(
        game: Game,
        placeableType: string,
        tileX: number,
        tileY: number,
        rotation: number = 0
    ): boolean {
        const config = PLACEABLE_CONFIGS[placeableType];
        if (!config) return false;

        // Get dimensions after rotation
        const width = rotation % 2 === 1 ? config.depth : config.width;
        const depth = rotation % 2 === 1 ? config.width : config.depth;

        for (let dx = 0; dx < width; dx++) {
            for (let dy = 0; dy < depth; dy++) {
                const x = tileX + dx;
                const y = tileY + dy;

                // Check bounds
                if (!game.world.isInBounds(x, y)) return false;

                // Check terrain
                const tile = game.world.getTile(x, y);
                if (!tile) return false;
                if (tile.terrain === 'fresh_water' || tile.terrain === 'salt_water') return false;

                // Buildings can't be placed on paths
                if (tile.path) return false;

                // Check for existing placeables
                if (game.getPlaceableAtTile(x, y)) return false;

                // Check for foliage at this tile
                const foliageAtTile = game.getFoliageAtTile(x, y);
                if (foliageAtTile.length > 0) return false;

                // Check for ANY fences on this tile's edges
                // Buildings cannot be placed where fences exist
                if (tile.fences.north || tile.fences.south || tile.fences.east || tile.fences.west) {
                    return false;
                }
            }
        }

        return true;
    }
}
