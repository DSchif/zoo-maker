/**
 * Pathfinding Web Worker
 * Handles A* pathfinding off the main thread to keep UI smooth.
 */

import type { PathRequest, PathResponse, GridPos, TileData, EdgeDirection } from '../core/types';

// Gate position synced from main thread
interface GatePosition {
    tileX: number;
    tileY: number;
    edge: EdgeDirection;
}

// Failed fence position synced from main thread
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

// World data synced from main thread
let worldData: {
    width: number;
    height: number;
    tiles: (TileData | null)[][];
    gates: GatePosition[];
    failedFences: FailedFencePosition[];
    blockedTiles: BlockedTile[];
} | null = null;

// Set for fast blocked tile lookup
let blockedTileSet: Set<string> = new Set();

// Rebuild the blocked tile set from world data
function rebuildBlockedTileSet(): void {
    blockedTileSet.clear();
    if (worldData?.blockedTiles) {
        for (const tile of worldData.blockedTiles) {
            blockedTileSet.add(`${tile.x},${tile.y}`);
        }
    }
}

// Message handler
self.onmessage = (e: MessageEvent) => {
    const { type, data } = e.data;

    switch (type) {
        case 'init':
            // Initialize world data
            worldData = data;
            rebuildBlockedTileSet();
            self.postMessage({ type: 'ready' });
            break;

        case 'updateWorld':
            // Update world data (for incremental updates)
            worldData = data;
            rebuildBlockedTileSet();
            break;

        case 'findPath':
            // Process pathfinding request
            const request = data as PathRequest;
            const response = findPath(request);
            self.postMessage({ type: 'pathResult', data: response });
            break;

        case 'findPathBatch':
            // Process multiple pathfinding requests
            const requests = data as PathRequest[];
            const responses = requests.map(req => findPath(req));
            self.postMessage({ type: 'pathResultBatch', data: responses });
            break;
    }
};

/**
 * A* pathfinding algorithm
 */
function findPath(request: PathRequest): PathResponse {
    const { id, entityId, startX, startY, endX, endY, canUsePaths, canPassGates } = request;

    // Quick validation
    if (!worldData) {
        return { id, entityId, path: [], success: false };
    }

    // Already at destination
    if (startX === endX && startY === endY) {
        return { id, entityId, path: [], success: true };
    }

    // Check if destination is valid (allow blocked tiles as destination - e.g., shelter entrances)
    if (!isValidTile(endX, endY, canUsePaths, true)) {
        return { id, entityId, path: [], success: false };
    }

    // A* implementation
    const openSet: AStarNode[] = [{ x: startX, y: startY, g: 0, h: 0, f: 0, parent: null }];
    const closedSet = new Set<string>();
    const getKey = (x: number, y: number) => `${x},${y}`;

    const maxIterations = 1000;
    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
        iterations++;

        // Get node with lowest f score
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift()!;

        // Reached destination
        if (current.x === endX && current.y === endY) {
            const path = reconstructPath(current);
            return { id, entityId, path, success: true };
        }

        closedSet.add(getKey(current.x, current.y));

        // Check neighbors
        const neighbors: GridPos[] = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 },
        ];

        for (const neighbor of neighbors) {
            const neighborKey = getKey(neighbor.x, neighbor.y);
            if (closedSet.has(neighborKey)) continue;

            // Check if we can move to this tile (allow destination even if blocked)
            const isDestTile = neighbor.x === endX && neighbor.y === endY;
            if (!isValidTile(neighbor.x, neighbor.y, canUsePaths, isDestTile)) continue;

            // Check if movement is blocked by fence
            if (isMovementBlocked(current.x, current.y, neighbor.x, neighbor.y, canPassGates)) {
                continue;
            }

            // Calculate cost
            const tile = getTile(neighbor.x, neighbor.y);
            let moveCost = 1;
            if (tile?.path && canUsePaths) {
                moveCost = 0.5; // Paths are cheaper for entities that use them
            }

            const g = current.g + moveCost;
            const h = Math.abs(neighbor.x - endX) + Math.abs(neighbor.y - endY);
            const f = g + h;

            // Check if already in open set with better score
            const existingIndex = openSet.findIndex(n => n.x === neighbor.x && n.y === neighbor.y);
            if (existingIndex !== -1) {
                if (g < openSet[existingIndex].g) {
                    openSet[existingIndex].g = g;
                    openSet[existingIndex].f = f;
                    openSet[existingIndex].parent = current;
                }
            } else {
                openSet.push({ x: neighbor.x, y: neighbor.y, g, h, f, parent: current });
            }
        }
    }

    // No path found
    return { id, entityId, path: [], success: false };
}

interface AStarNode {
    x: number;
    y: number;
    g: number;
    h: number;
    f: number;
    parent: AStarNode | null;
}

function reconstructPath(node: AStarNode): GridPos[] {
    const path: GridPos[] = [];
    let current: AStarNode | null = node;

    while (current?.parent) {
        path.unshift({ x: current.x, y: current.y });
        current = current.parent;
    }

    return path;
}

function getTile(x: number, y: number): TileData | null {
    if (!worldData) return null;
    if (x < 0 || x >= worldData.width || y < 0 || y >= worldData.height) return null;
    return worldData.tiles[y]?.[x] ?? null;
}

function isValidTile(x: number, y: number, canUsePaths: boolean, isDestination: boolean = false): boolean {
    const tile = getTile(x, y);
    if (!tile) return false;
    if (tile.terrain === 'water') return false;

    // Animals can't walk on paths
    if (!canUsePaths && tile.path) return false;

    // Check for blocked tiles (shelters/placeables)
    // Allow blocked tiles as destination (e.g., shelter entrances) but not for passing through
    if (!isDestination && blockedTileSet.has(`${x},${y}`)) return false;

    return true;
}

function isMovementBlocked(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    canPassGates: boolean
): boolean {
    const fromTile = getTile(fromX, fromY);
    const toTile = getTile(toX, toY);
    if (!fromTile) return true;

    const dx = toX - fromX;
    const dy = toY - fromY;

    // Edge mappings based on movement direction (matches World.ts convention)
    // These edges are on the boundary between fromTile and toTile
    let fromEdge: 'north' | 'south' | 'east' | 'west' | null = null;
    let toEdge: 'north' | 'south' | 'east' | 'west' | null = null;

    if (dx === 1) {
        // Moving east (+X): crosses south edge of from-tile / north edge of to-tile
        fromEdge = 'south';
        toEdge = 'north';
    } else if (dx === -1) {
        // Moving west (-X): crosses north edge of from-tile / south edge of to-tile
        fromEdge = 'north';
        toEdge = 'south';
    } else if (dy === 1) {
        // Moving south (+Y): crosses west edge of from-tile / east edge of to-tile
        fromEdge = 'west';
        toEdge = 'east';
    } else if (dy === -1) {
        // Moving north (-Y): crosses east edge of from-tile / west edge of to-tile
        fromEdge = 'east';
        toEdge = 'west';
    }

    if (!fromEdge || !toEdge) return false;

    // Check for fence on either side of the boundary
    const fenceFrom = fromTile.fences[fromEdge];
    const fenceTo = toTile?.fences[toEdge];

    if (!fenceFrom && !fenceTo) return false;

    // Check if this is a gate (could be registered on either side)
    if (canPassGates) {
        const isGate = (fenceFrom && isGateAt(fromX, fromY, fromEdge)) ||
                       (fenceTo && isGateAt(toX, toY, toEdge));
        if (isGate) {
            return false; // Gates don't block staff
        }
    }

    // Check if fences have failed (animals can pass through)
    const fromFailed = fenceFrom && isFenceFailedAt(fromX, fromY, fromEdge);
    const toFailed = fenceTo && isFenceFailedAt(toX, toY, toEdge);

    // If both sides are either null or failed, movement is not blocked
    if ((!fenceFrom || fromFailed) && (!fenceTo || toFailed)) {
        return false;
    }

    // Regular fences always block
    return true;
}

/**
 * Check if there is a gate at the specified tile edge
 */
function isGateAt(tileX: number, tileY: number, edge: EdgeDirection): boolean {
    if (!worldData || !worldData.gates) return false;

    return worldData.gates.some(
        gate => gate.tileX === tileX && gate.tileY === tileY && gate.edge === edge
    );
}

/**
 * Check if a fence at the specified tile edge has failed
 */
function isFenceFailedAt(tileX: number, tileY: number, edge: EdgeDirection): boolean {
    if (!worldData || !worldData.failedFences) return false;

    return worldData.failedFences.some(
        fence => fence.tileX === tileX && fence.tileY === tileY && fence.edge === edge
    );
}

export {};
