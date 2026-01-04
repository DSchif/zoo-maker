import {
    GridPos,
    TileData,
    Chunk,
    TerrainType,
    PathType,
    FenceType,
    EdgeDirection,
    GameConfig,
    DEFAULT_CONFIG,
} from './types';

/**
 * World manages the tile-based game world using a chunk system.
 * This allows efficient rendering, updates, and serialization.
 */
export class World {
    public readonly width: number;       // World width in tiles
    public readonly height: number;      // World height in tiles
    public readonly chunkSize: number;   // Tiles per chunk edge
    public readonly chunksX: number;     // Number of chunks horizontally
    public readonly chunksY: number;     // Number of chunks vertically

    private chunks: Map<string, Chunk> = new Map();

    // Entrance position
    public readonly entranceX: number;
    public readonly entranceY: number;

    constructor(config: GameConfig = DEFAULT_CONFIG) {
        this.width = config.worldWidth;
        this.height = config.worldHeight;
        this.chunkSize = config.chunkSize;

        this.chunksX = Math.ceil(this.width / this.chunkSize);
        this.chunksY = Math.ceil(this.height / this.chunkSize);

        // Entrance at bottom center
        this.entranceX = Math.floor(this.width / 2);
        this.entranceY = this.height - 1;

        this.initializeChunks();
    }

    /**
     * Initialize all chunks with default terrain
     */
    private initializeChunks(): void {
        for (let cy = 0; cy < this.chunksY; cy++) {
            for (let cx = 0; cx < this.chunksX; cx++) {
                const chunk = this.createChunk(cx, cy);
                this.chunks.set(this.getChunkKey(cx, cy), chunk);
            }
        }

        // Set up border walls and entrance
        this.initializeBorder();

        // Create entrance path
        this.createEntrancePath();
    }

    /**
     * Create a new chunk with default tiles
     */
    private createChunk(chunkX: number, chunkY: number): Chunk {
        const tiles: TileData[][] = [];

        for (let y = 0; y < this.chunkSize; y++) {
            tiles[y] = [];
            for (let x = 0; x < this.chunkSize; x++) {
                tiles[y][x] = this.createDefaultTile();
            }
        }

        return {
            x: chunkX,
            y: chunkY,
            tiles,
            dirty: true,
            visible: false,
        };
    }

    /**
     * Create a default tile (grass, no path, no fences)
     */
    private createDefaultTile(): TileData {
        return {
            terrain: 'grass',
            path: null,
            fences: {
                north: null,
                south: null,
                east: null,
                west: null,
            },
        };
    }

    /**
     * Initialize border walls around the zoo
     *
     * Based on isometric edge mapping:
     * - East edges block -Y movement (north) → use on top border (y=0)
     * - West edges block +Y movement (south) → use on bottom border (y=height-1)
     * - North edges block -X movement (west) → use on left border (x=0)
     * - South edges block +X movement (east) → use on right border (x=width-1)
     */
    private initializeBorder(): void {
        // Place concrete walls around the entire border
        for (let x = 0; x < this.width; x++) {
            // Top boundary (y=0): 'east' edges block movement north (to y=-1)
            this.setFence(x, 0, 'east', 'concrete');
            // Bottom boundary (y=height-1): 'west' edges block movement south (to y=height)
            this.setFence(x, this.height - 1, 'west', 'concrete');
        }

        for (let y = 0; y < this.height; y++) {
            // Left boundary (x=0): 'north' edges block movement west (to x=-1)
            this.setFence(0, y, 'north', 'concrete');
            // Right boundary (x=width-1): 'south' edges block movement east (to x=width)
            this.setFence(this.width - 1, y, 'south', 'concrete');
        }

        // Create entrance gate (remove fence, add path)
        // Entrance is at bottom boundary, so remove 'west' edges
        for (let dx = -1; dx <= 1; dx++) {
            const ex = this.entranceX + dx;
            if (ex >= 0 && ex < this.width) {
                this.setFence(ex, this.entranceY, 'west', null);
            }
        }
    }

    /**
     * Create the entrance path from edge to a few tiles in
     */
    private createEntrancePath(): void {
        const pathLength = 5;
        // 3-tile wide entrance path
        for (let dx = -1; dx <= 1; dx++) {
            const ex = this.entranceX + dx;
            if (ex >= 0 && ex < this.width) {
                for (let i = 0; i < pathLength; i++) {
                    this.setPath(ex, this.entranceY - i, 'stone');
                }
            }
        }
    }

    /**
     * Get chunk key for Map storage
     */
    private getChunkKey(chunkX: number, chunkY: number): string {
        return `${chunkX},${chunkY}`;
    }

    /**
     * Get chunk coordinates from tile coordinates
     */
    private getChunkCoords(tileX: number, tileY: number): { cx: number; cy: number; lx: number; ly: number } {
        const cx = Math.floor(tileX / this.chunkSize);
        const cy = Math.floor(tileY / this.chunkSize);
        const lx = tileX - cx * this.chunkSize;  // Local x within chunk
        const ly = tileY - cy * this.chunkSize;  // Local y within chunk
        return { cx, cy, lx, ly };
    }

    /**
     * Check if tile coordinates are within world bounds
     */
    isInBounds(tileX: number, tileY: number): boolean {
        return tileX >= 0 && tileX < this.width && tileY >= 0 && tileY < this.height;
    }

    /**
     * Get tile data at coordinates
     */
    getTile(tileX: number, tileY: number): TileData | null {
        if (!this.isInBounds(tileX, tileY)) return null;

        const { cx, cy, lx, ly } = this.getChunkCoords(tileX, tileY);
        const chunk = this.chunks.get(this.getChunkKey(cx, cy));

        if (!chunk) return null;
        return chunk.tiles[ly]?.[lx] ?? null;
    }

    /**
     * Set terrain at coordinates
     */
    setTerrain(tileX: number, tileY: number, terrain: TerrainType): boolean {
        if (!this.isInBounds(tileX, tileY)) return false;

        const { cx, cy, lx, ly } = this.getChunkCoords(tileX, tileY);
        const chunk = this.chunks.get(this.getChunkKey(cx, cy));

        if (!chunk) return false;

        chunk.tiles[ly][lx].terrain = terrain;
        chunk.dirty = true;

        // Mark adjacent tiles' chunks as dirty for terrain blending updates
        this.markAdjacentTilesDirty(tileX, tileY);

        return true;
    }

    /**
     * Mark chunks containing adjacent tiles as dirty (for terrain blending)
     */
    private markAdjacentTilesDirty(tileX: number, tileY: number): void {
        const directions = [
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
            { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
            { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
        ];

        for (const dir of directions) {
            const nx = tileX + dir.dx;
            const ny = tileY + dir.dy;
            if (!this.isInBounds(nx, ny)) continue;

            const { cx, cy } = this.getChunkCoords(nx, ny);
            const chunk = this.chunks.get(this.getChunkKey(cx, cy));
            if (chunk) {
                chunk.dirty = true;
            }
        }
    }

    /**
     * Set path at coordinates
     */
    setPath(tileX: number, tileY: number, pathType: PathType): boolean {
        if (!this.isInBounds(tileX, tileY)) return false;

        const { cx, cy, lx, ly } = this.getChunkCoords(tileX, tileY);
        const chunk = this.chunks.get(this.getChunkKey(cx, cy));

        if (!chunk) return false;

        chunk.tiles[ly][lx].path = pathType;
        chunk.dirty = true;
        return true;
    }

    /**
     * Set fence on a tile edge
     */
    setFence(tileX: number, tileY: number, edge: EdgeDirection, fenceType: FenceType): boolean {
        if (!this.isInBounds(tileX, tileY)) return false;

        const { cx, cy, lx, ly } = this.getChunkCoords(tileX, tileY);
        const chunk = this.chunks.get(this.getChunkKey(cx, cy));

        if (!chunk) return false;

        chunk.tiles[ly][lx].fences[edge] = fenceType;
        chunk.dirty = true;

        // Also mark adjacent chunk dirty if fence is on edge
        this.markAdjacentChunkDirty(tileX, tileY, edge);

        return true;
    }

    /**
     * Get fence on a tile edge
     */
    getFence(tileX: number, tileY: number, edge: EdgeDirection): FenceType {
        const tile = this.getTile(tileX, tileY);
        return tile?.fences[edge] ?? null;
    }

    /**
     * Mark adjacent chunk as dirty when fence changes on boundary
     */
    private markAdjacentChunkDirty(tileX: number, tileY: number, edge: EdgeDirection): void {
        let adjX = tileX;
        let adjY = tileY;

        switch (edge) {
            case 'north': adjY--; break;
            case 'south': adjY++; break;
            case 'east': adjX++; break;
            case 'west': adjX--; break;
        }

        if (!this.isInBounds(adjX, adjY)) return;

        const { cx, cy } = this.getChunkCoords(adjX, adjY);
        const chunk = this.chunks.get(this.getChunkKey(cx, cy));
        if (chunk) chunk.dirty = true;
    }

    /**
     * Check if movement between two adjacent tiles is blocked by a fence
     *
     * In isometric view, edges map to visual sides:
     * - North edge = TOP-LEFT side (blocks movement in +X direction)
     * - South edge = BOTTOM-RIGHT side (blocks movement in -X direction)
     * - East edge = TOP-RIGHT side (blocks movement in +Y direction)
     * - West edge = BOTTOM-LEFT side (blocks movement in -Y direction)
     */
    isMovementBlocked(fromX: number, fromY: number, toX: number, toY: number, canPassGates: boolean = false, game?: any): boolean {
        const dx = toX - fromX;
        const dy = toY - fromY;

        // Map world movement direction to visual fence edges
        // The edge that blocks entry to destination, and edge that blocks exit from source
        let fromEdge: EdgeDirection | null = null;
        let toEdge: EdgeDirection | null = null;

        if (dx === 1) {
            // Moving east (+X): north edge blocks entry (left side), south edge blocks exit (right side)
            fromEdge = 'south';
            toEdge = 'north';
        }
        else if (dx === -1) {
            // Moving west (-X): south edge blocks entry (right side), north edge blocks exit (left side)
            fromEdge = 'north';
            toEdge = 'south';
        }
        else if (dy === 1) {
            // Moving south (+Y): east edge blocks entry (top side), west edge blocks exit (bottom side)
            fromEdge = 'west';
            toEdge = 'east';
        }
        else if (dy === -1) {
            // Moving north (-Y): west edge blocks entry (bottom side), east edge blocks exit (top side)
            fromEdge = 'east';
            toEdge = 'west';
        }

        if (!fromEdge || !toEdge) return false;

        // Check if there's a fence on either edge (fences block from both sides)
        const fenceFrom = this.getFence(fromX, fromY, fromEdge);
        const fenceTo = this.getFence(toX, toY, toEdge);

        // If no fences, movement is not blocked
        if (fenceFrom === null && fenceTo === null) return false;

        // If we can pass gates, check if the fence between these tiles is a gate
        // A gate might be registered on either side of the fence (from or to tile)
        if (canPassGates && game) {
            const isGate = (fenceFrom !== null && game.isGateAt(fromX, fromY, fromEdge)) ||
                           (fenceTo !== null && game.isGateAt(toX, toY, toEdge));

            // If this fence is a gate, allow passage
            if (isGate) {
                return false;
            }
        }

        // Check if fences have failed (animals can pass through)
        if (game) {
            const fromFailed = fenceFrom !== null && game.isFenceFailed(fromX, fromY, fromEdge);
            const toFailed = fenceTo !== null && game.isFenceFailed(toX, toY, toEdge);

            // If both sides of the fence are either null or failed, movement is not blocked
            if ((fenceFrom === null || fromFailed) && (fenceTo === null || toFailed)) {
                return false;
            }
        }

        return fenceFrom !== null || fenceTo !== null;
    }

    /**
     * Get chunk at chunk coordinates
     */
    getChunk(chunkX: number, chunkY: number): Chunk | null {
        return this.chunks.get(this.getChunkKey(chunkX, chunkY)) ?? null;
    }

    /**
     * Get all chunks (for iteration)
     */
    getAllChunks(): Chunk[] {
        return Array.from(this.chunks.values());
    }

    /**
     * Get chunks that are visible within bounds
     */
    getVisibleChunks(minTileX: number, minTileY: number, maxTileX: number, maxTileY: number): Chunk[] {
        const minCX = Math.floor(minTileX / this.chunkSize);
        const minCY = Math.floor(minTileY / this.chunkSize);
        const maxCX = Math.floor(maxTileX / this.chunkSize);
        const maxCY = Math.floor(maxTileY / this.chunkSize);

        const visible: Chunk[] = [];

        for (let cy = minCY; cy <= maxCY; cy++) {
            for (let cx = minCX; cx <= maxCX; cx++) {
                const chunk = this.getChunk(cx, cy);
                if (chunk) {
                    chunk.visible = true;
                    visible.push(chunk);
                }
            }
        }

        return visible;
    }

    /**
     * Mark all chunks as not visible (call before getVisibleChunks)
     */
    resetVisibility(): void {
        for (const chunk of this.chunks.values()) {
            chunk.visible = false;
        }
    }

    /**
     * Get dirty chunks that need re-rendering
     */
    getDirtyChunks(): Chunk[] {
        return Array.from(this.chunks.values()).filter(c => c.dirty);
    }

    /**
     * Mark a chunk as clean after re-rendering
     */
    markChunkClean(chunk: Chunk): void {
        chunk.dirty = false;
    }

    /**
     * Mark all chunks as dirty (for camera rotation)
     */
    markAllChunksDirty(): void {
        for (const chunk of this.chunks.values()) {
            chunk.dirty = true;
        }
    }

    /**
     * Get entrance position
     */
    getEntrancePosition(): GridPos {
        return { x: this.entranceX, y: this.entranceY };
    }
}
