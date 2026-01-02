import type { Game } from '../core/Game';
import type { GridPos, EdgeDirection, FenceType } from '../core/types';

/**
 * Gate information
 */
interface GateInfo {
    tileX: number;
    tileY: number;
    edge: EdgeDirection;
    fenceType: FenceType;
}

/**
 * Fence edge information
 */
interface FenceEdge {
    tileX: number;
    tileY: number;
    edge: EdgeDirection;
}

/**
 * Exhibit class - represents an enclosed animal habitat
 */
export class Exhibit {
    private game: Game;

    public readonly id: number;
    public name: string;

    // Gate location (the fence that completes the perimeter)
    public gate: GateInfo;

    // All fence edges that form the perimeter
    public perimeterFences: FenceEdge[] = [];

    // All tiles inside the exhibit (not including fence tiles)
    public interiorTiles: GridPos[] = [];

    // Stats
    public createdDay: number;

    // Static ID counter
    private static nextId: number = 1;

    constructor(game: Game, name?: string) {
        this.game = game;
        this.id = Exhibit.nextId++;
        this.name = name || `Exhibit #${this.id}`;
        this.createdDay = game.totalDays;

        this.gate = {
            tileX: 0,
            tileY: 0,
            edge: 'north',
            fenceType: null,
        };
    }

    /**
     * Set the gate location
     */
    setGate(tileX: number, tileY: number, edge: EdgeDirection, fenceType: FenceType): void {
        this.gate = { tileX, tileY, edge, fenceType };
    }

    /**
     * Set the perimeter fences
     */
    setPerimeter(fences: FenceEdge[]): void {
        this.perimeterFences = fences;
    }

    /**
     * Set interior tiles
     */
    setInteriorTiles(tiles: GridPos[]): void {
        this.interiorTiles = tiles;
    }

    /**
     * Check if a tile is inside this exhibit
     */
    containsTile(tileX: number, tileY: number): boolean {
        return this.interiorTiles.some(t => t.x === tileX && t.y === tileY);
    }

    /**
     * Get the number of interior tiles
     */
    getTileCount(): number {
        return this.interiorTiles.length;
    }

    /**
     * Check if a fence edge is part of this exhibit's perimeter
     */
    hasFenceEdge(tileX: number, tileY: number, edge: EdgeDirection): boolean {
        return this.perimeterFences.some(f =>
            f.tileX === tileX && f.tileY === tileY && f.edge === edge
        );
    }

    /**
     * Check if the gate is at this location
     */
    isGateAt(tileX: number, tileY: number, edge: EdgeDirection): boolean {
        return this.gate.tileX === tileX &&
               this.gate.tileY === tileY &&
               this.gate.edge === edge;
    }

    /**
     * Get all animals currently inside the exhibit
     */
    getAnimals(): any[] {
        return this.game.animals?.filter((animal: any) =>
            this.containsTile(animal.tileX, animal.tileY)
        ) || [];
    }

    /**
     * Get exhibit statistics
     */
    getStats(): {
        name: string;
        totalAnimals: number;
        animalsBySpecies: Record<string, any[]>;
        size: number;
        avgHappiness: number;
        avgHunger: number;
        createdDay: number;
    } {
        const animals = this.getAnimals();
        const animalsBySpecies: Record<string, any[]> = {};

        for (const animal of animals) {
            if (!animalsBySpecies[animal.speciesName]) {
                animalsBySpecies[animal.speciesName] = [];
            }
            animalsBySpecies[animal.speciesName].push(animal);
        }

        let avgHappiness = 0;
        let avgHunger = 0;
        if (animals.length > 0) {
            avgHappiness = animals.reduce((sum: number, a: any) => sum + a.happiness, 0) / animals.length;
            avgHunger = animals.reduce((sum: number, a: any) => sum + a.hunger, 0) / animals.length;
        }

        return {
            name: this.name,
            totalAnimals: animals.length,
            animalsBySpecies,
            size: this.interiorTiles.length,
            avgHappiness: Math.round(avgHappiness),
            avgHunger: Math.round(avgHunger),
            createdDay: this.createdDay,
        };
    }

    /**
     * Set exhibit name
     */
    setName(newName: string): void {
        this.name = newName;
    }
}

/**
 * Check for enclosure when a fence is placed
 * Uses flood fill to detect enclosed areas
 */
export function checkForEnclosure(
    game: Game,
    startX: number,
    startY: number,
    startEdge: EdgeDirection,
    existingExhibits: Exhibit[]
): { enclosed: boolean; interiorTiles: GridPos[]; perimeterFences: FenceEdge[] } {
    const world = game.world;
    const maxSearchSize = 500; // Prevent infinite loops

    console.log(`checkForEnclosure called: tile=(${startX},${startY}) edge=${startEdge}`);

    // Try flood fill from both sides of the fence
    const sides = getAdjacentTiles(startX, startY, startEdge);
    console.log(`Adjacent tiles to check:`, sides);

    for (const side of sides) {
        console.log(`Checking side (${side.x}, ${side.y})...`);

        // Skip if this tile is already in an exhibit
        const alreadyInExhibit = existingExhibits.some(e =>
            e.containsTile(side.x, side.y)
        );
        if (alreadyInExhibit) {
            console.log(`  Skipped: already in exhibit`);
            continue;
        }

        // Skip if tile is outside world or is water
        const tile = world.getTile(side.x, side.y);
        if (!tile) {
            console.log(`  Skipped: tile outside world`);
            continue;
        }
        if (tile.terrain === 'water') {
            console.log(`  Skipped: water tile`);
            continue;
        }

        // Flood fill to find enclosed area
        console.log(`  Starting flood fill...`);
        const result = floodFillEnclosure(world, side.x, side.y, maxSearchSize);

        if (result.enclosed) {
            console.log(`  FOUND ENCLOSURE with ${result.interiorTiles.length} tiles!`);
            return result;
        } else {
            console.log(`  Not enclosed`);
        }
    }

    console.log(`No enclosure found from any side`);
    return { enclosed: false, interiorTiles: [], perimeterFences: [] };
}

/**
 * Get tiles adjacent to a fence edge
 */
function getAdjacentTiles(tileX: number, tileY: number, edge: EdgeDirection): GridPos[] {
    switch (edge) {
        case 'north': return [{ x: tileX, y: tileY }, { x: tileX, y: tileY - 1 }];
        case 'south': return [{ x: tileX, y: tileY }, { x: tileX, y: tileY + 1 }];
        case 'east': return [{ x: tileX, y: tileY }, { x: tileX + 1, y: tileY }];
        case 'west': return [{ x: tileX, y: tileY }, { x: tileX - 1, y: tileY }];
    }
}

/**
 * Flood fill to find enclosed area
 */
function floodFillEnclosure(
    world: any,
    startX: number,
    startY: number,
    maxSize: number
): { enclosed: boolean; interiorTiles: GridPos[]; perimeterFences: FenceEdge[] } {
    const visited = new Set<string>();
    const queue: GridPos[] = [{ x: startX, y: startY }];
    const interior: GridPos[] = [];
    const perimeter: FenceEdge[] = [];
    const getKey = (x: number, y: number) => `${x},${y}`;

    console.log(`Flood fill starting from (${startX}, ${startY})`);

    while (queue.length > 0) {
        if (interior.length > maxSize) {
            console.log(`Flood fill: area too large (${interior.length} > ${maxSize})`);
            return { enclosed: false, interiorTiles: [], perimeterFences: [] };
        }

        const current = queue.shift()!;
        const key = getKey(current.x, current.y);

        if (visited.has(key)) continue;
        visited.add(key);

        const tile = world.getTile(current.x, current.y);
        if (!tile) {
            console.log(`Flood fill: hit world edge at (${current.x}, ${current.y})`);
            return { enclosed: false, interiorTiles: [], perimeterFences: [] };
        }

        if (tile.terrain === 'water') continue;

        interior.push(current);

        // Check all 4 directions
        // The fenceEdge is the actual fence edge on the current tile that blocks movement
        // Based on isMovementBlocked mapping:
        // - north (dy=-1): 'east' edge blocks
        // - south (dy=+1): 'west' edge blocks
        // - east (dx=+1): 'south' edge blocks
        // - west (dx=-1): 'north' edge blocks
        const neighbors: Array<{ pos: GridPos; fenceEdge: EdgeDirection }> = [
            { pos: { x: current.x, y: current.y - 1 }, fenceEdge: 'east' },   // north movement blocked by east edge
            { pos: { x: current.x, y: current.y + 1 }, fenceEdge: 'west' },   // south movement blocked by west edge
            { pos: { x: current.x + 1, y: current.y }, fenceEdge: 'south' },  // east movement blocked by south edge
            { pos: { x: current.x - 1, y: current.y }, fenceEdge: 'north' },  // west movement blocked by north edge
        ];

        for (const neighbor of neighbors) {
            // Check if blocked by fence
            if (world.isMovementBlocked(current.x, current.y, neighbor.pos.x, neighbor.pos.y)) {
                // Add to perimeter - use the actual fence edge that's blocking
                perimeter.push({ tileX: current.x, tileY: current.y, edge: neighbor.fenceEdge });
            } else {
                // Can move there, add to queue
                if (!visited.has(getKey(neighbor.pos.x, neighbor.pos.y))) {
                    queue.push(neighbor.pos);
                }
            }
        }
    }

    console.log(`Flood fill complete: ${interior.length} interior tiles, ${perimeter.length} perimeter edges`);

    // If we got here without hitting world edge, it's enclosed
    if (interior.length > 0 && interior.length < maxSize) {
        return { enclosed: true, interiorTiles: interior, perimeterFences: perimeter };
    }

    return { enclosed: false, interiorTiles: [], perimeterFences: [] };
}
