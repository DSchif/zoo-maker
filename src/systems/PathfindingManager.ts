import type { PathRequest, PathResponse, GridPos, TileData, EdgeDirection } from '../core/types';
import type { World } from '../core/World';
import type { Game } from '../core/Game';

// Gate position for syncing with worker
interface GatePosition {
    tileX: number;
    tileY: number;
    edge: EdgeDirection;
}

// Failed fence position for syncing with worker
interface FailedFencePosition {
    tileX: number;
    tileY: number;
    edge: EdgeDirection;
}

// Blocked tile position (for shelters/placeables)
interface BlockedTile {
    x: number;
    y: number;
}

/**
 * PathfindingManager handles communication with the pathfinding Web Worker.
 * It queues path requests and delivers results asynchronously.
 */
export class PathfindingManager {
    private worker: Worker;
    private requestId: number = 0;
    private pendingRequests: Map<number, (response: PathResponse) => void> = new Map();
    private ready: boolean = false;
    private readyPromise: Promise<void>;
    private resolveReady!: () => void;

    constructor() {
        // Create the worker
        this.worker = new Worker(
            new URL('../workers/pathfinding.worker.ts', import.meta.url),
            { type: 'module' }
        );

        // Set up ready promise
        this.readyPromise = new Promise(resolve => {
            this.resolveReady = resolve;
        });

        // Handle messages from worker
        this.worker.onmessage = (e: MessageEvent) => {
            this.handleMessage(e.data);
        };

        this.worker.onerror = (error) => {
            console.error('Pathfinding worker error:', error);
        };
    }

    // Reference to game for extracting gate info
    private game: Game | null = null;

    /**
     * Initialize the worker with world data
     */
    async initialize(world: World, game?: Game): Promise<void> {
        if (game) {
            this.game = game;
        }
        const worldData = this.extractWorldData(world);
        this.worker.postMessage({ type: 'init', data: worldData });
        await this.readyPromise;
    }

    /**
     * Update the worker with new world data (after terrain/fence changes)
     */
    updateWorld(world: World): void {
        const worldData = this.extractWorldData(world);
        this.worker.postMessage({ type: 'updateWorld', data: worldData });
    }

    /**
     * Extract tile data from World in a format the worker can use
     */
    private extractWorldData(world: World): { width: number; height: number; tiles: (TileData | null)[][]; gates: GatePosition[]; failedFences: FailedFencePosition[]; blockedTiles: BlockedTile[] } {
        const tiles: (TileData | null)[][] = [];

        for (let y = 0; y < world.height; y++) {
            tiles[y] = [];
            for (let x = 0; x < world.width; x++) {
                tiles[y][x] = world.getTile(x, y);
            }
        }

        // Extract gate positions from exhibits
        const gates: GatePosition[] = [];
        // Extract failed fence positions
        const failedFences: FailedFencePosition[] = [];
        // Extract blocked tiles from placeables (shelters, etc.)
        const blockedTiles: BlockedTile[] = [];

        if (this.game) {
            for (const exhibit of this.game.exhibits) {
                gates.push({
                    tileX: exhibit.gate.tileX,
                    tileY: exhibit.gate.tileY,
                    edge: exhibit.gate.edge,
                });
            }

            // Collect all failed fences
            for (let y = 0; y < world.height; y++) {
                for (let x = 0; x < world.width; x++) {
                    const edges: Array<'north' | 'south' | 'east' | 'west'> = ['north', 'south', 'east', 'west'];
                    for (const edge of edges) {
                        if (world.getFence(x, y, edge) && this.game.isFenceFailed(x, y, edge)) {
                            failedFences.push({ tileX: x, tileY: y, edge });
                        }
                    }
                }
            }

            // Collect blocked tiles from shelters
            for (const shelter of this.game.shelters) {
                for (const tile of shelter.getOccupiedTiles()) {
                    blockedTiles.push({ x: tile.x, y: tile.y });
                }
            }

            // Collect blocked tiles from buildings
            for (const building of this.game.buildings) {
                for (const tile of building.getOccupiedTiles()) {
                    blockedTiles.push({ x: tile.x, y: tile.y });
                }
            }
        }

        return {
            width: world.width,
            height: world.height,
            tiles,
            gates,
            failedFences,
            blockedTiles,
        };
    }

    /**
     * Handle messages from the worker
     */
    private handleMessage(message: { type: string; data?: unknown }): void {
        switch (message.type) {
            case 'ready':
                this.ready = true;
                this.resolveReady();
                break;

            case 'pathResult':
                const response = message.data as PathResponse;
                const callback = this.pendingRequests.get(response.id);
                if (callback) {
                    callback(response);
                    this.pendingRequests.delete(response.id);
                }
                break;

            case 'pathResultBatch':
                const responses = message.data as PathResponse[];
                for (const resp of responses) {
                    const cb = this.pendingRequests.get(resp.id);
                    if (cb) {
                        cb(resp);
                        this.pendingRequests.delete(resp.id);
                    }
                }
                break;
        }
    }

    /**
     * Request a path (returns a promise)
     */
    async findPath(
        entityId: number,
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        canUsePaths: boolean = true,
        canPassGates: boolean = false
    ): Promise<GridPos[]> {
        if (!this.ready) {
            await this.readyPromise;
        }

        return new Promise(resolve => {
            const id = this.requestId++;

            const request: PathRequest = {
                id,
                entityId,
                startX,
                startY,
                endX,
                endY,
                canUsePaths,
                canPassGates,
            };

            this.pendingRequests.set(id, (response) => {
                resolve(response.path);
            });

            this.worker.postMessage({ type: 'findPath', data: request });
        });
    }

    /**
     * Request multiple paths at once (more efficient for batch updates)
     */
    async findPathBatch(
        requests: Array<{
            entityId: number;
            startX: number;
            startY: number;
            endX: number;
            endY: number;
            canUsePaths: boolean;
            canPassGates: boolean;
        }>
    ): Promise<Map<number, GridPos[]>> {
        if (!this.ready) {
            await this.readyPromise;
        }

        return new Promise(resolve => {
            const results = new Map<number, GridPos[]>();
            let remaining = requests.length;

            if (remaining === 0) {
                resolve(results);
                return;
            }

            const pathRequests: PathRequest[] = requests.map(req => {
                const id = this.requestId++;

                this.pendingRequests.set(id, (response) => {
                    results.set(response.entityId, response.path);
                    remaining--;

                    if (remaining === 0) {
                        resolve(results);
                    }
                });

                return {
                    id,
                    entityId: req.entityId,
                    startX: req.startX,
                    startY: req.startY,
                    endX: req.endX,
                    endY: req.endY,
                    canUsePaths: req.canUsePaths,
                    canPassGates: req.canPassGates,
                };
            });

            this.worker.postMessage({ type: 'findPathBatch', data: pathRequests });
        });
    }

    /**
     * Terminate the worker (cleanup)
     */
    destroy(): void {
        this.worker.terminate();
    }
}
