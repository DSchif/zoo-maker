import { Container, Graphics, RenderTexture, Sprite, Assets, Texture, Text, TextStyle } from 'pixi.js';
import type { Game } from '../core/Game';
import type { Chunk, TileData, TileEdge, EdgeDirection, FenceCondition } from '../core/types';
import { PLACEABLE_CONFIGS } from '../core/types';
import { Placeable } from '../entities/Placeable';

// Isometric constants
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

// Terrain colors
const TERRAIN_COLORS: Record<string, { base: number; highlight: number; shadow: number }> = {
    grass: { base: 0x4a7c23, highlight: 0x5a9c33, shadow: 0x3a6c13 },
    prairie: { base: 0x7cb342, highlight: 0x8cc352, shadow: 0x6ca332 },
    savanna_grass: { base: 0xc4a747, highlight: 0xd4b757, shadow: 0xb49737 },
    sand: { base: 0xd4a843, highlight: 0xe4b853, shadow: 0xc49833 },
    dirt: { base: 0x8b7355, highlight: 0x9b8365, shadow: 0x7b6345 },
    rainforest_floor: { base: 0x3d5c28, highlight: 0x4d6c38, shadow: 0x2d4c18 },
    brown_stone: { base: 0x7a6352, highlight: 0x8a7362, shadow: 0x6a5342 },
    gray_stone: { base: 0x707070, highlight: 0x858585, shadow: 0x5a5a5a },
    gravel: { base: 0x9a9a9a, highlight: 0xaaaaaa, shadow: 0x8a8a8a },
    snow: { base: 0xe8e8f0, highlight: 0xffffff, shadow: 0xd0d0e0 },
    fresh_water: { base: 0x4a90d9, highlight: 0x5aa0e9, shadow: 0x3a80c9 },
    salt_water: { base: 0x2a6090, highlight: 0x3a70a0, shadow: 0x1a5080 },
    deciduous_floor: { base: 0x6b5a3a, highlight: 0x7b6a4a, shadow: 0x5b4a2a },
    coniferous_floor: { base: 0x4a4535, highlight: 0x5a5545, shadow: 0x3a3525 },
};

// Path colors
const PATH_COLORS: Record<string, number> = {
    dirt: 0x8b6914,
    stone: 0x888888,
    brick: 0xa85432,
    cobble: 0x555555,
};

/**
 * Renderer handles all PixiJS rendering with optimized layer-based approach.
 *
 * Layers (bottom to top):
 * 1. Terrain (baked to RenderTexture per chunk)
 * 2. Paths (baked with terrain)
 * 3. Fences
 * 4. Entities (animals, guests, staff, foliage)
 * 5. Overlay (selection, placement preview)
 */
export class Renderer {
    private game: Game;

    // Main containers for layer ordering
    private worldContainer: Container;
    private terrainContainer: Container;
    private fenceContainer: Container;
    private entityContainer: Container;
    private overlayContainer: Container;

    // Chunk render textures (baked terrain + paths)
    private chunkTextures: Map<string, { texture: RenderTexture; sprite: Sprite }> = new Map();

    // Graphics for drawing (reused each frame to prevent memory leaks)
    private overlayGraphics: Graphics;
    private fenceGraphics: Graphics;
    private entityGraphics: Graphics;

    // Sprite textures
    private textures: Map<string, Texture> = new Map();
    private texturesLoaded: boolean = false;

    // Reusable sprite pool for entities
    private spritePool: Sprite[] = [];
    private activeSpriteCount: number = 0;

    // Graphics pool for foliage/food/fences (allows individual z-sorting)
    private graphicsPool: Graphics[] = [];
    private activeGraphicsCount: number = 0;

    // Fence graphics pool (separate for performance)
    private fenceGraphicsPool: Graphics[] = [];
    private activeFenceGraphicsCount: number = 0;

    // Debug grid overlay
    public showTileGrid: boolean = false;
    private gridContainer: Container;
    private gridGraphics: Graphics;
    private gridTextPool: Text[] = [];
    private activeGridTextCount: number = 0;
    private gridTextStyle: TextStyle;

    // Task emoji indicators above staff
    private taskEmojiPool: Text[] = [];
    private activeTaskEmojiCount: number = 0;
    private taskEmojiStyle: TextStyle;

    constructor(game: Game) {
        this.game = game;

        // Create layer containers
        this.worldContainer = new Container();
        this.terrainContainer = new Container();
        this.fenceContainer = new Container();
        this.entityContainer = new Container();
        this.overlayContainer = new Container();

        // Enable zIndex sorting for entity container (depth sorting)
        this.entityContainer.sortableChildren = true;

        // Layer ordering
        this.worldContainer.addChild(this.terrainContainer);
        this.worldContainer.addChild(this.fenceContainer);
        this.worldContainer.addChild(this.entityContainer);
        this.worldContainer.addChild(this.overlayContainer);

        // Add to stage
        this.game.app.stage.addChild(this.worldContainer);

        // Create reusable graphics objects (prevents memory leaks)
        this.fenceGraphics = new Graphics();
        this.fenceContainer.addChild(this.fenceGraphics);

        this.entityGraphics = new Graphics();
        this.entityContainer.addChild(this.entityGraphics);

        this.overlayGraphics = new Graphics();
        this.overlayContainer.addChild(this.overlayGraphics);

        // Create debug grid container (on top of overlay)
        this.gridContainer = new Container();
        this.gridGraphics = new Graphics();
        this.gridContainer.addChild(this.gridGraphics);
        this.worldContainer.addChild(this.gridContainer);

        // Create text style for grid coordinates
        this.gridTextStyle = new TextStyle({
            fontFamily: 'monospace',
            fontSize: 10,
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 2 },
            align: 'center',
        });

        this.taskEmojiStyle = new TextStyle({
            fontFamily: 'Arial, sans-serif',
            fontSize: 16,
            align: 'center',
        });

        // Load sprite assets
        this.loadAssets();
    }

    /**
     * Load sprite assets
     */
    private async loadAssets(): Promise<void> {
        const directions = ['ne', 'se', 'sw', 'nw'];

        const spriteList = [
            // 4-directional lion sprites
            ...directions.map(dir => ({ name: `lion_${dir}`, url: `/sprites/lion_${dir}.svg` })),
            ...directions.map(dir => ({ name: `lioness_${dir}`, url: `/sprites/lioness_${dir}.svg` })),
            // Other sprites (non-directional for now)
            { name: 'bison', url: '/sprites/bison.svg' },
            { name: 'guest', url: '/sprites/guest.svg' },
            { name: 'zookeeper', url: '/sprites/zookeeper.svg' },
            { name: 'maintenance_worker', url: '/sprites/maintenance_worker.svg' },
            { name: 'entrance_gate', url: '/sprites/entrance_gate.svg' },
            { name: 'entrance_gate_rot1', url: '/sprites/entrance_gate_rot1.svg' },
        ];

        try {
            for (const sprite of spriteList) {
                const texture = await Assets.load(sprite.url);
                this.textures.set(sprite.name, texture);
            }
            this.texturesLoaded = true;
            console.log('Sprites loaded successfully');
        } catch (error) {
            console.warn('Failed to load sprites, falling back to graphics:', error);
        }
    }

    /**
     * Main render method (called every frame)
     */
    render(): void {
        const camera = this.game.camera;

        // Update world container transform based on camera
        this.worldContainer.x = camera.viewportWidth / 2 - camera.x * camera.zoom;
        this.worldContainer.y = camera.viewportHeight / 2 - camera.y * camera.zoom;
        this.worldContainer.scale.set(camera.zoom);

        // Get visible bounds
        const bounds = camera.getVisibleBounds();

        // Reset chunk visibility
        this.game.world.resetVisibility();

        // Get visible chunks and render/update them
        const visibleChunks = this.game.world.getVisibleChunks(
            bounds.minX, bounds.minY, bounds.maxX, bounds.maxY
        );

        // Render dirty chunks
        for (const chunk of visibleChunks) {
            if (chunk.dirty) {
                this.renderChunk(chunk);
            }
        }

        // Hide non-visible chunk sprites
        for (const [key, { sprite }] of this.chunkTextures) {
            const [cx, cy] = key.split(',').map(Number);
            const chunk = this.game.world.getChunk(cx, cy);
            sprite.visible = chunk?.visible ?? false;
        }

        // Render fences (could also be baked per chunk)
        this.renderFences(bounds);

        // Render entities (depth-sorted)
        this.renderEntities();

        // Render overlay (selection, preview)
        this.renderOverlay();

        // Render debug grid if enabled
        this.renderTileGrid(bounds);
    }

    /**
     * Render a chunk to a RenderTexture (bakes terrain + paths)
     */
    private renderChunk(chunk: Chunk): void {
        const key = `${chunk.x},${chunk.y},${this.game.camera.rotation}`;
        const chunkSize = this.game.world.chunkSize;

        // Calculate offset for this chunk's local coordinate system
        const baseWorldX = chunk.x * chunkSize;
        const baseWorldY = chunk.y * chunkSize;

        // Calculate the actual screen-space bounding box for this chunk at the current rotation
        // by checking all 4 corner tiles
        const corners = [
            this.game.camera.tileToScreen(baseWorldX, baseWorldY),
            this.game.camera.tileToScreen(baseWorldX + chunkSize - 1, baseWorldY),
            this.game.camera.tileToScreen(baseWorldX, baseWorldY + chunkSize - 1),
            this.game.camera.tileToScreen(baseWorldX + chunkSize - 1, baseWorldY + chunkSize - 1),
        ];

        // Find min/max bounds with padding for tile size
        // Use extra padding to prevent gaps at chunk boundaries due to zoom rounding
        const padding = 4;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const corner of corners) {
            minX = Math.min(minX, corner.x - TILE_WIDTH / 2 - padding);
            maxX = Math.max(maxX, corner.x + TILE_WIDTH / 2 + padding);
            minY = Math.min(minY, corner.y - TILE_HEIGHT / 2 - padding);
            maxY = Math.max(maxY, corner.y + TILE_HEIGHT + padding);
        }

        // Floor minX/minY to avoid subpixel positioning issues at different zoom levels
        minX = Math.floor(minX);
        minY = Math.floor(minY);
        const chunkPixelWidth = Math.ceil(maxX - minX) + TILE_WIDTH;
        const chunkPixelHeight = Math.ceil(maxY - minY) + TILE_HEIGHT;

        // Create or get the render texture (keyed by rotation too)
        let cached = this.chunkTextures.get(key);
        if (!cached) {
            // Clean up old rotation's texture if it exists
            for (let r = 0; r < 4; r++) {
                const oldKey = `${chunk.x},${chunk.y},${r}`;
                const old = this.chunkTextures.get(oldKey);
                if (old && oldKey !== key) {
                    old.sprite.destroy();
                    old.texture.destroy();
                    this.chunkTextures.delete(oldKey);
                }
            }

            const texture = RenderTexture.create({
                width: chunkPixelWidth,
                height: chunkPixelHeight,
            });
            const sprite = new Sprite(texture);
            this.terrainContainer.addChild(sprite);
            cached = { texture, sprite };
            this.chunkTextures.set(key, cached);
        }

        // Create graphics for drawing
        const graphics = new Graphics();

        // Draw each tile
        for (let ly = 0; ly < chunkSize; ly++) {
            for (let lx = 0; lx < chunkSize; lx++) {
                const tile = chunk.tiles[ly]?.[lx];
                if (!tile) continue;

                const worldX = baseWorldX + lx;
                const worldY = baseWorldY + ly;

                // Convert to screen position relative to chunk's min bounds
                const screenPos = this.game.camera.tileToScreen(worldX, worldY);
                const localX = screenPos.x - minX;
                const localY = screenPos.y - minY;

                this.drawTile(graphics, localX, localY, tile, worldX, worldY);
            }
        }

        // Render to texture
        this.game.app.renderer.render({
            container: graphics,
            target: cached.texture,
            clear: true,
        });

        // Position the sprite at the min bounds
        cached.sprite.x = minX;
        cached.sprite.y = minY;

        // Clean up
        graphics.destroy();

        // Mark chunk as clean
        this.game.world.markChunkClean(chunk);
    }

    /**
     * Draw a single tile (terrain + path) with blending to neighbors
     */
    private drawTile(graphics: Graphics, x: number, y: number, tile: TileData, worldX: number, worldY: number): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Add overlap to prevent gaps between tiles at various zoom levels
        const overlap = 1.5;

        const colors = TERRAIN_COLORS[tile.terrain] || TERRAIN_COLORS.grass;

        // Draw isometric diamond with slight overlap
        graphics.poly([
            { x: x, y: y - hh - overlap },           // Top
            { x: x + hw + overlap, y: y },           // Right
            { x: x, y: y + hh + overlap },           // Bottom
            { x: x - hw - overlap, y: y },           // Left
        ]);
        graphics.fill(colors.base);

        // Draw terrain blend overlays from neighboring tiles
        this.drawTerrainBlends(graphics, x, y, tile.terrain, worldX, worldY);

        // Draw terrain details (grass blades, pebbles, etc.)
        this.drawTerrainDetails(graphics, x, y, tile.terrain, worldX, worldY);

        // Draw path if present (fills entire tile with overlap to prevent gaps)
        if (tile.path) {
            const pathColor = PATH_COLORS[tile.path] || PATH_COLORS.dirt;

            graphics.poly([
                { x: x, y: y - hh - overlap },           // Top
                { x: x + hw + overlap, y: y },           // Right
                { x: x, y: y + hh + overlap },           // Bottom
                { x: x - hw - overlap, y: y },           // Left
            ]);
            graphics.fill(pathColor);

            // Draw path details (stones, bricks, etc.)
            this.drawPathDetails(graphics, x, y, tile.path, worldX, worldY);
        }
    }

    /**
     * Draw terrain blend overlays from neighboring tiles
     * Creates smooth transitions between different terrain types
     */
    private drawTerrainBlends(graphics: Graphics, x: number, y: number, currentTerrain: string, worldX: number, worldY: number): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;
        const overlap = 1.5; // Match the base tile overlap

        // Check each neighbor and draw blend if terrain differs
        // In isometric: +X goes bottom-right, +Y goes bottom-left
        // So neighbor positions map to edges as:
        const neighbors: Array<{
            dx: number;
            dy: number;
            edge: EdgeDirection;
            oppositeEdge: EdgeDirection;
        }> = [
            { dx: 0, dy: -1, edge: 'east', oppositeEdge: 'west' },    // y-1 neighbor shares east/west edge
            { dx: 1, dy: 0, edge: 'south', oppositeEdge: 'north' },   // x+1 neighbor shares south/north edge
            { dx: 0, dy: 1, edge: 'west', oppositeEdge: 'east' },     // y+1 neighbor shares west/east edge
            { dx: -1, dy: 0, edge: 'north', oppositeEdge: 'south' },  // x-1 neighbor shares north/south edge
        ];

        // Band width as perpendicular offset (0.12 keeps inner points inside tile boundary)
        const bw = 0.12;

        for (const neighbor of neighbors) {
            const neighborTile = this.game.world.getTile(worldX + neighbor.dx, worldY + neighbor.dy);
            if (!neighborTile || neighborTile.terrain === currentTerrain) continue;

            // Don't blend if there's a fence on either side of this edge - keep hard line
            const fenceOnThis = this.game.world.getFence(worldX, worldY, neighbor.edge);
            const fenceOnNeighbor = this.game.world.getFence(worldX + neighbor.dx, worldY + neighbor.dy, neighbor.oppositeEdge);
            if (fenceOnThis || fenceOnNeighbor) continue;

            const neighborColors = TERRAIN_COLORS[neighborTile.terrain] || TERRAIN_COLORS.grass;

            // Convert world edge to screen edge based on camera rotation
            const screenEdge = this.getScreenEdge(neighbor.edge);

            // Draw parallelogram band along the edge (constant width)
            // Outer points include overlap to match base tile anti-aliasing
            switch (screenEdge) {
                case 'north':
                    // Top-left edge
                    graphics.poly([
                        { x: x - hw - overlap, y: y },                // Outer left (with overlap)
                        { x: x, y: y - hh - overlap },                // Outer top (with overlap)
                        { x: x + bw * hw, y: y - (1 - bw) * hh },     // Inner top
                        { x: x - (1 - bw) * hw, y: y + bw * hh },     // Inner left
                    ]);
                    graphics.fill({ color: neighborColors.base, alpha: 0.4 });
                    break;

                case 'east':
                    // Top-right edge
                    graphics.poly([
                        { x: x, y: y - hh - overlap },                // Outer top (with overlap)
                        { x: x + hw + overlap, y: y },                // Outer right (with overlap)
                        { x: x + (1 - bw) * hw, y: y + bw * hh },     // Inner right
                        { x: x - bw * hw, y: y - (1 - bw) * hh },     // Inner top
                    ]);
                    graphics.fill({ color: neighborColors.base, alpha: 0.4 });
                    break;

                case 'south':
                    // Bottom-right edge
                    graphics.poly([
                        { x: x + hw + overlap, y: y },                // Outer right (with overlap)
                        { x: x, y: y + hh + overlap },                // Outer bottom (with overlap)
                        { x: x - bw * hw, y: y + (1 - bw) * hh },     // Inner bottom
                        { x: x + (1 - bw) * hw, y: y - bw * hh },     // Inner right
                    ]);
                    graphics.fill({ color: neighborColors.base, alpha: 0.4 });
                    break;

                case 'west':
                    // Bottom-left edge
                    graphics.poly([
                        { x: x, y: y + hh + overlap },                // Outer bottom (with overlap)
                        { x: x - hw - overlap, y: y },                // Outer left (with overlap)
                        { x: x - (1 - bw) * hw, y: y - bw * hh },     // Inner left
                        { x: x + bw * hw, y: y + (1 - bw) * hh },     // Inner bottom
                    ]);
                    graphics.fill({ color: neighborColors.base, alpha: 0.4 });
                    break;
            }
        }

        // Also blend corners where diagonal neighbors differ
        this.drawCornerBlends(graphics, x, y, currentTerrain, worldX, worldY);
    }

    /**
     * Draw corner blends for diagonal neighbors
     */
    private drawCornerBlends(graphics: Graphics, x: number, y: number, currentTerrain: string, worldX: number, worldY: number): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;
        const cornerSize = 0.12; // Size of corner blend (matches edge band width)

        // Diagonal neighbors and their corner positions
        // In isometric: (-1,-1) is top, (1,-1) is right, (1,1) is bottom, (-1,1) is left
        // Each corner is bordered by two edges
        const corners: Array<{
            dx: number;
            dy: number;
            corner: string;
            edges: [EdgeDirection, EdgeDirection];
        }> = [
            { dx: -1, dy: -1, corner: 'top', edges: ['north', 'east'] },
            { dx: 1, dy: -1, corner: 'right', edges: ['east', 'south'] },
            { dx: 1, dy: 1, corner: 'bottom', edges: ['south', 'west'] },
            { dx: -1, dy: 1, corner: 'left', edges: ['west', 'north'] },
        ];

        for (const corner of corners) {
            const neighborTile = this.game.world.getTile(worldX + corner.dx, worldY + corner.dy);
            if (!neighborTile || neighborTile.terrain === currentTerrain) continue;

            // Don't blend corner if any fence blocks path to diagonal neighbor
            // Map edges to their adjacent tile offsets
            const edgeToOffset: Record<EdgeDirection, { dx: number; dy: number; opposite: EdgeDirection }> = {
                'north': { dx: -1, dy: 0, opposite: 'south' },
                'south': { dx: 1, dy: 0, opposite: 'north' },
                'east': { dx: 0, dy: -1, opposite: 'west' },
                'west': { dx: 0, dy: 1, opposite: 'east' },
            };
            const edgeAdj1 = edgeToOffset[corner.edges[0]];
            const edgeAdj2 = edgeToOffset[corner.edges[1]];

            // Check fences on current tile's two edges at this corner
            const fenceCurr1 = this.game.world.getFence(worldX, worldY, corner.edges[0]);
            const fenceCurr2 = this.game.world.getFence(worldX, worldY, corner.edges[1]);
            // Check fences on adjacent tiles' edges (other side of current's edges)
            const fenceAdj1 = this.game.world.getFence(worldX + edgeAdj1.dx, worldY + edgeAdj1.dy, edgeAdj1.opposite);
            const fenceAdj2 = this.game.world.getFence(worldX + edgeAdj2.dx, worldY + edgeAdj2.dy, edgeAdj2.opposite);

            // Also check fences between diagonal and adjacent tiles (fence corner case)
            const diagX = worldX + corner.dx;
            const diagY = worldY + corner.dy;
            const xAdjX = worldX + corner.dx;
            const xAdjY = worldY;
            const yAdjX = worldX;
            const yAdjY = worldY + corner.dy;
            // Fence between diagonal and x-adjacent (they differ in Y, movement is -corner.dy)
            // -corner.dy > 0 means +Y movement = west/east edges
            const fenceDiagToXAdj1 = this.game.world.getFence(diagX, diagY, corner.dy < 0 ? 'west' : 'east');
            const fenceDiagToXAdj2 = this.game.world.getFence(xAdjX, xAdjY, corner.dy < 0 ? 'east' : 'west');
            // Fence between diagonal and y-adjacent (they differ in X, movement is -corner.dx)
            // -corner.dx > 0 means +X movement = south/north edges
            const fenceDiagToYAdj1 = this.game.world.getFence(diagX, diagY, corner.dx < 0 ? 'south' : 'north');
            const fenceDiagToYAdj2 = this.game.world.getFence(yAdjX, yAdjY, corner.dx < 0 ? 'north' : 'south');

            if (fenceCurr1 || fenceCurr2 || fenceAdj1 || fenceAdj2 ||
                fenceDiagToXAdj1 || fenceDiagToXAdj2 || fenceDiagToYAdj1 || fenceDiagToYAdj2) continue;

            // Check if adjacent edges already have this terrain (to avoid double-blending)
            const adjTile1 = this.game.world.getTile(worldX + corner.dx, worldY);
            const adjTile2 = this.game.world.getTile(worldX, worldY + corner.dy);
            if ((adjTile1 && adjTile1.terrain === neighborTile.terrain) ||
                (adjTile2 && adjTile2.terrain === neighborTile.terrain)) continue;

            const neighborColors = TERRAIN_COLORS[neighborTile.terrain] || TERRAIN_COLORS.grass;

            // Convert world corner to screen corner based on camera rotation
            const screenCorner = this.getScreenCorner(corner.corner as 'top' | 'right' | 'bottom' | 'left');

            // Draw small triangle at the corner
            switch (screenCorner) {
                case 'left':
                    graphics.poly([
                        { x: x - hw, y: y },
                        { x: x - hw + hw * cornerSize, y: y - hh * cornerSize },
                        { x: x - hw + hw * cornerSize, y: y + hh * cornerSize },
                    ]);
                    graphics.fill({ color: neighborColors.base, alpha: 0.35 });
                    break;

                case 'top':
                    graphics.poly([
                        { x: x, y: y - hh },
                        { x: x - hw * cornerSize, y: y - hh + hh * cornerSize },
                        { x: x + hw * cornerSize, y: y - hh + hh * cornerSize },
                    ]);
                    graphics.fill({ color: neighborColors.base, alpha: 0.35 });
                    break;

                case 'right':
                    graphics.poly([
                        { x: x + hw, y: y },
                        { x: x + hw - hw * cornerSize, y: y - hh * cornerSize },
                        { x: x + hw - hw * cornerSize, y: y + hh * cornerSize },
                    ]);
                    graphics.fill({ color: neighborColors.base, alpha: 0.35 });
                    break;

                case 'bottom':
                    graphics.poly([
                        { x: x, y: y + hh },
                        { x: x - hw * cornerSize, y: y + hh - hh * cornerSize },
                        { x: x + hw * cornerSize, y: y + hh - hh * cornerSize },
                    ]);
                    graphics.fill({ color: neighborColors.base, alpha: 0.35 });
                    break;
            }
        }
    }

    /**
     * Draw terrain details like grass blades, pebbles, ripples
     * Uses seeded random based on tile coordinates for consistency
     */
    private drawTerrainDetails(graphics: Graphics, x: number, y: number, terrain: string, worldX: number, worldY: number): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Seeded random based on tile position for consistent details
        const seed = worldX * 12345 + worldY * 67890;
        const seededRandom = (offset: number) => {
            const val = Math.sin(seed + offset) * 43758.5453;
            return val - Math.floor(val);
        };

        switch (terrain) {
            case 'grass': {
                // Draw small grass tufts
                const numTufts = 4 + Math.floor(seededRandom(0) * 4);
                for (let i = 0; i < numTufts; i++) {
                    // Random position within tile (isometric coordinates)
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.4;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.4;
                    const px = x + tx;
                    const py = y + ty;

                    // Small grass blade
                    const height = 3 + seededRandom(i + 100) * 4;
                    const shade = seededRandom(i + 200) > 0.5 ? 0x5a9c33 : 0x3a6c13;
                    graphics.moveTo(px - 1, py);
                    graphics.lineTo(px, py - height);
                    graphics.lineTo(px + 1, py);
                    graphics.fill({ color: shade, alpha: 0.7 });
                }
                break;
            }

            case 'dirt': {
                // Draw small pebbles and color variations
                const numPebbles = 3 + Math.floor(seededRandom(0) * 4);
                for (let i = 0; i < numPebbles; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.3;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.3;
                    const px = x + tx;
                    const py = y + ty;

                    const size = 1 + seededRandom(i + 100) * 2;
                    const shade = seededRandom(i + 200) > 0.5 ? 0x6b5335 : 0x9b8365;
                    graphics.circle(px, py, size);
                    graphics.fill({ color: shade, alpha: 0.6 });
                }
                break;
            }

            case 'sand': {
                // Draw subtle ripple lines
                const numRipples = 2 + Math.floor(seededRandom(0) * 2);
                for (let i = 0; i < numRipples; i++) {
                    const offsetY = (seededRandom(i) - 0.5) * hh * 0.8;
                    const rippleY = y + offsetY;
                    const width = hw * 0.6;

                    graphics.moveTo(x - width, rippleY);
                    graphics.quadraticCurveTo(x, rippleY - 2, x + width, rippleY);
                    graphics.stroke({ color: 0xe4b853, width: 1, alpha: 0.4 });
                }
                // Small sand grains
                for (let i = 0; i < 5; i++) {
                    const tx = (seededRandom(i * 2 + 10) - 0.5) * hw * 1.2;
                    const ty = (seededRandom(i * 2 + 11) - 0.5) * hh * 1.2;
                    graphics.circle(x + tx, y + ty, 0.8);
                    graphics.fill({ color: 0xc49833, alpha: 0.5 });
                }
                break;
            }

            case 'fresh_water': {
                // Draw wave ripples
                const time = Date.now() * 0.001;
                const waveOffset = Math.sin(time + worldX * 0.5 + worldY * 0.3) * 2;

                // Highlight shimmer
                graphics.ellipse(x + waveOffset, y - 2 + waveOffset * 0.5, hw * 0.3, hh * 0.15);
                graphics.fill({ color: 0x7ab8ff, alpha: 0.3 });

                // Secondary ripple
                graphics.ellipse(x - hw * 0.2, y + hh * 0.2, hw * 0.2, hh * 0.1);
                graphics.fill({ color: 0x3a80c9, alpha: 0.3 });
                break;
            }

            case 'salt_water': {
                // Draw wave ripples with foam
                const time = Date.now() * 0.001;
                const waveOffset = Math.sin(time + worldX * 0.4 + worldY * 0.2) * 2;

                // Darker water shimmer
                graphics.ellipse(x + waveOffset, y - 2 + waveOffset * 0.5, hw * 0.25, hh * 0.12);
                graphics.fill({ color: 0x4a80b0, alpha: 0.3 });

                // Foam/whitecap highlights
                if (seededRandom(0) > 0.6) {
                    graphics.ellipse(x - hw * 0.15, y + hh * 0.15, hw * 0.15, hh * 0.08);
                    graphics.fill({ color: 0xffffff, alpha: 0.2 });
                }
                break;
            }

            case 'savanna_grass': {
                // Draw dried grass tufts and small stones
                const numTufts = 3 + Math.floor(seededRandom(0) * 3);
                for (let i = 0; i < numTufts; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.3;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.3;
                    const px = x + tx;
                    const py = y + ty;

                    // Dried grass tuft
                    const height = 2 + seededRandom(i + 100) * 3;
                    const shade = seededRandom(i + 200) > 0.5 ? 0xd4b757 : 0xa48727;
                    graphics.moveTo(px - 1, py);
                    graphics.lineTo(px - 1, py - height);
                    graphics.lineTo(px + 1, py - height * 0.8);
                    graphics.lineTo(px + 1, py);
                    graphics.fill({ color: shade, alpha: 0.6 });
                }
                // Small stones
                for (let i = 0; i < 2; i++) {
                    const tx = (seededRandom(i + 50) - 0.5) * hw;
                    const ty = (seededRandom(i + 51) - 0.5) * hh;
                    graphics.circle(x + tx, y + ty, 1.5);
                    graphics.fill({ color: 0x8b8b7a, alpha: 0.5 });
                }
                break;
            }

            case 'prairie': {
                // Draw mixed grass blades
                const numBlades = 5 + Math.floor(seededRandom(0) * 4);
                for (let i = 0; i < numBlades; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.4;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.4;
                    const px = x + tx;
                    const py = y + ty;

                    const height = 3 + seededRandom(i + 100) * 5;
                    // Mix of green and golden grass
                    const shade = seededRandom(i + 200) > 0.6 ? 0x8cc352 : 0xb4a352;
                    graphics.moveTo(px, py);
                    graphics.lineTo(px + (seededRandom(i + 300) - 0.5) * 2, py - height);
                    graphics.stroke({ color: shade, width: 1, alpha: 0.7 });
                }
                break;
            }

            case 'rainforest_floor': {
                // Dark leaf litter with moisture
                const numLeaves = 4 + Math.floor(seededRandom(0) * 3);
                for (let i = 0; i < numLeaves; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.3;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.3;
                    const px = x + tx;
                    const py = y + ty;

                    // Fallen leaves
                    const size = 2 + seededRandom(i + 100) * 2;
                    const shade = seededRandom(i + 200) > 0.5 ? 0x2d4c18 : 0x4d6c38;
                    graphics.ellipse(px, py, size, size * 0.6);
                    graphics.fill({ color: shade, alpha: 0.5 });
                }
                // Moisture spots
                for (let i = 0; i < 2; i++) {
                    const tx = (seededRandom(i + 50) - 0.5) * hw * 0.8;
                    const ty = (seededRandom(i + 51) - 0.5) * hh * 0.8;
                    graphics.circle(x + tx, y + ty, 3);
                    graphics.fill({ color: 0x1a3a10, alpha: 0.3 });
                }
                break;
            }

            case 'brown_stone': {
                // Rocky texture with cracks
                const numRocks = 2 + Math.floor(seededRandom(0) * 2);
                for (let i = 0; i < numRocks; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.0;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.0;
                    const px = x + tx;
                    const py = y + ty;

                    const shade = seededRandom(i + 200) > 0.5 ? 0x6a5342 : 0x8a7362;
                    graphics.ellipse(px, py, 4 + seededRandom(i) * 3, 2 + seededRandom(i + 1) * 2);
                    graphics.fill({ color: shade, alpha: 0.4 });
                }
                // Crack lines
                if (seededRandom(100) > 0.5) {
                    const cx = (seededRandom(101) - 0.5) * hw * 0.6;
                    graphics.moveTo(x + cx, y - hh * 0.3);
                    graphics.lineTo(x + cx + 3, y + hh * 0.2);
                    graphics.stroke({ color: 0x5a4332, width: 1, alpha: 0.4 });
                }
                break;
            }

            case 'gray_stone': {
                // Gray rocky texture
                const numRocks = 2 + Math.floor(seededRandom(0) * 2);
                for (let i = 0; i < numRocks; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.0;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.0;
                    const px = x + tx;
                    const py = y + ty;

                    const shade = seededRandom(i + 200) > 0.5 ? 0x5a5a5a : 0x858585;
                    graphics.ellipse(px, py, 4 + seededRandom(i) * 3, 2 + seededRandom(i + 1) * 2);
                    graphics.fill({ color: shade, alpha: 0.4 });
                }
                // Crack lines
                if (seededRandom(100) > 0.6) {
                    const cx = (seededRandom(101) - 0.5) * hw * 0.5;
                    graphics.moveTo(x + cx, y - hh * 0.25);
                    graphics.lineTo(x + cx - 2, y + hh * 0.25);
                    graphics.stroke({ color: 0x4a4a4a, width: 1, alpha: 0.4 });
                }
                break;
            }

            case 'gravel': {
                // Small scattered stones
                const numStones = 8 + Math.floor(seededRandom(0) * 5);
                for (let i = 0; i < numStones; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.4;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.4;
                    const px = x + tx;
                    const py = y + ty;

                    const size = 1 + seededRandom(i + 100) * 1.5;
                    const shade = seededRandom(i + 200) > 0.5 ? 0x7a7a7a : 0xbababa;
                    graphics.circle(px, py, size);
                    graphics.fill({ color: shade, alpha: 0.6 });
                }
                break;
            }

            case 'snow': {
                // Sparkle effects and subtle drifts
                const numSparkles = 3 + Math.floor(seededRandom(0) * 3);
                for (let i = 0; i < numSparkles; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.2;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.2;
                    const px = x + tx;
                    const py = y + ty;

                    // Snow sparkle
                    graphics.circle(px, py, 1);
                    graphics.fill({ color: 0xffffff, alpha: 0.7 });
                }
                // Subtle drift shadows
                if (seededRandom(50) > 0.6) {
                    const dx = (seededRandom(51) - 0.5) * hw * 0.8;
                    graphics.ellipse(x + dx, y, hw * 0.3, hh * 0.1);
                    graphics.fill({ color: 0xc0c0d0, alpha: 0.3 });
                }
                break;
            }

            case 'deciduous_floor': {
                // Fallen leaves in autumn colors
                const numLeaves = 5 + Math.floor(seededRandom(0) * 4);
                for (let i = 0; i < numLeaves; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.4;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.4;
                    const px = x + tx;
                    const py = y + ty;

                    // Autumn leaf colors
                    const colorChoice = seededRandom(i + 200);
                    let shade: number;
                    if (colorChoice > 0.66) shade = 0x8b4513; // brown
                    else if (colorChoice > 0.33) shade = 0xd2691e; // orange-brown
                    else shade = 0xcd853f; // tan

                    const size = 2 + seededRandom(i + 100) * 2;
                    graphics.ellipse(px, py, size, size * 0.6);
                    graphics.fill({ color: shade, alpha: 0.5 });
                }
                // Small twigs
                if (seededRandom(80) > 0.7) {
                    const tx = (seededRandom(81) - 0.5) * hw * 0.6;
                    graphics.moveTo(x + tx, y);
                    graphics.lineTo(x + tx + 4, y - 2);
                    graphics.stroke({ color: 0x4a3020, width: 1, alpha: 0.4 });
                }
                break;
            }

            case 'coniferous_floor': {
                // Pine needles and small pinecones
                const numNeedles = 6 + Math.floor(seededRandom(0) * 4);
                for (let i = 0; i < numNeedles; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.3;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.3;
                    const px = x + tx;
                    const py = y + ty;

                    // Pine needle cluster
                    const angle = seededRandom(i + 100) * Math.PI;
                    const len = 3 + seededRandom(i + 101) * 2;
                    graphics.moveTo(px, py);
                    graphics.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len * 0.5);
                    graphics.stroke({ color: 0x3a3525, width: 1, alpha: 0.5 });
                }
                // Small pinecone
                if (seededRandom(90) > 0.75) {
                    const cx = (seededRandom(91) - 0.5) * hw * 0.6;
                    const cy = (seededRandom(92) - 0.5) * hh * 0.6;
                    graphics.ellipse(x + cx, y + cy, 2, 3);
                    graphics.fill({ color: 0x5a4535, alpha: 0.6 });
                }
                break;
            }
        }
    }

    /**
     * Draw path details like stones, bricks, cobblestones
     * Uses seeded random based on tile coordinates for consistency
     */
    private drawPathDetails(graphics: Graphics, x: number, y: number, pathType: string, worldX: number, worldY: number): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Seeded random based on tile position for consistent details
        const seed = worldX * 54321 + worldY * 98765;
        const seededRandom = (offset: number) => {
            const val = Math.sin(seed + offset) * 43758.5453;
            return val - Math.floor(val);
        };

        switch (pathType) {
            case 'dirt': {
                // Worn dirt path with pebbles and footprint impressions
                const numPebbles = 4 + Math.floor(seededRandom(0) * 4);
                for (let i = 0; i < numPebbles; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 1.2;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 1.2;
                    const px = x + tx;
                    const py = y + ty;

                    const size = 1 + seededRandom(i + 100) * 1.5;
                    const shade = seededRandom(i + 200) > 0.5 ? 0x6b4912 : 0x9b7924;
                    graphics.circle(px, py, size);
                    graphics.fill({ color: shade, alpha: 0.5 });
                }
                // Worn center line
                graphics.moveTo(x - hw * 0.5, y);
                graphics.lineTo(x + hw * 0.5, y);
                graphics.stroke({ color: 0x7b5914, width: 3, alpha: 0.3 });
                break;
            }

            case 'stone': {
                // Large stone slabs with gaps
                const gapColor = 0x555555;

                // Draw gaps first (darker lines between slabs)
                // Horizontal gap
                graphics.moveTo(x - hw * 0.8, y);
                graphics.lineTo(x + hw * 0.8, y);
                graphics.stroke({ color: gapColor, width: 2, alpha: 0.6 });
                // Vertical gap (in isometric, goes diagonally)
                graphics.moveTo(x, y - hh * 0.7);
                graphics.lineTo(x, y + hh * 0.7);
                graphics.stroke({ color: gapColor, width: 2, alpha: 0.6 });

                // Add some surface texture/wear
                for (let i = 0; i < 3; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 0.8;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 0.8;
                    graphics.circle(x + tx, y + ty, 1 + seededRandom(i + 50));
                    graphics.fill({ color: 0x666666, alpha: 0.3 });
                }
                break;
            }

            case 'brick': {
                // Brick pattern with mortar lines
                const mortarColor = 0x888070;
                const brickHighlight = 0xb86442;
                const brickShadow = 0x884422;

                // Draw mortar lines in brick pattern
                // Horizontal lines
                for (let i = -1; i <= 1; i++) {
                    const lineY = y + i * hh * 0.4;
                    graphics.moveTo(x - hw * 0.85, lineY + i * 2);
                    graphics.lineTo(x + hw * 0.85, lineY - i * 2);
                    graphics.stroke({ color: mortarColor, width: 1, alpha: 0.7 });
                }
                // Vertical staggered lines (brick offset pattern)
                for (let row = -1; row <= 1; row++) {
                    const rowY = y + row * hh * 0.4;
                    const offset = (row % 2 === 0) ? 0 : hw * 0.3;
                    for (let col = -1; col <= 1; col++) {
                        const lineX = x + col * hw * 0.6 + offset;
                        if (Math.abs(lineX - x) < hw * 0.8) {
                            graphics.moveTo(lineX, rowY - hh * 0.2 + row * 2);
                            graphics.lineTo(lineX, rowY + hh * 0.2 + row * 2);
                            graphics.stroke({ color: mortarColor, width: 1, alpha: 0.6 });
                        }
                    }
                }
                // Add some brick color variation
                for (let i = 0; i < 4; i++) {
                    const tx = (seededRandom(i * 2) - 0.5) * hw * 0.7;
                    const ty = (seededRandom(i * 2 + 1) - 0.5) * hh * 0.7;
                    const shade = seededRandom(i + 100) > 0.5 ? brickHighlight : brickShadow;
                    graphics.rect(x + tx - 4, y + ty - 2, 8, 4);
                    graphics.fill({ color: shade, alpha: 0.25 });
                }
                break;
            }

            case 'cobble': {
                // Irregular cobblestones
                const numStones = 6 + Math.floor(seededRandom(0) * 4);
                const stoneColors = [0x444444, 0x555555, 0x666666, 0x4a4a4a];

                for (let i = 0; i < numStones; i++) {
                    const tx = (seededRandom(i * 3) - 0.5) * hw * 1.3;
                    const ty = (seededRandom(i * 3 + 1) - 0.5) * hh * 1.3;
                    const px = x + tx;
                    const py = y + ty;

                    // Irregular stone shape (slightly elliptical)
                    const sizeX = 3 + seededRandom(i + 100) * 4;
                    const sizeY = 2 + seededRandom(i + 101) * 3;
                    const colorIdx = Math.floor(seededRandom(i + 300) * stoneColors.length);

                    // Draw stone with highlight
                    graphics.ellipse(px, py, sizeX, sizeY);
                    graphics.fill({ color: stoneColors[colorIdx], alpha: 0.8 });

                    // Highlight on top
                    graphics.ellipse(px - 1, py - 1, sizeX * 0.6, sizeY * 0.5);
                    graphics.fill({ color: 0x777777, alpha: 0.3 });
                }

                // Gaps between stones (dark lines)
                for (let i = 0; i < 4; i++) {
                    const startX = x + (seededRandom(i + 400) - 0.5) * hw;
                    const startY = y + (seededRandom(i + 401) - 0.5) * hh;
                    const endX = startX + (seededRandom(i + 402) - 0.5) * 10;
                    const endY = startY + (seededRandom(i + 403) - 0.5) * 6;
                    graphics.moveTo(startX, startY);
                    graphics.lineTo(endX, endY);
                    graphics.stroke({ color: 0x333333, width: 1, alpha: 0.5 });
                }
                break;
            }
        }
    }

    /**
     * Render fences for visible area (depth-sorted with entities)
     */
    private renderFences(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
        // Clear old fence graphics (the shared one is no longer used for main rendering)
        this.fenceGraphics.clear();
        this.fenceGraphics.visible = false;

        // Reset fence graphics pool
        this.resetFenceGraphicsPool();

        // Collect all fence edges with depth values
        const fenceEdges: Array<{
            x: number;
            y: number;
            tileX: number;
            tileY: number;
            edge: 'north' | 'south' | 'east' | 'west';
            fenceType: string;
            isGate: boolean;
            condition: FenceCondition;
            depth: number;
        }> = [];

        for (let y = bounds.minY; y <= bounds.maxY; y++) {
            for (let x = bounds.minX; x <= bounds.maxX; x++) {
                const tile = this.game.world.getTile(x, y);
                if (!tile) continue;

                const screenPos = this.game.camera.tileToScreen(x, y);

                // Collect each fence edge with depth
                for (const edge of ['north', 'south', 'east', 'west'] as const) {
                    const fenceType = tile.fences[edge];
                    if (fenceType) {
                        // Calculate depth using view-space coordinates
                        let depth = this.getViewSpaceDepth(x, y);

                        // Determine which edges are front-facing based on camera rotation
                        // Front edges render after entities, back edges render before
                        const frontEdges = this.getFrontEdges();
                        if (frontEdges.includes(edge)) {
                            depth += 0.5;  // Front edges render after entities on same tile
                        } else {
                            depth -= 0.1;  // Back edges render before entities on same tile
                        }

                        fenceEdges.push({
                            x: screenPos.x,
                            y: screenPos.y,
                            tileX: x,
                            tileY: y,
                            edge,
                            fenceType,
                            isGate: this.game.isGateAt(x, y, edge),
                            condition: this.game.getFenceCondition(x, y, edge),
                            depth,
                        });
                    }
                }
            }
        }

        // Sort by depth and render each fence edge
        fenceEdges.sort((a, b) => a.depth - b.depth);

        for (const fence of fenceEdges) {
            const g = this.getPooledFenceGraphics();
            g.zIndex = fence.depth;

            // Convert world edge to screen edge for proper visual rotation
            const screenEdge = this.getScreenEdge(fence.edge);

            if (fence.isGate) {
                this.drawGateEdge(g, fence.x, fence.y, screenEdge, fence.fenceType);
            } else {
                this.drawFenceEdge(g, fence.x, fence.y, screenEdge, fence.fenceType, fence.condition);
            }
        }
    }

    /**
     * Draw a fence edge with condition-based visuals and detailed textures
     */
    private drawFenceEdge(
        graphics: Graphics,
        x: number,
        y: number,
        edge: 'north' | 'south' | 'east' | 'west',
        fenceType: string,
        condition: FenceCondition
    ): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Seeded random for consistent details
        const edgeIndex = edge === 'north' ? 0 : edge === 'east' ? 1 : edge === 'south' ? 2 : 3;
        const seed = x * 12345 + y * 67890 + edgeIndex * 11111;
        const seededRandom = (offset: number) => {
            const val = Math.sin(seed + offset) * 43758.5453;
            return val - Math.floor(val);
        };

        // Base fence colors
        const baseColors: Record<string, number> = {
            wood: 0x8b4513,
            iron: 0x444444,
            concrete: 0x888888,
        };
        let color = baseColors[fenceType] || baseColors.wood;

        // Modify color based on condition
        if (condition === 'light_damage') {
            color = this.blendColors(color, 0x666666, 0.2);
        } else if (condition === 'damaged') {
            color = this.blendColors(color, 0x884422, 0.35);
        } else if (condition === 'failed') {
            color = this.blendColors(color, 0x553322, 0.5);
        }

        // Edge endpoints
        const edgePoints: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
            north: { x1: x - hw, y1: y, x2: x, y2: y - hh },
            east: { x1: x, y1: y - hh, x2: x + hw, y2: y },
            south: { x1: x + hw, y1: y, x2: x, y2: y + hh },
            west: { x1: x, y1: y + hh, x2: x - hw, y2: y },
        };

        const e = edgePoints[edge];
        const fenceHeight = 15;
        const midX = (e.x1 + e.x2) / 2;
        const midY = (e.y1 + e.y2) / 2;

        const postLean = condition === 'failed' ? 2 : (condition === 'damaged' ? 1 : 0);
        const postHeightMod = condition === 'failed' ? 0.7 : (condition === 'damaged' ? 0.85 : 1);

        // Draw based on fence type
        if (fenceType === 'wood') {
            // Wood posts with grain texture
            const postHeight = fenceHeight * postHeightMod;

            // Left post
            graphics.rect(e.x1 - 2 + postLean, e.y1 - postHeight, 4, postHeight);
            graphics.fill(color);
            // Wood grain on left post
            for (let i = 0; i < 3; i++) {
                const gy = e.y1 - postHeight + 3 + i * 4;
                graphics.moveTo(e.x1 - 1 + postLean, gy);
                graphics.lineTo(e.x1 + 1 + postLean, gy + 2);
                graphics.stroke({ color: 0x6b3503, width: 0.5, alpha: 0.5 });
            }
            // Post cap
            graphics.rect(e.x1 - 3 + postLean, e.y1 - postHeight - 2, 6, 2);
            graphics.fill(this.blendColors(color, 0x000000, 0.15));

            // Right post
            graphics.rect(e.x2 - 2 - postLean, e.y2 - postHeight, 4, postHeight);
            graphics.fill(color);
            // Wood grain on right post
            for (let i = 0; i < 3; i++) {
                const gy = e.y2 - postHeight + 3 + i * 4;
                graphics.moveTo(e.x2 - 1 - postLean, gy);
                graphics.lineTo(e.x2 + 1 - postLean, gy + 2);
                graphics.stroke({ color: 0x6b3503, width: 0.5, alpha: 0.5 });
            }
            // Post cap
            graphics.rect(e.x2 - 3 - postLean, e.y2 - postHeight - 2, 6, 2);
            graphics.fill(this.blendColors(color, 0x000000, 0.15));

            // Knot details (random placement)
            if (seededRandom(100) > 0.6) {
                const knotY = e.y1 - postHeight * 0.5;
                graphics.circle(e.x1 + postLean, knotY, 1.5);
                graphics.fill(0x5a3003);
            }

        } else if (fenceType === 'iron') {
            // Iron posts with pointed finials
            const postHeight = fenceHeight * postHeightMod;

            // Left post
            graphics.rect(e.x1 - 2 + postLean, e.y1 - postHeight, 4, postHeight);
            graphics.fill(color);
            // Finial (pointed top)
            graphics.moveTo(e.x1 - 2 + postLean, e.y1 - postHeight);
            graphics.lineTo(e.x1 + postLean, e.y1 - postHeight - 4);
            graphics.lineTo(e.x1 + 2 + postLean, e.y1 - postHeight);
            graphics.fill(0x333333);
            // Highlight on finial
            graphics.moveTo(e.x1 - 1 + postLean, e.y1 - postHeight - 1);
            graphics.lineTo(e.x1 + postLean, e.y1 - postHeight - 3);
            graphics.stroke({ color: 0x666666, width: 1, alpha: 0.6 });

            // Right post
            graphics.rect(e.x2 - 2 - postLean, e.y2 - postHeight, 4, postHeight);
            graphics.fill(color);
            // Finial
            graphics.moveTo(e.x2 - 2 - postLean, e.y2 - postHeight);
            graphics.lineTo(e.x2 - postLean, e.y2 - postHeight - 4);
            graphics.lineTo(e.x2 + 2 - postLean, e.y2 - postHeight);
            graphics.fill(0x333333);
            // Highlight
            graphics.moveTo(e.x2 - 1 - postLean, e.y2 - postHeight - 1);
            graphics.lineTo(e.x2 - postLean, e.y2 - postHeight - 3);
            graphics.stroke({ color: 0x666666, width: 1, alpha: 0.6 });

            // Decorative rivets on posts
            graphics.circle(e.x1 + postLean, e.y1 - postHeight * 0.3, 1);
            graphics.fill(0x555555);
            graphics.circle(e.x2 - postLean, e.y2 - postHeight * 0.3, 1);
            graphics.fill(0x555555);

        } else if (fenceType === 'concrete') {
            // Concrete posts with texture
            const postHeight = fenceHeight * postHeightMod;

            // Left post
            graphics.rect(e.x1 - 3 + postLean, e.y1 - postHeight, 6, postHeight);
            graphics.fill(color);
            // Aggregate texture
            for (let i = 0; i < 4; i++) {
                const px = e.x1 - 2 + seededRandom(i * 2) * 4 + postLean;
                const py = e.y1 - postHeight + 2 + seededRandom(i * 2 + 1) * (postHeight - 4);
                graphics.circle(px, py, 0.8);
                graphics.fill({ color: 0x777777, alpha: 0.5 });
            }

            // Right post
            graphics.rect(e.x2 - 3 - postLean, e.y2 - postHeight, 6, postHeight);
            graphics.fill(color);
            // Aggregate texture
            for (let i = 0; i < 4; i++) {
                const px = e.x2 - 2 + seededRandom(i * 2 + 50) * 4 - postLean;
                const py = e.y2 - postHeight + 2 + seededRandom(i * 2 + 51) * (postHeight - 4);
                graphics.circle(px, py, 0.8);
                graphics.fill({ color: 0x777777, alpha: 0.5 });
            }
        } else {
            // Default posts
            graphics.rect(e.x1 - 2 + postLean, e.y1 - fenceHeight * postHeightMod, 4, fenceHeight * postHeightMod);
            graphics.fill(color);
            graphics.rect(e.x2 - 2 - postLean, e.y2 - fenceHeight * postHeightMod, 4, fenceHeight * postHeightMod);
            graphics.fill(color);
        }

        // Draw horizontal bars with type-specific details
        const barHeight = 3;
        const barY = fenceHeight - 4;

        if (condition === 'good' || condition === 'light_damage') {
            // Top bar
            graphics.poly([
                { x: e.x1 - 1, y: e.y1 - barY },
                { x: e.x2 - 1, y: e.y2 - barY },
                { x: e.x2 + 1, y: e.y2 - barY - barHeight },
                { x: e.x1 + 1, y: e.y1 - barY - barHeight },
            ]);
            graphics.fill(color);

            // Bar highlight (top edge)
            graphics.moveTo(e.x1, e.y1 - barY - barHeight + 0.5);
            graphics.lineTo(e.x2, e.y2 - barY - barHeight + 0.5);
            graphics.stroke({ color: this.blendColors(color, 0xffffff, 0.3), width: 1, alpha: 0.5 });

            // Bottom bar
            const barY2 = fenceHeight - 10;
            graphics.poly([
                { x: e.x1 - 1, y: e.y1 - barY2 },
                { x: e.x2 - 1, y: e.y2 - barY2 },
                { x: e.x2 + 1, y: e.y2 - barY2 - barHeight },
                { x: e.x1 + 1, y: e.y1 - barY2 - barHeight },
            ]);
            graphics.fill(color);

            // Iron fence: add vertical bars between posts
            if (fenceType === 'iron' && condition === 'good') {
                for (let i = 1; i <= 2; i++) {
                    const t = i / 3;
                    const bx = e.x1 + (e.x2 - e.x1) * t;
                    const by = e.y1 + (e.y2 - e.y1) * t;
                    graphics.rect(bx - 1, by - barY - barHeight, 2, barY - barY2 + barHeight);
                    graphics.fill(color);
                    // Small spear point on top
                    graphics.moveTo(bx - 1, by - barY - barHeight);
                    graphics.lineTo(bx, by - barY - barHeight - 2);
                    graphics.lineTo(bx + 1, by - barY - barHeight);
                    graphics.fill(0x555555);
                }
            }

            // Wood fence: add nail details
            if (fenceType === 'wood' && condition === 'good') {
                graphics.circle(e.x1 + 3, e.y1 - barY - barHeight / 2 + (e.y2 - e.y1) * 0.1, 0.8);
                graphics.fill(0x333333);
                graphics.circle(e.x2 - 3, e.y2 - barY - barHeight / 2 - (e.y2 - e.y1) * 0.1, 0.8);
                graphics.fill(0x333333);
            }

            if (condition === 'light_damage') {
                graphics.moveTo(midX - 3, midY - barY - 1);
                graphics.lineTo(midX + 2, midY - barY - 4);
                graphics.stroke({ width: 1, color: 0x333333, alpha: 0.6 });
            }
        } else if (condition === 'damaged') {
            // Left half of top bar (tilted down)
            graphics.poly([
                { x: e.x1 - 1, y: e.y1 - barY + 3 },
                { x: midX - 2, y: midY - barY + 1 },
                { x: midX, y: midY - barY - barHeight + 1 },
                { x: e.x1 + 1, y: e.y1 - barY - barHeight + 3 },
            ]);
            graphics.fill(color);

            // Right half of top bar
            graphics.poly([
                { x: midX + 2, y: midY - barY },
                { x: e.x2 - 1, y: e.y2 - barY },
                { x: e.x2 + 1, y: e.y2 - barY - barHeight },
                { x: midX + 3, y: midY - barY - barHeight },
            ]);
            graphics.fill(color);

            // Bottom bar
            const barY2 = fenceHeight - 10;
            graphics.poly([
                { x: e.x1 - 1, y: e.y1 - barY2 + 1 },
                { x: e.x2 - 1, y: e.y2 - barY2 + 1 },
                { x: e.x2 + 1, y: e.y2 - barY2 - barHeight + 1 },
                { x: e.x1 + 1, y: e.y1 - barY2 - barHeight + 1 },
            ]);
            graphics.fill(color);

            // Rust/damage spots
            graphics.circle(midX - 4, midY - barY + 2, 2);
            graphics.fill({ color: 0x884422, alpha: 0.4 });
        } else if (condition === 'failed') {
            // Left fragment dangling
            graphics.poly([
                { x: e.x1 - 1, y: e.y1 - barY + 5 },
                { x: e.x1 + 8, y: e.y1 - barY + 3 + (e.y2 - e.y1) * 0.15 },
                { x: e.x1 + 9, y: e.y1 - barY - barHeight + 3 + (e.y2 - e.y1) * 0.15 },
                { x: e.x1 + 1, y: e.y1 - barY - barHeight + 5 },
            ]);
            graphics.fill(color);

            // Broken piece on ground
            graphics.poly([
                { x: midX - 5, y: midY + 2 },
                { x: midX + 5, y: midY + 3 },
                { x: midX + 4, y: midY },
                { x: midX - 4, y: midY - 1 },
            ]);
            graphics.fill(this.blendColors(color, 0x444444, 0.3));

            // Bottom bar stub
            const barY2 = fenceHeight - 10;
            graphics.poly([
                { x: e.x2 - 10, y: e.y2 - barY2 + 2 - (e.y2 - e.y1) * 0.2 },
                { x: e.x2 - 1, y: e.y2 - barY2 + 2 },
                { x: e.x2 + 1, y: e.y2 - barY2 - barHeight + 2 },
                { x: e.x2 - 9, y: e.y2 - barY2 - barHeight + 2 - (e.y2 - e.y1) * 0.2 },
            ]);
            graphics.fill(color);

            // Warning indicator
            graphics.circle(midX, midY - fenceHeight / 2, 4);
            graphics.fill(0xff3333);
            graphics.circle(midX, midY - fenceHeight / 2, 3);
            graphics.fill(0xff6666);
        }
    }

    /**
     * Blend two colors together
     */
    private blendColors(color1: number, color2: number, ratio: number): number {
        const r1 = (color1 >> 16) & 0xff;
        const g1 = (color1 >> 8) & 0xff;
        const b1 = color1 & 0xff;

        const r2 = (color2 >> 16) & 0xff;
        const g2 = (color2 >> 8) & 0xff;
        const b2 = color2 & 0xff;

        const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
        const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
        const b = Math.round(b1 * (1 - ratio) + b2 * ratio);

        return (r << 16) | (g << 8) | b;
    }

    /**
     * Draw a gate edge with decorative details
     */
    private drawGateEdge(
        graphics: Graphics,
        x: number,
        y: number,
        edge: 'north' | 'south' | 'east' | 'west',
        fenceType: string
    ): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Gate colors based on fence type
        const postColors: Record<string, number> = {
            wood: 0x5c3317,
            iron: 0x333333,
            concrete: 0x666666,
        };
        const postColor = postColors[fenceType] || postColors.wood;
        const gateColor = fenceType === 'iron' ? 0x555555 : 0xd4a843;
        const gateAccent = fenceType === 'iron' ? 0x777777 : 0xffd700;
        const gateHighlight = fenceType === 'iron' ? 0x888888 : 0xffe066;

        const edgePoints: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
            north: { x1: x - hw, y1: y, x2: x, y2: y - hh },
            east: { x1: x, y1: y - hh, x2: x + hw, y2: y },
            south: { x1: x + hw, y1: y, x2: x, y2: y + hh },
            west: { x1: x, y1: y + hh, x2: x - hw, y2: y },
        };

        const e = edgePoints[edge];
        const fenceHeight = 18;
        const midX = (e.x1 + e.x2) / 2;
        const midY = (e.y1 + e.y2) / 2;

        // Draw thicker posts (gate frame) with details based on type
        if (fenceType === 'wood') {
            // Left post
            graphics.rect(e.x1 - 3, e.y1 - fenceHeight, 6, fenceHeight);
            graphics.fill(postColor);
            // Wood grain
            for (let i = 0; i < 4; i++) {
                graphics.moveTo(e.x1 - 2, e.y1 - fenceHeight + 3 + i * 4);
                graphics.lineTo(e.x1 + 2, e.y1 - fenceHeight + 5 + i * 4);
                graphics.stroke({ color: 0x4a2307, width: 0.5, alpha: 0.4 });
            }
            // Decorative post cap
            graphics.rect(e.x1 - 4, e.y1 - fenceHeight - 3, 8, 3);
            graphics.fill(this.blendColors(postColor, 0x000000, 0.1));
            graphics.moveTo(e.x1 - 4, e.y1 - fenceHeight - 3);
            graphics.lineTo(e.x1, e.y1 - fenceHeight - 6);
            graphics.lineTo(e.x1 + 4, e.y1 - fenceHeight - 3);
            graphics.fill(postColor);

            // Right post
            graphics.rect(e.x2 - 3, e.y2 - fenceHeight, 6, fenceHeight);
            graphics.fill(postColor);
            for (let i = 0; i < 4; i++) {
                graphics.moveTo(e.x2 - 2, e.y2 - fenceHeight + 3 + i * 4);
                graphics.lineTo(e.x2 + 2, e.y2 - fenceHeight + 5 + i * 4);
                graphics.stroke({ color: 0x4a2307, width: 0.5, alpha: 0.4 });
            }
            graphics.rect(e.x2 - 4, e.y2 - fenceHeight - 3, 8, 3);
            graphics.fill(this.blendColors(postColor, 0x000000, 0.1));
            graphics.moveTo(e.x2 - 4, e.y2 - fenceHeight - 3);
            graphics.lineTo(e.x2, e.y2 - fenceHeight - 6);
            graphics.lineTo(e.x2 + 4, e.y2 - fenceHeight - 3);
            graphics.fill(postColor);

        } else if (fenceType === 'iron') {
            // Left post with ornate finial
            graphics.rect(e.x1 - 3, e.y1 - fenceHeight, 6, fenceHeight);
            graphics.fill(postColor);
            // Decorative ball finial
            graphics.circle(e.x1, e.y1 - fenceHeight - 3, 3);
            graphics.fill(0x444444);
            graphics.circle(e.x1 - 0.5, e.y1 - fenceHeight - 4, 1);
            graphics.fill({ color: 0x666666, alpha: 0.6 });
            // Collar under finial
            graphics.rect(e.x1 - 4, e.y1 - fenceHeight, 8, 2);
            graphics.fill(0x555555);

            // Right post
            graphics.rect(e.x2 - 3, e.y2 - fenceHeight, 6, fenceHeight);
            graphics.fill(postColor);
            graphics.circle(e.x2, e.y2 - fenceHeight - 3, 3);
            graphics.fill(0x444444);
            graphics.circle(e.x2 - 0.5, e.y2 - fenceHeight - 4, 1);
            graphics.fill({ color: 0x666666, alpha: 0.6 });
            graphics.rect(e.x2 - 4, e.y2 - fenceHeight, 8, 2);
            graphics.fill(0x555555);

        } else {
            // Concrete posts
            graphics.rect(e.x1 - 4, e.y1 - fenceHeight, 8, fenceHeight);
            graphics.fill(postColor);
            graphics.rect(e.x1 - 5, e.y1 - fenceHeight - 2, 10, 2);
            graphics.fill(this.blendColors(postColor, 0xffffff, 0.1));

            graphics.rect(e.x2 - 4, e.y2 - fenceHeight, 8, fenceHeight);
            graphics.fill(postColor);
            graphics.rect(e.x2 - 5, e.y2 - fenceHeight - 2, 10, 2);
            graphics.fill(this.blendColors(postColor, 0xffffff, 0.1));
        }

        // Gate arch at top
        graphics.poly([
            { x: e.x1, y: e.y1 - fenceHeight },
            { x: e.x2, y: e.y2 - fenceHeight },
            { x: e.x2, y: e.y2 - fenceHeight - 4 },
            { x: midX, y: midY - fenceHeight - 7 },
            { x: e.x1, y: e.y1 - fenceHeight - 4 },
        ]);
        graphics.fill(postColor);

        // Arch highlight
        graphics.moveTo(e.x1 + 2, e.y1 - fenceHeight - 3);
        graphics.quadraticCurveTo(midX, midY - fenceHeight - 5, e.x2 - 2, e.y2 - fenceHeight - 3);
        graphics.stroke({ color: this.blendColors(postColor, 0xffffff, 0.3), width: 1, alpha: 0.5 });

        // Vertical gate bars with decorative tops
        const numBars = 5;
        for (let i = 1; i < numBars; i++) {
            const t = i / numBars;
            const bx = e.x1 + (e.x2 - e.x1) * t;
            const by = e.y1 + (e.y2 - e.y1) * t;
            const barTop = by - fenceHeight + 3 - Math.sin(t * Math.PI) * 2; // Slight curve following arch

            graphics.rect(bx - 1, barTop, 2, fenceHeight - 5 + Math.sin(t * Math.PI) * 2);
            graphics.fill(gateColor);

            // Decorative spear point on each bar
            graphics.moveTo(bx - 1.5, barTop);
            graphics.lineTo(bx, barTop - 3);
            graphics.lineTo(bx + 1.5, barTop);
            graphics.fill(gateAccent);

            // Highlight on bar
            graphics.moveTo(bx - 0.5, barTop + 2);
            graphics.lineTo(bx - 0.5, by - 4);
            graphics.stroke({ color: gateHighlight, width: 0.5, alpha: 0.4 });
        }

        // Horizontal bars
        const barHeight = 2;
        const barY = fenceHeight - 5;
        graphics.poly([
            { x: e.x1 + 3, y: e.y1 - barY },
            { x: e.x2 - 3, y: e.y2 - barY },
            { x: e.x2 - 3, y: e.y2 - barY - barHeight },
            { x: e.x1 + 3, y: e.y1 - barY - barHeight },
        ]);
        graphics.fill(gateColor);

        // Second horizontal bar
        const barY2 = fenceHeight - 12;
        graphics.poly([
            { x: e.x1 + 3, y: e.y1 - barY2 },
            { x: e.x2 - 3, y: e.y2 - barY2 },
            { x: e.x2 - 3, y: e.y2 - barY2 - barHeight },
            { x: e.x1 + 3, y: e.y1 - barY2 - barHeight },
        ]);
        graphics.fill(gateColor);

        // Decorative center medallion
        graphics.circle(midX, midY - fenceHeight / 2, 4);
        graphics.fill(gateAccent);
        graphics.circle(midX, midY - fenceHeight / 2, 3);
        graphics.fill(gateHighlight);
        // Inner design
        graphics.circle(midX, midY - fenceHeight / 2, 1.5);
        graphics.fill(gateAccent);

        // Hinge details on posts
        graphics.rect(e.x1 + 2, e.y1 - fenceHeight + 3, 3, 2);
        graphics.fill(0x333333);
        graphics.rect(e.x1 + 2, e.y1 - 5, 3, 2);
        graphics.fill(0x333333);
        graphics.rect(e.x2 - 5, e.y2 - fenceHeight + 3, 3, 2);
        graphics.fill(0x333333);
        graphics.rect(e.x2 - 5, e.y2 - 5, 3, 2);
        graphics.fill(0x333333);
    }

    /**
     * Get a sprite from the pool or create a new one
     */
    private getPooledSprite(texture: Texture): Sprite {
        if (this.activeSpriteCount < this.spritePool.length) {
            const sprite = this.spritePool[this.activeSpriteCount];
            sprite.texture = texture;
            sprite.visible = true;
            this.activeSpriteCount++;
            return sprite;
        }

        const sprite = new Sprite(texture);
        this.spritePool.push(sprite);
        this.entityContainer.addChild(sprite);
        this.activeSpriteCount++;
        return sprite;
    }

    /**
     * Reset sprite pool for next frame
     */
    private resetSpritePool(): void {
        // Hide unused sprites instead of destroying them
        for (let i = this.activeSpriteCount; i < this.spritePool.length; i++) {
            this.spritePool[i].visible = false;
        }
        this.activeSpriteCount = 0;
    }

    /**
     * Get a graphics object from the pool or create a new one
     */
    private getPooledGraphics(): Graphics {
        if (this.activeGraphicsCount < this.graphicsPool.length) {
            const graphics = this.graphicsPool[this.activeGraphicsCount];
            graphics.clear();
            graphics.visible = true;
            this.activeGraphicsCount++;
            return graphics;
        }

        const graphics = new Graphics();
        this.graphicsPool.push(graphics);
        this.entityContainer.addChild(graphics);
        this.activeGraphicsCount++;
        return graphics;
    }

    /**
     * Reset graphics pool for next frame
     */
    private resetGraphicsPool(): void {
        for (let i = this.activeGraphicsCount; i < this.graphicsPool.length; i++) {
            this.graphicsPool[i].visible = false;
        }
        this.activeGraphicsCount = 0;
    }

    /**
     * Get a fence graphics object from the pool or create a new one
     */
    private getPooledFenceGraphics(): Graphics {
        if (this.activeFenceGraphicsCount < this.fenceGraphicsPool.length) {
            const graphics = this.fenceGraphicsPool[this.activeFenceGraphicsCount];
            graphics.clear();
            graphics.visible = true;
            this.activeFenceGraphicsCount++;
            return graphics;
        }

        const graphics = new Graphics();
        this.fenceGraphicsPool.push(graphics);
        this.entityContainer.addChild(graphics);  // Add to entity container for depth sorting
        this.activeFenceGraphicsCount++;
        return graphics;
    }

    /**
     * Reset fence graphics pool for next frame
     */
    private resetFenceGraphicsPool(): void {
        for (let i = this.activeFenceGraphicsCount; i < this.fenceGraphicsPool.length; i++) {
            this.fenceGraphicsPool[i].visible = false;
        }
        this.activeFenceGraphicsCount = 0;
    }

    /**
     * Get a task emoji text from the pool or create a new one
     */
    private getPooledTaskEmoji(emoji: string, x: number, y: number, depth: number): Text {
        let text: Text;

        if (this.activeTaskEmojiCount < this.taskEmojiPool.length) {
            text = this.taskEmojiPool[this.activeTaskEmojiCount];
            text.text = emoji;
            text.visible = true;
        } else {
            text = new Text({ text: emoji, style: this.taskEmojiStyle });
            text.anchor.set(0.5, 1);
            this.taskEmojiPool.push(text);
            this.entityContainer.addChild(text);
        }

        text.x = x;
        text.y = y;
        text.zIndex = depth + 1; // Slightly above the staff
        this.activeTaskEmojiCount++;
        return text;
    }

    /**
     * Reset task emoji pool for next frame
     */
    private resetTaskEmojiPool(): void {
        for (let i = this.activeTaskEmojiCount; i < this.taskEmojiPool.length; i++) {
            this.taskEmojiPool[i].visible = false;
        }
        this.activeTaskEmojiCount = 0;
    }

    /**
     * Calculate view-space depth for an entity (for proper depth sorting with camera rotation)
     */
    private getViewSpaceDepth(worldX: number, worldY: number, offsetY: number = 0): number {
        const viewPos = this.game.camera.rotateWorldToView(worldX, worldY);
        return viewPos.x + viewPos.y + offsetY;
    }

    /**
     * Get which WORLD fence edges are front-facing based on camera rotation
     * Front edges are those whose screen representation is at the bottom of the isometric diamond
     */
    private getFrontEdges(): ('north' | 'south' | 'east' | 'west')[] {
        // Screen edges south and west are always front-facing (bottom of diamond)
        // We need to find which WORLD edges map to those screen edges at current rotation
        // getScreenEdge uses: screenIndex = (worldIndex - rotation + 4) % 4
        // Inverse is: worldIndex = (screenIndex + rotation) % 4
        const edges: ('north' | 'east' | 'south' | 'west')[] = ['north', 'east', 'south', 'west'];
        const rotation = this.game.camera.rotation;

        // Screen south (index 2) and screen west (index 3) are front
        const worldEdgeForScreenSouth = edges[(2 + rotation) % 4];
        const worldEdgeForScreenWest = edges[(3 + rotation) % 4];

        return [worldEdgeForScreenSouth, worldEdgeForScreenWest];
    }

    /**
     * Get which building walls are visible based on camera rotation
     * Returns array of wall indices (0-3) that should be rendered
     * Since corners are mapped to screen positions, walls 2 and 3 are always the visible front walls
     */
    private getVisibleWalls(): number[] {
        // Walls are always in screen-space order after corner mapping:
        // Wall 0: back-left (left to top)
        // Wall 1: back-right (top to right) - hidden
        // Wall 2: front-right (right to bottom) - visible
        // Wall 3: front-left (bottom to left) - visible
        return [2, 3];
    }

    /**
     * Get the draw order for building walls based on camera rotation
     * Returns wall indices in back-to-front order for proper occlusion
     */
    private getWallDrawOrder(): number[] {
        // At rotation 0: back walls are 0,1, front walls are 2,3 → draw order: 0,1,2,3
        // Each rotation shifts the order
        const rotation = this.game.camera.rotation;
        return [
            (0 + rotation) % 4,
            (1 + rotation) % 4,
            (2 + rotation) % 4,
            (3 + rotation) % 4,
        ];
    }

    /**
     * Adjust 4-way direction (ne, se, sw, nw) based on camera rotation
     * When camera rotates CW, world directions appear to rotate CCW on screen
     */
    private adjustDirection(worldDirection: string): string {
        const directions = ['ne', 'se', 'sw', 'nw'];
        const index = directions.indexOf(worldDirection);
        if (index === -1) return worldDirection;

        // When camera rotates CW, directions appear to rotate CCW (subtract rotation)
        const newIndex = (index - this.game.camera.rotation + 4) % 4;
        return directions[newIndex];
    }

    /**
     * Adjust facingX (sprite flip) based on camera rotation
     * For staff and guests that use simple left/right flipping
     */
    private adjustFacingX(worldFacingX: number): number {
        // At 0° and 180°, facingX stays the same
        // At 90° and 270°, facingX is inverted
        const rotation = this.game.camera.rotation;
        if (rotation === 1 || rotation === 3) {
            return -worldFacingX;
        }
        return worldFacingX;
    }

    /**
     * Get the screen-space edge for a world-space edge based on camera rotation
     * When camera rotates CW, world edges appear to rotate CCW on screen
     */
    private getScreenEdge(worldEdge: 'north' | 'south' | 'east' | 'west'): 'north' | 'south' | 'east' | 'west' {
        const edges: ('north' | 'east' | 'south' | 'west')[] = ['north', 'east', 'south', 'west'];
        const worldIndex = edges.indexOf(worldEdge);
        const screenIndex = (worldIndex - this.game.camera.rotation + 4) % 4;
        return edges[screenIndex];
    }

    /**
     * Convert world-space corner to screen-space corner based on camera rotation
     * When camera rotates CW, world corners appear to rotate CCW on screen
     */
    private getScreenCorner(worldCorner: 'top' | 'right' | 'bottom' | 'left'): 'top' | 'right' | 'bottom' | 'left' {
        const corners: ('top' | 'right' | 'bottom' | 'left')[] = ['top', 'right', 'bottom', 'left'];
        const worldIndex = corners.indexOf(worldCorner);
        const screenIndex = (worldIndex - this.game.camera.rotation + 4) % 4;
        return corners[screenIndex];
    }

    /**
     * Render entities (depth-sorted)
     */
    private renderEntities(): void {
        // Reset pools
        this.resetSpritePool();
        this.resetGraphicsPool();
        this.resetTaskEmojiPool();
        this.entityGraphics.clear();
        this.entityGraphics.visible = false; // Hide the old shared graphics

        // Collect all renderable entities with their depth values
        type RenderItem = {
            type: 'animal' | 'staff' | 'guest' | 'foliage' | 'food' | 'shelter' | 'building' | 'entrance_gate';
            entity: any;
            depth: number;
            screenX: number;
            screenY: number;
        };

        const items: RenderItem[] = [];

        // Add entrance gate - rendered with higher depth so arch is in front of guests walking through
        const entrance = this.game.world.getEntrancePosition();
        const gateScreenPos = this.game.camera.tileToScreen(entrance.x, entrance.y);
        items.push({
            type: 'entrance_gate',
            entity: null,
            depth: this.getViewSpaceDepth(entrance.x, entrance.y, 2), // Higher depth so arch renders in front of guests
            screenX: gateScreenPos.x,
            screenY: gateScreenPos.y,
        });

        // Add animals (skip those inside shelters)
        for (const animal of this.game.animals) {
            // Don't render animals that are inside a shelter
            if (animal.insideShelter) continue;

            const worldPos = animal.getWorldPos();
            const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
            items.push({
                type: 'animal',
                entity: animal,
                depth: this.getViewSpaceDepth(worldPos.x, worldPos.y, animal.offsetY),
                screenX: screenPos.x,
                screenY: screenPos.y,
            });
        }

        // Add staff
        for (const staff of this.game.staff) {
            const worldPos = staff.getWorldPos();
            const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
            items.push({
                type: 'staff',
                entity: staff,
                depth: this.getViewSpaceDepth(worldPos.x, worldPos.y, staff.offsetY),
                screenX: screenPos.x,
                screenY: screenPos.y,
            });
        }

        // Add guests (if visible, skip those inside buildings)
        if (this.game.showGuests) {
            for (const guest of this.game.guests) {
                // Skip guests who are inside buildings (browsing state only - exiting shows them walking out)
                if (guest.state === 'browsing') continue;

                const worldPos = guest.getWorldPos();
                const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
                items.push({
                    type: 'guest',
                    entity: guest,
                    depth: this.getViewSpaceDepth(worldPos.x, worldPos.y, guest.offsetY),
                    screenX: screenPos.x,
                    screenY: screenPos.y,
                });
            }
        }

        // Add foliage (if visible)
        if (this.game.showFoliage) {
            for (const foliageItem of this.game.foliage) {
                const worldPos = foliageItem.getWorldPos();
                const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
                items.push({
                    type: 'foliage',
                    entity: foliageItem,
                    depth: this.getViewSpaceDepth(worldPos.x, worldPos.y, foliageItem.offsetY),
                    screenX: screenPos.x,
                    screenY: screenPos.y,
                });
            }
        }

        // Add food piles
        for (const pile of this.game.foodPiles) {
            const worldPos = pile.getWorldPos();
            const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
            items.push({
                type: 'food',
                entity: pile,
                depth: this.getViewSpaceDepth(worldPos.x, worldPos.y, pile.offsetY),
                screenX: screenPos.x,
                screenY: screenPos.y,
            });
        }

        // Add shelters (if buildings visible)
        if (this.game.showBuildings) {
            for (const shelter of this.game.shelters) {
                const worldPos = shelter.getWorldPos();
                const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
                // Use the front corner of the shelter for depth (in world space: tileX + width - 1, tileY + depth - 1)
                const frontX = shelter.tileX + shelter.width - 1;
                const frontY = shelter.tileY + shelter.depth - 1;
                items.push({
                    type: 'shelter',
                    entity: shelter,
                    depth: this.getViewSpaceDepth(frontX, frontY),
                    screenX: screenPos.x,
                    screenY: screenPos.y,
                });
            }
        }

        // Add buildings (if visible)
        if (this.game.showBuildings) {
            for (const building of this.game.buildings) {
                const worldPos = building.getWorldPos();
                const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
                // Use the front corner of the building for depth
                const frontX = building.tileX + building.width - 1;
                const frontY = building.tileY + building.depth - 1;
                items.push({
                    type: 'building',
                    entity: building,
                    depth: this.getViewSpaceDepth(frontX, frontY),
                    screenX: screenPos.x,
                    screenY: screenPos.y,
                });
            }
        }

        // Sort by depth (painter's algorithm)
        items.sort((a, b) => a.depth - b.depth);

        // Render each item with proper depth
        for (const item of items) {
            switch (item.type) {
                case 'animal':
                    if (this.texturesLoaded) {
                        this.drawAnimalSprite(item.screenX, item.screenY, item.entity, item.depth);
                    } else {
                        const g = this.getPooledGraphics();
                        g.zIndex = item.depth;
                        this.drawAnimal(g, item.screenX, item.screenY, item.entity);
                    }
                    break;
                case 'staff':
                    if (this.texturesLoaded) {
                        this.drawStaffSprite(item.screenX, item.screenY, item.entity, item.depth);
                    } else {
                        const g = this.getPooledGraphics();
                        g.zIndex = item.depth;
                        this.drawStaff(g, item.screenX, item.screenY, item.entity);
                    }
                    break;
                case 'guest': {
                    // Always use graphics for guests to show color variation
                    const g = this.getPooledGraphics();
                    g.zIndex = item.depth;
                    this.drawGuest(g, item.screenX, item.screenY, item.entity);
                    break;
                }
                case 'foliage': {
                    const g = this.getPooledGraphics();
                    g.zIndex = item.depth;
                    this.drawFoliage(g, item.screenX, item.screenY, item.entity);
                    break;
                }
                case 'food': {
                    const g = this.getPooledGraphics();
                    g.zIndex = item.depth;
                    this.drawFoodPile(g, item.screenX, item.screenY, item.entity);
                    break;
                }
                case 'shelter': {
                    const g = this.getPooledGraphics();
                    g.zIndex = item.depth;
                    this.drawShelter(g, item.screenX, item.screenY, item.entity);
                    break;
                }
                case 'building': {
                    const g = this.getPooledGraphics();
                    g.zIndex = item.depth;
                    this.drawBuilding(g, item.screenX, item.screenY, item.entity);
                    break;
                }
                case 'entrance_gate':
                    this.drawEntranceGate(item.screenX, item.screenY, item.depth);
                    break;
            }
        }

        // Draw interaction point debug overlays if enabled
        if (this.game.showInteractionPoints) {
            this.drawInteractionPointOverlays();
        }
    }

    /**
     * Draw debug overlays showing interaction points on all placeables
     */
    private drawInteractionPointOverlays(): void {
        const g = this.getPooledGraphics();
        g.zIndex = 10000; // Draw on top of everything

        // Draw for all shelters
        for (const shelter of this.game.shelters) {
            this.drawPlaceableInteractionPoints(g, shelter);
        }

        // Draw for all buildings
        for (const building of this.game.buildings) {
            this.drawPlaceableInteractionPoints(g, building);
        }
    }

    /**
     * Draw interaction point highlights for a single placeable
     */
    private drawPlaceableInteractionPoints(graphics: Graphics, placeable: Placeable): void {
        const interactionPoints = placeable.getInteractionPoints();

        for (const point of interactionPoints) {
            const hw = TILE_WIDTH / 2;
            const hh = TILE_HEIGHT / 2;

            // Choose color based on interaction type
            let color: number;
            switch (point.type) {
                case 'enter':
                    color = 0x00ff00; // Green for entrances
                    break;
                case 'purchase':
                    color = 0xffff00; // Yellow for purchase points
                    break;
                case 'sit':
                    color = 0x00ffff; // Cyan for seats
                    break;
                case 'use':
                    color = 0xff00ff; // Magenta for use points
                    break;
                case 'work':
                    color = 0xff8800; // Orange for work points
                    break;
                default:
                    color = 0xffffff; // White for unknown
            }

            // Get screen position of the interaction tile (on building)
            const screenPos = this.game.camera.tileToScreen(point.worldX, point.worldY);

            // Draw interaction tile highlight (where the interaction happens)
            graphics.poly([
                { x: screenPos.x, y: screenPos.y - hh },
                { x: screenPos.x + hw, y: screenPos.y },
                { x: screenPos.x, y: screenPos.y + hh },
                { x: screenPos.x - hw, y: screenPos.y },
            ]);
            graphics.fill({ color, alpha: 0.4 });
            graphics.stroke({ color, width: 2, alpha: 0.8 });

            // For 'facing' type, also show where the entity stands
            if (point.approach === 'facing') {
                // Calculate approach tile position
                let approachX = point.worldX;
                let approachY = point.worldY;
                switch (point.worldFacing) {
                    case 'south': approachX += 1; break;
                    case 'north': approachX -= 1; break;
                    case 'west': approachY += 1; break;
                    case 'east': approachY -= 1; break;
                }

                const approachScreenPos = this.game.camera.tileToScreen(approachX, approachY);

                // Draw approach tile (where entity stands) with dashed outline
                graphics.poly([
                    { x: approachScreenPos.x, y: approachScreenPos.y - hh },
                    { x: approachScreenPos.x + hw, y: approachScreenPos.y },
                    { x: approachScreenPos.x, y: approachScreenPos.y + hh },
                    { x: approachScreenPos.x - hw, y: approachScreenPos.y },
                ]);
                graphics.fill({ color: 0x00ff00, alpha: 0.25 }); // Green for standing position
                graphics.stroke({ color: 0x00ff00, width: 2, alpha: 0.8 });

                // Draw connecting line from approach to interaction
                graphics.moveTo(approachScreenPos.x, approachScreenPos.y);
                graphics.lineTo(screenPos.x, screenPos.y);
                graphics.stroke({ color: 0xffffff, width: 1, alpha: 0.6 });

                // Draw person icon on approach tile
                graphics.circle(approachScreenPos.x, approachScreenPos.y - 5, 4);
                graphics.fill(0x00ff00);
            }

            // Draw arrow showing facing direction on interaction tile
            const arrowLength = 12;
            let arrowDx = 0, arrowDy = 0;
            switch (point.worldFacing) {
                case 'north': arrowDx = -arrowLength; arrowDy = -arrowLength / 2; break;
                case 'south': arrowDx = arrowLength; arrowDy = arrowLength / 2; break;
                case 'east': arrowDx = arrowLength; arrowDy = -arrowLength / 2; break;
                case 'west': arrowDx = -arrowLength; arrowDy = arrowLength / 2; break;
            }

            graphics.moveTo(screenPos.x, screenPos.y);
            graphics.lineTo(screenPos.x + arrowDx, screenPos.y + arrowDy);
            graphics.stroke({ color: 0xffffff, width: 2 });

            graphics.circle(screenPos.x + arrowDx, screenPos.y + arrowDy, 3);
            graphics.fill(0xffffff);

            // Draw capacity indicator if > 1
            const capacity = point.capacity || 1;
            if (capacity > 1) {
                graphics.circle(screenPos.x, screenPos.y - 15, 8);
                graphics.fill({ color: 0x000000, alpha: 0.7 });
                graphics.stroke({ color: 0xffffff, width: 1 });
            }
        }
    }

    /**
     * Draw the entrance gate
     */
    private drawEntranceGate(x: number, y: number, depth: number): void {
        const cameraRotation = this.game.camera.rotation;

        // Use different sprite based on camera rotation:
        // - Rotation 0: entrance_gate (normal)
        // - Rotation 1: entrance_gate_rot1 (perpendicular view)
        // - Rotation 2: entrance_gate_rot1 (flipped)
        // - Rotation 3: entrance_gate (flipped)
        const useRotatedSprite = cameraRotation === 1 || cameraRotation === 2;
        const textureName = useRotatedSprite ? 'entrance_gate_rot1' : 'entrance_gate';
        const texture = this.textures.get(textureName);

        if (texture) {
            const sprite = this.getPooledSprite(texture);
            sprite.anchor.set(0.5, 0.75); // Center horizontally, anchor near bottom
            sprite.x = x;
            sprite.y = y + 8; // Offset to align with entrance tiles
            sprite.zIndex = depth;

            // Flip sprite for "back" views (rotations 2 and 3)
            const baseScale = 1.1;
            if (cameraRotation === 2 || cameraRotation === 3) {
                sprite.scale.set(-baseScale, baseScale); // Flip horizontally
            } else {
                sprite.scale.set(baseScale, baseScale); // Normal
            }
        } else {
            // Fallback: draw simple gate with graphics
            const g = this.getPooledGraphics();
            g.zIndex = depth;

            // Left pillar
            g.rect(x - 50, y - 60, 16, 70);
            g.fill(0x8B4513);

            // Right pillar
            g.rect(x + 34, y - 60, 16, 70);
            g.fill(0x8B4513);

            // Arch
            g.moveTo(x - 34, y - 50);
            g.quadraticCurveTo(x, y - 90, x + 34, y - 50);
            g.stroke({ color: 0x654321, width: 8 });

            // ZOO text background
            g.roundRect(x - 25, y - 75, 50, 20, 4);
            g.fill(0x654321);
        }
    }

    /**
     * Draw an animal using sprites
     */
    private drawAnimalSprite(x: number, y: number, animal: any, depth: number): void {
        const worldDirection = animal.facingDirection || 'ne';
        const direction = this.adjustDirection(worldDirection);
        let textureName: string;

        if (animal.species === 'lion') {
            const baseName = animal.gender === 'male' ? 'lion' : 'lioness';
            textureName = `${baseName}_${direction}`;
        } else if (animal.species === 'bison') {
            textureName = 'bison';
        } else {
            textureName = 'lion_ne'; // fallback
        }

        const texture = this.textures.get(textureName);
        if (!texture) return;

        const sprite = this.getPooledSprite(texture);
        sprite.anchor.set(0.5, 1); // Bottom center
        sprite.x = x;
        sprite.y = y + 8; // Offset to align with tile
        sprite.zIndex = depth; // Set depth for sorting

        // Scale based on age (adults are 1.0, babies start at 0.4)
        // Smaller scale since sprites are now 96x96 (was 48x48)
        const ageScale = animal.getAgeScale?.() || 1;
        const speciesScale = animal.scale || 1;
        const baseScale = 0.6; // Reduced from 1.2 since sprites are 2x size
        sprite.scale.set(ageScale * baseScale * speciesScale);
    }

    /**
     * Draw a staff member using sprites
     */
    private drawStaffSprite(x: number, y: number, staff: any, depth: number): void {
        // Select texture based on staff type
        let textureName = 'zookeeper';
        if (staff.staffType === 'maintenance') {
            textureName = 'maintenance_worker';
        }

        const texture = this.textures.get(textureName);
        if (!texture) return;

        const sprite = this.getPooledSprite(texture);
        sprite.anchor.set(0.5, 1);
        sprite.x = x;
        sprite.y = y + 4;
        sprite.scale.set(0.7);
        sprite.zIndex = depth;

        // Flip based on facing direction (adjusted for camera rotation)
        const worldFacing = staff.facingX || 1;
        const facing = this.adjustFacingX(worldFacing);
        sprite.scale.x = Math.abs(sprite.scale.x) * facing;

        // Show task emoji above staff when working
        if (staff.state === 'working') {
            const task = staff.getCurrentTask?.();
            if (task) {
                const taskEmojis: Record<string, string> = {
                    'feed_animals': '🍖',
                    'clean_poop': '🧹',
                    'repair_fence': '🔧',
                    'clean_trash': '🧹',
                    'empty_garbage': '🗑️',
                };
                const emoji = taskEmojis[task.type] || '⚙️';
                this.getPooledTaskEmoji(emoji, x, y - 35, depth);
            }
        }
    }

    /**
     * Draw a guest using sprites
     */
    private drawGuestSprite(x: number, y: number, guest: any, depth: number): void {
        const texture = this.textures.get('guest');
        if (!texture) return;

        const sprite = this.getPooledSprite(texture);
        sprite.anchor.set(0.5, 1);
        sprite.x = x;
        sprite.y = y + 4;
        sprite.scale.set(0.6);
        sprite.zIndex = depth;

        // Flip based on facing direction (adjusted for camera rotation)
        const worldFacing = guest.facingX || 1;
        const facing = this.adjustFacingX(worldFacing);
        sprite.scale.x = Math.abs(sprite.scale.x) * facing;
    }

    /**
     * Draw an animal with detailed textures
     */
    private drawAnimal(graphics: Graphics, x: number, y: number, animal: any): void {
        const worldFacing = animal.facingX || 1; // 1 = right, -1 = left
        const facing = this.adjustFacingX(worldFacing);
        const scale = animal.scale || 1;
        const isMoving = animal.isMoving || false;
        const animTimer = animal.animTimer || 0;

        // Seeded random for consistent details
        const seed = animal.id * 12345;
        const seededRandom = (offset: number) => {
            const val = Math.sin(seed + offset) * 43758.5453;
            return val - Math.floor(val);
        };

        // Walking animation
        const walkCycle = isMoving ? Math.sin(animTimer * 0.8) : 0;
        const legSwing = walkCycle * 2 * scale;

        // Get colors from animal (or default)
        const bodyColor = animal.bodyColor || 0xD4A843;
        const headColor = animal.headColor || bodyColor;

        if (animal.species === 'lion') {
            this.drawLion(graphics, x, y, animal, facing, scale, legSwing, seededRandom);
        } else if (animal.species === 'bison') {
            this.drawBison(graphics, x, y, animal, facing, scale, legSwing, seededRandom);
        } else {
            // Generic animal
            this.drawGenericAnimal(graphics, x, y, bodyColor, headColor, facing, scale, legSwing);
        }
    }

    /**
     * Draw a lion with detailed features
     */
    private drawLion(
        graphics: Graphics, x: number, y: number, animal: any,
        facing: number, scale: number, legSwing: number,
        seededRandom: (offset: number) => number
    ): void {
        const bodyColor = animal.bodyColor || 0xc9a227;
        const maneColor = animal.maneColor || 0x8b6914;
        const accentColor = animal.accentColor || 0xe8c547;
        const isMale = animal.gender === 'male';

        // Shadow
        graphics.ellipse(x, y + 4, 14 * scale, 7 * scale);
        graphics.fill({ color: 0x000000, alpha: 0.2 });

        // Tail
        const tailX = x - 14 * scale * facing;
        const tailY = y - 6 * scale;
        // Tail curve
        graphics.moveTo(x - 10 * scale * facing, y - 4 * scale);
        graphics.quadraticCurveTo(tailX - 4 * facing, tailY - 6 * scale, tailX, tailY - 8 * scale);
        graphics.stroke({ color: bodyColor, width: 2 * scale });
        // Tail tuft
        graphics.circle(tailX, tailY - 9 * scale, 3 * scale);
        graphics.fill(maneColor);

        // Back legs
        graphics.ellipse(x - 6 * scale * facing, y - 1 + legSwing, 4 * scale, 6 * scale);
        graphics.fill(bodyColor);
        graphics.ellipse(x - 8 * scale * facing, y + 2 + legSwing, 3 * scale, 4 * scale);
        graphics.fill(this.blendColors(bodyColor, 0x000000, 0.1));

        // Body (elongated for lion)
        graphics.ellipse(x, y - 8 * scale, 16 * scale, 10 * scale);
        graphics.fill(bodyColor);

        // Body highlight
        graphics.ellipse(x - 2 * scale * facing, y - 10 * scale, 10 * scale, 5 * scale);
        graphics.fill({ color: accentColor, alpha: 0.3 });

        // Front legs
        graphics.ellipse(x + 8 * scale * facing, y - 1 - legSwing, 4 * scale, 6 * scale);
        graphics.fill(bodyColor);
        graphics.ellipse(x + 10 * scale * facing, y + 2 - legSwing, 3 * scale, 4 * scale);
        graphics.fill(this.blendColors(bodyColor, 0x000000, 0.1));

        // Paws
        graphics.ellipse(x + 10 * scale * facing, y + 5 - legSwing, 3 * scale, 2 * scale);
        graphics.fill(this.blendColors(bodyColor, 0x000000, 0.15));
        graphics.ellipse(x - 8 * scale * facing, y + 5 + legSwing, 3 * scale, 2 * scale);
        graphics.fill(this.blendColors(bodyColor, 0x000000, 0.15));

        // Mane for male lions (drawn behind head)
        if (isMale) {
            // Layered mane circles
            const maneOffsets = [
                { dx: -6, dy: -14, r: 8 },
                { dx: -2, dy: -18, r: 7 },
                { dx: 4, dy: -16, r: 6 },
                { dx: -8, dy: -10, r: 6 },
                { dx: 6, dy: -12, r: 5 },
                { dx: 0, dy: -20, r: 5 },
            ];
            for (const m of maneOffsets) {
                const mx = x + (12 * scale + m.dx * scale * 0.5) * facing;
                const my = y + m.dy * scale;
                graphics.circle(mx, my, m.r * scale * 0.7);
                graphics.fill(maneColor);
            }
            // Mane fur texture
            for (let i = 0; i < 8; i++) {
                const angle = (seededRandom(i) - 0.5) * Math.PI;
                const dist = 6 + seededRandom(i + 10) * 6;
                const mx = x + (12 * scale + Math.cos(angle) * dist * scale * 0.5) * facing;
                const my = y - 14 * scale + Math.sin(angle) * dist * scale * 0.4;
                graphics.circle(mx, my, (2 + seededRandom(i + 20) * 2) * scale);
                graphics.fill(seededRandom(i + 30) > 0.5 ? maneColor : this.blendColors(maneColor, 0x000000, 0.2));
            }
        }

        // Head
        const headX = x + 14 * scale * facing;
        const headY = y - 12 * scale;
        graphics.ellipse(headX, headY, 8 * scale, 7 * scale);
        graphics.fill(bodyColor);

        // Snout
        graphics.ellipse(headX + 5 * scale * facing, headY + 2 * scale, 4 * scale, 3 * scale);
        graphics.fill(accentColor);

        // Nose
        graphics.ellipse(headX + 7 * scale * facing, headY + 1 * scale, 2 * scale, 1.5 * scale);
        graphics.fill(0x4a3020);

        // Eyes
        graphics.ellipse(headX + 2 * scale * facing, headY - 2 * scale, 2.5 * scale, 2 * scale);
        graphics.fill(0xffffff);
        graphics.circle(headX + 2.5 * scale * facing, headY - 2 * scale, 1.2 * scale);
        graphics.fill(0x4a3020);
        graphics.circle(headX + 2.8 * scale * facing, headY - 2.3 * scale, 0.5 * scale);
        graphics.fill(0xffffff);

        // Ears
        if (!isMale) {
            graphics.circle(headX - 4 * scale * facing, headY - 6 * scale, 3 * scale);
            graphics.fill(bodyColor);
            graphics.circle(headX + 2 * scale * facing, headY - 7 * scale, 3 * scale);
            graphics.fill(bodyColor);
            // Inner ear
            graphics.circle(headX - 4 * scale * facing, headY - 6 * scale, 1.5 * scale);
            graphics.fill(0xd4a090);
        }

        // Whisker dots
        for (let i = 0; i < 3; i++) {
            graphics.circle(headX + (4 + i) * scale * facing, headY + (2 + i * 0.5) * scale, 0.5 * scale);
            graphics.fill(0x333333);
        }
    }

    /**
     * Draw a bison with detailed features
     */
    private drawBison(
        graphics: Graphics, x: number, y: number, animal: any,
        facing: number, scale: number, legSwing: number,
        seededRandom: (offset: number) => number
    ): void {
        const bodyColor = animal.bodyColor || 0x4a3728;
        const headColor = animal.headColor || 0x2d2015;
        const hornColor = animal.hornColor || 0x1a1a1a;

        // Shadow (larger for bison)
        graphics.ellipse(x, y + 6, 18 * scale, 9 * scale);
        graphics.fill({ color: 0x000000, alpha: 0.2 });

        // Tail
        const tailX = x - 16 * scale * facing;
        graphics.moveTo(x - 12 * scale * facing, y - 2 * scale);
        graphics.lineTo(tailX, y + 4 * scale);
        graphics.stroke({ color: bodyColor, width: 2 * scale });
        // Tail tuft
        graphics.ellipse(tailX, y + 6 * scale, 2 * scale, 4 * scale);
        graphics.fill(headColor);

        // Back legs (sturdy)
        graphics.rect(x - 10 * scale * facing - 3 * scale, y - 4 + legSwing, 6 * scale, 10 * scale);
        graphics.fill(bodyColor);
        // Hooves
        graphics.rect(x - 10 * scale * facing - 3 * scale, y + 5 + legSwing, 6 * scale, 3 * scale);
        graphics.fill(0x1a1a1a);

        // Hindquarters
        graphics.ellipse(x - 6 * scale * facing, y - 6 * scale, 12 * scale, 10 * scale);
        graphics.fill(bodyColor);

        // Main body
        graphics.ellipse(x + 2 * scale * facing, y - 8 * scale, 14 * scale, 12 * scale);
        graphics.fill(bodyColor);

        // Front legs
        graphics.rect(x + 8 * scale * facing - 3 * scale, y - 4 - legSwing, 6 * scale, 10 * scale);
        graphics.fill(bodyColor);
        // Hooves
        graphics.rect(x + 8 * scale * facing - 3 * scale, y + 5 - legSwing, 6 * scale, 3 * scale);
        graphics.fill(0x1a1a1a);

        // Shoulder hump (distinctive bison feature)
        graphics.ellipse(x + 6 * scale * facing, y - 16 * scale, 10 * scale, 10 * scale);
        graphics.fill(bodyColor);

        // Shaggy fur on hump and shoulders
        for (let i = 0; i < 12; i++) {
            const fx = x + (2 + seededRandom(i) * 10) * scale * facing;
            const fy = y - 12 * scale - seededRandom(i + 10) * 10 * scale;
            const furLength = (3 + seededRandom(i + 20) * 4) * scale;
            graphics.moveTo(fx, fy);
            graphics.lineTo(fx + (seededRandom(i + 30) - 0.5) * 3, fy + furLength);
            graphics.stroke({ color: this.blendColors(bodyColor, 0x000000, seededRandom(i + 40) * 0.3), width: 1.5 });
        }

        // Chest fur (shaggy beard area)
        graphics.ellipse(x + 12 * scale * facing, y - 4 * scale, 6 * scale, 8 * scale);
        graphics.fill(headColor);
        // Beard fur strands
        for (let i = 0; i < 6; i++) {
            const bx = x + (10 + seededRandom(i + 50) * 4) * scale * facing;
            const by = y - 2 * scale + seededRandom(i + 51) * 4 * scale;
            graphics.moveTo(bx, by);
            graphics.lineTo(bx, by + 4 * scale);
            graphics.stroke({ color: headColor, width: 1 });
        }

        // Head
        const headX = x + 16 * scale * facing;
        const headY = y - 8 * scale;
        graphics.ellipse(headX, headY, 8 * scale, 7 * scale);
        graphics.fill(headColor);

        // Forehead fur
        graphics.ellipse(headX - 2 * scale * facing, headY - 4 * scale, 6 * scale, 4 * scale);
        graphics.fill(headColor);

        // Horns (curved)
        // Left horn
        graphics.moveTo(headX - 4 * scale * facing, headY - 5 * scale);
        graphics.quadraticCurveTo(
            headX - 8 * scale * facing, headY - 10 * scale,
            headX - 6 * scale * facing, headY - 12 * scale
        );
        graphics.stroke({ color: hornColor, width: 3 * scale });
        // Horn tip
        graphics.circle(headX - 6 * scale * facing, headY - 12 * scale, 1.5 * scale);
        graphics.fill(0x3a3a3a);

        // Right horn (appears smaller due to perspective when facing)
        graphics.moveTo(headX + 2 * scale * facing, headY - 5 * scale);
        graphics.quadraticCurveTo(
            headX + 6 * scale * facing, headY - 9 * scale,
            headX + 4 * scale * facing, headY - 11 * scale
        );
        graphics.stroke({ color: hornColor, width: 2.5 * scale });
        graphics.circle(headX + 4 * scale * facing, headY - 11 * scale, 1.2 * scale);
        graphics.fill(0x3a3a3a);

        // Snout/muzzle
        graphics.ellipse(headX + 6 * scale * facing, headY + 2 * scale, 4 * scale, 3 * scale);
        graphics.fill(0x3d2a1a);

        // Nostrils
        graphics.circle(headX + 7 * scale * facing, headY + 2 * scale, 1 * scale);
        graphics.fill(0x1a1a1a);

        // Eye
        graphics.ellipse(headX + scale * facing, headY - scale, 2 * scale, 1.5 * scale);
        graphics.fill(0x1a1a1a);
        graphics.circle(headX + 1.2 * scale * facing, headY - 1.2 * scale, 0.5 * scale);
        graphics.fill(0x4a3020);

        // Ear (small, hidden in fur)
        graphics.ellipse(headX - 5 * scale * facing, headY - 2 * scale, 2 * scale, 3 * scale);
        graphics.fill(headColor);
    }

    /**
     * Draw a generic animal
     */
    private drawGenericAnimal(
        graphics: Graphics, x: number, y: number,
        bodyColor: number, headColor: number,
        facing: number, scale: number, legSwing: number
    ): void {
        // Shadow
        graphics.ellipse(x, y + 4, 12 * scale, 6 * scale);
        graphics.fill({ color: 0x000000, alpha: 0.2 });

        // Tail
        const tailX = x - 12 * scale * facing;
        graphics.ellipse(tailX, y - 4 * scale, 4 * scale, 2 * scale);
        graphics.fill(bodyColor);

        // Back legs
        graphics.ellipse(x - 5 * scale * facing, y, 3 * scale, 5 * scale);
        graphics.fill(this.blendColors(bodyColor, 0x000000, 0.1));

        // Body
        graphics.ellipse(x, y - 8 * scale, 14 * scale, 10 * scale);
        graphics.fill(bodyColor);

        // Front legs
        graphics.ellipse(x + 7 * scale * facing, y - legSwing, 3 * scale, 5 * scale);
        graphics.fill(this.blendColors(bodyColor, 0x000000, 0.1));

        // Head
        const headOffsetX = 12 * scale * facing;
        graphics.circle(x + headOffsetX, y - 12 * scale, 7 * scale);
        graphics.fill(headColor);

        // Ears
        graphics.ellipse(x + headOffsetX - 4 * scale * facing, y - 18 * scale, 2 * scale, 3 * scale);
        graphics.fill(headColor);
        graphics.ellipse(x + headOffsetX + 3 * scale * facing, y - 17 * scale, 2 * scale, 3 * scale);
        graphics.fill(headColor);

        // Eyes
        graphics.circle(x + headOffsetX + 2 * scale * facing, y - 13 * scale, 2 * scale);
        graphics.fill(0xffffff);
        graphics.circle(x + headOffsetX + 2.5 * scale * facing, y - 13 * scale, 1 * scale);
        graphics.fill(0x000000);

        // Nose
        graphics.ellipse(x + headOffsetX + 5 * scale * facing, y - 11 * scale, 2 * scale, 1.5 * scale);
        graphics.fill(0x333333);
    }

    /**
     * Draw a staff member
     */
    private drawStaff(graphics: Graphics, x: number, y: number, staff: any): void {
        const worldFacing = staff.facingX || 1;
        const facing = this.adjustFacingX(worldFacing);

        // Shadow
        graphics.ellipse(x, y + 4, 8, 4);
        graphics.fill({ color: 0x000000, alpha: 0.2 });

        // Body (green uniform)
        graphics.rect(x - 6, y - 20, 12, 18);
        graphics.fill(0x2E7D32);

        // Head
        graphics.circle(x, y - 26, 6);
        graphics.fill(0xFFDDB4);

        // Hat
        graphics.rect(x - 6, y - 34, 12, 4);
        graphics.fill(0x1B5E20);

        // Face direction indicator (nose/eye)
        graphics.circle(x + 3 * facing, y - 27, 1.5);
        graphics.fill(0x000000);
    }

    /**
     * Draw a guest with walking animation
     */
    private drawGuest(graphics: Graphics, x: number, y: number, guest: any): void {
        const worldFacing = guest.facingX || 1;
        const facing = this.adjustFacingX(worldFacing);
        const isMoving = guest.isMoving || false;
        const animTimer = guest.animTimer || 0;

        // Animation values (only when moving)
        const walkCycle = isMoving ? Math.sin(animTimer) : 0;
        const bodyBob = isMoving ? Math.abs(Math.sin(animTimer * 2)) * 2 : 0;
        const legSwing = walkCycle * 3;

        // Shadow
        graphics.ellipse(x, y + 4, 6, 3);
        graphics.fill({ color: 0x000000, alpha: 0.2 });

        // Left leg
        graphics.rect(x - 4, y - 10 + legSwing, 3, 10);
        graphics.fill(guest.pantsColor || 0x2d3436);

        // Right leg
        graphics.rect(x + 1, y - 10 - legSwing, 3, 10);
        graphics.fill(guest.pantsColor || 0x2d3436);

        // Shirt/body (with bob)
        graphics.rect(x - 5, y - 18 - bodyBob, 10, 10);
        graphics.fill(guest.shirtColor || 0x4ecdc4);

        // Arms (swing opposite to legs)
        const armSwing = isMoving ? walkCycle * 2 : 0;
        // Left arm
        graphics.rect(x - 7, y - 16 - bodyBob - armSwing, 3, 6);
        graphics.fill(guest.shirtColor || 0x4ecdc4);
        // Right arm
        graphics.rect(x + 4, y - 16 - bodyBob + armSwing, 3, 6);
        graphics.fill(guest.shirtColor || 0x4ecdc4);

        // Head (with bob)
        graphics.circle(x, y - 23 - bodyBob, 5);
        graphics.fill(guest.skinColor || 0xffeaa7);

        // Hair (on top of head)
        graphics.ellipse(x, y - 27 - bodyBob, 5, 3);
        graphics.fill(guest.hairColor || 0x3b2219);

        // Face direction (eye)
        graphics.circle(x + 2 * facing, y - 24 - bodyBob, 1);
        graphics.fill(0x000000);

        // Food emoji above head when eating
        const foodEmoji = guest.getFoodEmoji?.();
        if (foodEmoji && (guest.state === 'eating' || guest.state === 'eating_walking' || guest.state === 'seeking_seat')) {
            this.drawTextAbove(graphics, x, y - 35 - bodyBob, foodEmoji);
        }
    }

    /**
     * Draw text/emoji above an entity
     */
    private drawTextAbove(graphics: Graphics, x: number, y: number, text: string): void {
        // Draw a small white background circle for the emoji
        graphics.circle(x, y, 8);
        graphics.fill({ color: 0xffffff, alpha: 0.9 });
        graphics.stroke({ color: 0x000000, alpha: 0.3, width: 1 });

        // We can't draw actual text with Graphics, so we'll use a colored circle as placeholder
        // The actual emoji rendering would need a Text or BitmapText object
        // For now, let's draw a simple food indicator
        graphics.circle(x, y, 5);
        graphics.fill(0xFFD700);  // Gold color for food
    }

    /**
     * Draw foliage with detailed textures
     */
    private drawFoliage(graphics: Graphics, x: number, y: number, foliage: any): void {
        const scale = foliage.scale || 1;

        // Seeded random for consistent details per foliage instance
        const seed = foliage.id * 12345;
        const seededRandom = (offset: number) => {
            const val = Math.sin(seed + offset) * 43758.5453;
            return val - Math.floor(val);
        };

        switch (foliage.foliageType) {
            case 'acacia': {
                // Shadow
                graphics.ellipse(x, y + 5, 28 * scale, 12 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Main trunk with bark texture
                const trunkWidth = 8 * scale;
                const trunkHeight = 45 * scale;
                graphics.rect(x - trunkWidth / 2, y - 40 * scale, trunkWidth, trunkHeight);
                graphics.fill(0x5D4037);

                // Bark texture lines
                for (let i = 0; i < 4; i++) {
                    const barkY = y - 35 * scale + i * 10 * scale;
                    graphics.moveTo(x - 3 * scale, barkY);
                    graphics.lineTo(x + 2 * scale, barkY + 3);
                    graphics.stroke({ color: 0x4a3328, width: 1, alpha: 0.6 });
                }

                // Branches extending outward
                const branchY = y - 42 * scale;
                // Left branch
                graphics.moveTo(x - 2 * scale, branchY);
                graphics.lineTo(x - 18 * scale, branchY - 8 * scale);
                graphics.stroke({ color: 0x5D4037, width: 3 * scale });
                // Right branch
                graphics.moveTo(x + 2 * scale, branchY);
                graphics.lineTo(x + 20 * scale, branchY - 6 * scale);
                graphics.stroke({ color: 0x5D4037, width: 3 * scale });

                // Main canopy (flat acacia shape)
                graphics.ellipse(x, y - 55 * scale, 32 * scale, 12 * scale);
                graphics.fill(0x3a6013);

                // Leaf clusters on canopy
                const leafColors = [0x4A7023, 0x5a8033, 0x3a6013];
                for (let i = 0; i < 8; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 50 * scale;
                    const ly = y - 55 * scale + (seededRandom(i + 10) - 0.5) * 16 * scale;
                    const lsize = (4 + seededRandom(i + 20) * 6) * scale;
                    const colorIdx = Math.floor(seededRandom(i + 30) * leafColors.length);
                    graphics.ellipse(lx, ly, lsize, lsize * 0.6);
                    graphics.fill(leafColors[colorIdx]);
                }

                // Highlight on top
                graphics.ellipse(x - 5 * scale, y - 58 * scale, 15 * scale, 5 * scale);
                graphics.fill({ color: 0x6a9043, alpha: 0.5 });
                break;
            }

            case 'tall_grass':
            case 'prairie_grass': {
                // Shadow
                graphics.ellipse(x, y + 3, 16 * scale, 6 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.15 });

                const isPrairie = foliage.foliageType === 'prairie_grass';
                const baseColor = isPrairie ? 0x7cb342 : 0xC4A747;
                const tipColor = isPrairie ? 0x9cd362 : 0xd4b757;
                const numBlades = 8 + Math.floor(seededRandom(0) * 4);

                // Draw grass blades with varying heights and curves
                for (let i = 0; i < numBlades; i++) {
                    const spreadX = (seededRandom(i * 2) - 0.5) * 16;
                    const bx = x + spreadX;
                    const height = (18 + seededRandom(i + 100) * 12) * scale;
                    const curve = (seededRandom(i + 50) - 0.5) * 6;
                    const shade = seededRandom(i + 200) > 0.5 ? baseColor : tipColor;

                    // Curved blade
                    graphics.moveTo(bx - 1, y);
                    graphics.quadraticCurveTo(bx + curve, y - height * 0.6, bx + curve * 1.5, y - height);
                    graphics.lineTo(bx + curve * 1.5 + 1, y - height + 2);
                    graphics.quadraticCurveTo(bx + curve + 1, y - height * 0.6, bx + 1, y);
                    graphics.fill(shade);
                }

                // Seed heads on some blades (for tall grass)
                if (!isPrairie) {
                    for (let i = 0; i < 3; i++) {
                        const spreadX = (seededRandom(i * 3 + 300) - 0.5) * 12;
                        const height = (22 + seededRandom(i + 400) * 8) * scale;
                        graphics.ellipse(x + spreadX, y - height, 2 * scale, 4 * scale);
                        graphics.fill(0xb89737);
                    }
                }
                break;
            }

            case 'shrub': {
                // Shadow
                graphics.ellipse(x, y + 4, 20 * scale, 8 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Base bush shape (darker underneath)
                graphics.ellipse(x, y - 10 * scale, 22 * scale, 18 * scale);
                graphics.fill(0x3a5c13);

                // Leaf clusters for texture
                const leafColors = [0x4a7c23, 0x5a8c33, 0x3a6c13, 0x4a8c23];
                for (let i = 0; i < 12; i++) {
                    const angle = (i / 12) * Math.PI * 2;
                    const dist = 8 + seededRandom(i) * 10;
                    const lx = x + Math.cos(angle) * dist * scale;
                    const ly = y - 10 * scale + Math.sin(angle) * dist * 0.7 * scale;
                    const lsize = (5 + seededRandom(i + 50) * 4) * scale;
                    const colorIdx = Math.floor(seededRandom(i + 100) * leafColors.length);

                    graphics.ellipse(lx, ly, lsize, lsize * 0.7);
                    graphics.fill(leafColors[colorIdx]);
                }

                // Top highlight
                graphics.ellipse(x - 3 * scale, y - 18 * scale, 10 * scale, 6 * scale);
                graphics.fill({ color: 0x6a9c43, alpha: 0.6 });

                // Berries (randomly some shrubs have them)
                if (seededRandom(999) > 0.6) {
                    const berryColor = seededRandom(998) > 0.5 ? 0xcc3333 : 0x6633aa;
                    for (let i = 0; i < 4; i++) {
                        const bx = x + (seededRandom(i + 500) - 0.5) * 20 * scale;
                        const by = y - 8 * scale + (seededRandom(i + 501) - 0.5) * 12 * scale;
                        graphics.circle(bx, by, 2 * scale);
                        graphics.fill(berryColor);
                    }
                }
                break;
            }

            case 'wildflowers': {
                // Shadow
                graphics.ellipse(x, y + 2, 14 * scale, 5 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.1 });

                // Green foliage base
                for (let i = 0; i < 5; i++) {
                    const lx = x + (seededRandom(i + 600) - 0.5) * 16;
                    const ly = y - 2 + seededRandom(i + 601) * 4;
                    graphics.ellipse(lx, ly, 4 * scale, 2 * scale);
                    graphics.fill(0x4a7c23);
                }

                // Flower stems and blooms
                const flowerColors = [0xe91e63, 0x9c27b0, 0xffeb3b, 0xff9800, 0xffffff, 0xff6b6b, 0x64b5f6];
                const numFlowers = 5 + Math.floor(seededRandom(0) * 3);

                for (let i = 0; i < numFlowers; i++) {
                    const fx = x + (seededRandom(i * 2) - 0.5) * 18;
                    const stemHeight = (8 + seededRandom(i + 100) * 10) * scale;
                    const fy = y - stemHeight;
                    const colorIdx = Math.floor(seededRandom(i + 200) * flowerColors.length);
                    const flowerSize = (2.5 + seededRandom(i + 300) * 1.5) * scale;

                    // Stem
                    graphics.moveTo(fx, y - 2);
                    graphics.lineTo(fx + (seededRandom(i + 400) - 0.5) * 3, fy + flowerSize);
                    graphics.stroke({ color: 0x3a6c13, width: 1 });

                    // Flower petals
                    const petalCount = 4 + Math.floor(seededRandom(i + 500) * 3);
                    for (let p = 0; p < petalCount; p++) {
                        const angle = (p / petalCount) * Math.PI * 2;
                        const px = fx + Math.cos(angle) * flowerSize * 0.8;
                        const py = fy + Math.sin(angle) * flowerSize * 0.5;
                        graphics.ellipse(px, py, flowerSize * 0.6, flowerSize * 0.4);
                        graphics.fill(flowerColors[colorIdx]);
                    }

                    // Flower center
                    graphics.circle(fx, fy, flowerSize * 0.4);
                    graphics.fill(0xffcc00);
                }
                break;
            }

            case 'thorn_bush': {
                // Shadow
                graphics.ellipse(x, y + 3, 14 * scale, 6 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.15 });

                // Main bush shape - gray-green spiny appearance
                graphics.ellipse(x, y - 6 * scale, 16 * scale, 12 * scale);
                graphics.fill(0x5a6b4a);

                // Spiny texture clusters
                const spineColors = [0x4a5b3a, 0x6a7b5a, 0x5a6b4a];
                for (let i = 0; i < 10; i++) {
                    const angle = (i / 10) * Math.PI * 2;
                    const dist = 6 + seededRandom(i) * 8;
                    const sx = x + Math.cos(angle) * dist * scale;
                    const sy = y - 6 * scale + Math.sin(angle) * dist * 0.6 * scale;
                    const colorIdx = Math.floor(seededRandom(i + 50) * spineColors.length);
                    graphics.ellipse(sx, sy, 4 * scale, 3 * scale);
                    graphics.fill(spineColors[colorIdx]);
                }

                // Thorns/spines sticking out
                for (let i = 0; i < 8; i++) {
                    const angle = seededRandom(i + 100) * Math.PI * 2;
                    const dist = 12 + seededRandom(i + 101) * 4;
                    const tx = x + Math.cos(angle) * dist * scale;
                    const ty = y - 6 * scale + Math.sin(angle) * dist * 0.5 * scale;
                    graphics.moveTo(x + Math.cos(angle) * 8 * scale, y - 6 * scale + Math.sin(angle) * 4 * scale);
                    graphics.lineTo(tx, ty);
                    graphics.stroke({ color: 0x3a3a2a, width: 1 });
                }
                break;
            }

            case 'senegal_date_palm': {
                // Shadow
                graphics.ellipse(x, y + 5, 20 * scale, 8 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk - slender brown
                const trunkHeight = 50 * scale;
                graphics.rect(x - 3 * scale, y - trunkHeight + 10, 6 * scale, trunkHeight);
                graphics.fill(0x6b4423);

                // Trunk texture rings
                for (let i = 0; i < 6; i++) {
                    const ringY = y - 5 * scale - i * 8 * scale;
                    graphics.moveTo(x - 3 * scale, ringY);
                    graphics.lineTo(x + 3 * scale, ringY);
                    graphics.stroke({ color: 0x5a3318, width: 1, alpha: 0.5 });
                }

                // Feathery fronds
                const frondCount = 7;
                for (let i = 0; i < frondCount; i++) {
                    const angle = (i / frondCount) * Math.PI * 2 - Math.PI / 2;
                    const frondLen = 22 * scale;
                    const endX = x + Math.cos(angle) * frondLen;
                    const endY = y - trunkHeight + 5 + Math.sin(angle) * frondLen * 0.4;

                    // Frond stem
                    graphics.moveTo(x, y - trunkHeight + 8);
                    graphics.lineTo(endX, endY);
                    graphics.stroke({ color: 0x3a5a2a, width: 2 * scale });

                    // Leaflets along frond
                    for (let j = 0; j < 5; j++) {
                        const t = 0.3 + j * 0.15;
                        const lx = x + (endX - x) * t;
                        const ly = (y - trunkHeight + 8) + (endY - (y - trunkHeight + 8)) * t;
                        const leafAngle = angle + Math.PI / 2;
                        graphics.moveTo(lx, ly);
                        graphics.lineTo(lx + Math.cos(leafAngle) * 4 * scale, ly + Math.sin(leafAngle) * 2 * scale);
                        graphics.lineTo(lx - Math.cos(leafAngle) * 4 * scale, ly - Math.sin(leafAngle) * 2 * scale);
                        graphics.stroke({ color: 0x4a7a3a, width: 1 });
                    }
                }
                break;
            }

            case 'acacia_caffra': {
                // Hook-thorn acacia - rounded crown
                // Shadow
                graphics.ellipse(x, y + 5, 26 * scale, 10 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                graphics.rect(x - 4 * scale, y - 35 * scale, 8 * scale, 40 * scale);
                graphics.fill(0x5D4037);

                // Hook-like thorns on trunk
                for (let i = 0; i < 4; i++) {
                    const ty = y - 10 * scale - i * 8 * scale;
                    graphics.moveTo(x - 4 * scale, ty);
                    graphics.quadraticCurveTo(x - 10 * scale, ty - 3, x - 8 * scale, ty + 4);
                    graphics.stroke({ color: 0x4a3328, width: 1.5 });
                    graphics.moveTo(x + 4 * scale, ty + 4);
                    graphics.quadraticCurveTo(x + 10 * scale, ty + 1, x + 8 * scale, ty + 8);
                    graphics.stroke({ color: 0x4a3328, width: 1.5 });
                }

                // Rounded crown
                graphics.ellipse(x, y - 48 * scale, 28 * scale, 20 * scale);
                graphics.fill(0x3a6613);

                // Leaf clusters
                const leafColors = [0x4a7623, 0x5a8633, 0x3a6013];
                for (let i = 0; i < 10; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 48 * scale;
                    const ly = y - 48 * scale + (seededRandom(i + 10) - 0.5) * 32 * scale;
                    const lsize = (5 + seededRandom(i + 20) * 5) * scale;
                    const colorIdx = Math.floor(seededRandom(i + 30) * leafColors.length);
                    graphics.ellipse(lx, ly, lsize, lsize * 0.7);
                    graphics.fill(leafColors[colorIdx]);
                }
                break;
            }

            case 'thorn_acacia': {
                // White-barked thorny acacia
                // Shadow
                graphics.ellipse(x, y + 5, 24 * scale, 10 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Pale/white trunk
                graphics.rect(x - 4 * scale, y - 38 * scale, 8 * scale, 43 * scale);
                graphics.fill(0xd4c8b8);

                // Bark texture - pale gray lines
                for (let i = 0; i < 5; i++) {
                    const barkY = y - 30 * scale + i * 8 * scale;
                    graphics.moveTo(x - 3 * scale, barkY);
                    graphics.lineTo(x + 2 * scale, barkY + 2);
                    graphics.stroke({ color: 0xbab0a0, width: 1, alpha: 0.6 });
                }

                // Long paired thorns
                for (let i = 0; i < 3; i++) {
                    const ty = y - 15 * scale - i * 10 * scale;
                    // Left thorn
                    graphics.moveTo(x - 4 * scale, ty);
                    graphics.lineTo(x - 14 * scale, ty - 2);
                    graphics.stroke({ color: 0xe8e0d0, width: 1.5 });
                    // Right thorn
                    graphics.moveTo(x + 4 * scale, ty);
                    graphics.lineTo(x + 14 * scale, ty - 2);
                    graphics.stroke({ color: 0xe8e0d0, width: 1.5 });
                }

                // Crown
                graphics.ellipse(x, y - 52 * scale, 26 * scale, 16 * scale);
                graphics.fill(0x3a6613);

                // Leaf texture
                for (let i = 0; i < 8; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 44 * scale;
                    const ly = y - 52 * scale + (seededRandom(i + 10) - 0.5) * 26 * scale;
                    graphics.ellipse(lx, ly, 5 * scale, 3 * scale);
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x4a7623 : 0x5a8633);
                }
                break;
            }

            case 'yellow_fever_tree': {
                // Striking yellow-green bark
                // Shadow
                graphics.ellipse(x, y + 5, 28 * scale, 12 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Yellow-green trunk
                graphics.rect(x - 5 * scale, y - 45 * scale, 10 * scale, 50 * scale);
                graphics.fill(0xc4b82a);

                // Trunk texture - greenish streaks
                for (let i = 0; i < 6; i++) {
                    const barkY = y - 35 * scale + i * 8 * scale;
                    graphics.moveTo(x - 4 * scale, barkY);
                    graphics.lineTo(x + 3 * scale, barkY + 3);
                    graphics.stroke({ color: 0x9a9820, width: 2, alpha: 0.4 });
                }

                // Branches
                graphics.moveTo(x - 3 * scale, y - 42 * scale);
                graphics.lineTo(x - 18 * scale, y - 52 * scale);
                graphics.stroke({ color: 0xb4a825, width: 3 * scale });
                graphics.moveTo(x + 3 * scale, y - 40 * scale);
                graphics.lineTo(x + 20 * scale, y - 48 * scale);
                graphics.stroke({ color: 0xb4a825, width: 3 * scale });

                // Feathery crown
                graphics.ellipse(x, y - 58 * scale, 30 * scale, 14 * scale);
                graphics.fill(0x4a7a23);

                // Light leaf clusters
                for (let i = 0; i < 12; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 54 * scale;
                    const ly = y - 58 * scale + (seededRandom(i + 10) - 0.5) * 22 * scale;
                    const lsize = (4 + seededRandom(i + 20) * 4) * scale;
                    graphics.ellipse(lx, ly, lsize, lsize * 0.5);
                    graphics.fill(seededRandom(i + 30) > 0.5 ? 0x5a8a33 : 0x6a9a43);
                }
                break;
            }

            case 'umbrella_thorn': {
                // Iconic flat-topped African acacia
                // Shadow
                graphics.ellipse(x, y + 5, 35 * scale, 14 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                graphics.rect(x - 4 * scale, y - 40 * scale, 8 * scale, 45 * scale);
                graphics.fill(0x5D4037);

                // Main branches spreading out
                const branchY = y - 42 * scale;
                graphics.moveTo(x - 2 * scale, branchY);
                graphics.lineTo(x - 28 * scale, branchY - 8 * scale);
                graphics.stroke({ color: 0x5D4037, width: 4 * scale });
                graphics.moveTo(x + 2 * scale, branchY);
                graphics.lineTo(x + 30 * scale, branchY - 6 * scale);
                graphics.stroke({ color: 0x5D4037, width: 4 * scale });

                // Flat-topped canopy (the signature umbrella shape)
                graphics.ellipse(x, y - 55 * scale, 38 * scale, 10 * scale);
                graphics.fill(0x3a6013);

                // Top surface detail
                graphics.ellipse(x, y - 58 * scale, 35 * scale, 8 * scale);
                graphics.fill(0x4a7023);

                // Leaf clusters on canopy
                for (let i = 0; i < 14; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 68 * scale;
                    const ly = y - 55 * scale + (seededRandom(i + 10) - 0.5) * 14 * scale;
                    const lsize = (4 + seededRandom(i + 20) * 5) * scale;
                    graphics.ellipse(lx, ly, lsize, lsize * 0.4);
                    graphics.fill(seededRandom(i + 30) > 0.5 ? 0x5a8033 : 0x4a7023);
                }

                // Highlight on top
                graphics.ellipse(x - 8 * scale, y - 60 * scale, 18 * scale, 4 * scale);
                graphics.fill({ color: 0x6a9043, alpha: 0.4 });
                break;
            }

            case 'baobab': {
                // Massive swollen trunk, small crown
                // Large shadow
                graphics.ellipse(x, y + 8, 30 * scale, 14 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.25 });

                // Massive swollen trunk
                const trunkW = 24 * scale;
                const trunkH = 50 * scale;
                // Draw swollen trunk shape
                graphics.moveTo(x - trunkW / 2, y);
                graphics.quadraticCurveTo(x - trunkW * 0.7, y - trunkH * 0.5, x - trunkW * 0.3, y - trunkH);
                graphics.lineTo(x + trunkW * 0.3, y - trunkH);
                graphics.quadraticCurveTo(x + trunkW * 0.7, y - trunkH * 0.5, x + trunkW / 2, y);
                graphics.fill(0x8b8078);

                // Bark texture - vertical lines
                for (let i = 0; i < 6; i++) {
                    const bx = x - 10 * scale + i * 4 * scale;
                    graphics.moveTo(bx, y - 5);
                    graphics.lineTo(bx + seededRandom(i) * 2, y - 45 * scale);
                    graphics.stroke({ color: 0x6b6058, width: 1, alpha: 0.5 });
                }

                // Small stubby branches at top
                for (let i = 0; i < 5; i++) {
                    const angle = -Math.PI / 2 + (i - 2) * 0.4;
                    const blen = 12 * scale;
                    graphics.moveTo(x + (i - 2) * 4 * scale, y - trunkH);
                    graphics.lineTo(
                        x + (i - 2) * 4 * scale + Math.cos(angle) * blen,
                        y - trunkH + Math.sin(angle) * blen
                    );
                    graphics.stroke({ color: 0x7b7068, width: 3 * scale });
                }

                // Small crown (baobabs have tiny crowns relative to trunk)
                graphics.ellipse(x, y - trunkH - 8 * scale, 22 * scale, 10 * scale);
                graphics.fill(0x4a6a23);

                // Sparse leaves
                for (let i = 0; i < 6; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 36 * scale;
                    const ly = y - trunkH - 8 * scale + (seededRandom(i + 10) - 0.5) * 14 * scale;
                    graphics.ellipse(lx, ly, 4 * scale, 3 * scale);
                    graphics.fill(0x5a7a33);
                }
                break;
            }

            case 'khejri': {
                // Hardy sparse desert tree
                // Shadow
                graphics.ellipse(x, y + 4, 22 * scale, 9 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Gnarled trunk
                graphics.moveTo(x - 4 * scale, y);
                graphics.quadraticCurveTo(x - 6 * scale, y - 20 * scale, x - 2 * scale, y - 38 * scale);
                graphics.lineTo(x + 2 * scale, y - 38 * scale);
                graphics.quadraticCurveTo(x + 6 * scale, y - 20 * scale, x + 4 * scale, y);
                graphics.fill(0x5a4a3a);

                // Thorny branches
                for (let i = 0; i < 4; i++) {
                    const by = y - 20 * scale - i * 6 * scale;
                    const side = i % 2 === 0 ? -1 : 1;
                    graphics.moveTo(x, by);
                    graphics.lineTo(x + side * 16 * scale, by - 8 * scale);
                    graphics.stroke({ color: 0x5a4a3a, width: 2 * scale });
                    // Small thorns
                    graphics.moveTo(x + side * 8 * scale, by - 4 * scale);
                    graphics.lineTo(x + side * 12 * scale, by - 2 * scale);
                    graphics.stroke({ color: 0x4a3a2a, width: 1 });
                }

                // Sparse feathery crown
                graphics.ellipse(x, y - 45 * scale, 24 * scale, 12 * scale);
                graphics.fill({ color: 0x4a6a23, alpha: 0.8 });

                // Small compound leaves
                for (let i = 0; i < 8; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 40 * scale;
                    const ly = y - 45 * scale + (seededRandom(i + 10) - 0.5) * 18 * scale;
                    graphics.ellipse(lx, ly, 3 * scale, 2 * scale);
                    graphics.fill(0x5a7a33);
                }
                break;
            }

            case 'sigillaria': {
                // Ancient Carboniferous tree-like plant
                // Shadow
                graphics.ellipse(x, y + 4, 18 * scale, 7 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Tall straight trunk with scale-like pattern
                const sigTrunkH = 55 * scale;
                graphics.rect(x - 5 * scale, y - sigTrunkH, 10 * scale, sigTrunkH);
                graphics.fill(0x4a5a3a);

                // Scale/diamond bark pattern
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 2; col++) {
                        const sx = x - 3 * scale + col * 6 * scale;
                        const sy = y - 8 * scale - row * 6 * scale;
                        graphics.rect(sx, sy, 4 * scale, 4 * scale);
                        graphics.stroke({ color: 0x3a4a2a, width: 1 });
                    }
                }

                // Crown - tuft of long strap-like leaves
                for (let i = 0; i < 10; i++) {
                    const angle = (i / 10) * Math.PI * 2;
                    const leafLen = 18 * scale;
                    const endX = x + Math.cos(angle) * leafLen;
                    const endY = y - sigTrunkH - 5 + Math.sin(angle) * leafLen * 0.3;
                    graphics.moveTo(x, y - sigTrunkH);
                    graphics.quadraticCurveTo(
                        x + Math.cos(angle) * leafLen * 0.5,
                        y - sigTrunkH - 3 + Math.sin(angle) * leafLen * 0.2,
                        endX,
                        endY
                    );
                    graphics.stroke({ color: 0x5a7a3a, width: 2 * scale });
                }
                break;
            }

            case 'grass_tree': {
                // Australian Xanthorrhoea - black trunk, grass-like spray
                // Shadow
                graphics.ellipse(x, y + 4, 16 * scale, 6 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Blackened trunk (from fire resistance)
                const grassTreeH = 35 * scale;
                graphics.rect(x - 4 * scale, y - grassTreeH, 8 * scale, grassTreeH);
                graphics.fill(0x2a2a2a);

                // Texture on trunk - rough
                for (let i = 0; i < 5; i++) {
                    const ty = y - 5 * scale - i * 6 * scale;
                    graphics.moveTo(x - 4 * scale, ty);
                    graphics.lineTo(x + 4 * scale, ty + seededRandom(i) * 2);
                    graphics.stroke({ color: 0x1a1a1a, width: 1 });
                }

                // Grass-like spray of leaves
                for (let i = 0; i < 16; i++) {
                    const angle = (i / 16) * Math.PI * 2;
                    const leafLen = (15 + seededRandom(i) * 10) * scale;
                    const droop = 0.3 + seededRandom(i + 10) * 0.2;
                    const endX = x + Math.cos(angle) * leafLen;
                    const endY = y - grassTreeH + Math.sin(angle) * leafLen * droop;

                    graphics.moveTo(x, y - grassTreeH);
                    graphics.quadraticCurveTo(
                        x + Math.cos(angle) * leafLen * 0.6,
                        y - grassTreeH + Math.sin(angle) * leafLen * droop * 0.3,
                        endX,
                        endY
                    );
                    graphics.stroke({ color: seededRandom(i + 20) > 0.5 ? 0x6a8a3a : 0x5a7a2a, width: 1.5 });
                }

                // Flower spike (sometimes)
                if (seededRandom(999) > 0.5) {
                    graphics.rect(x - 1.5 * scale, y - grassTreeH - 20 * scale, 3 * scale, 20 * scale);
                    graphics.fill(0x5a4a3a);
                    graphics.ellipse(x, y - grassTreeH - 22 * scale, 4 * scale, 8 * scale);
                    graphics.fill(0xe8e0b0);
                }
                break;
            }

            case 'red_gum': {
                // Large eucalyptus with smooth multicolored bark
                // Shadow
                graphics.ellipse(x, y + 6, 32 * scale, 13 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Smooth trunk - patches of cream, pink, gray
                const redGumH = 55 * scale;
                graphics.rect(x - 6 * scale, y - redGumH, 12 * scale, redGumH);
                graphics.fill(0xc8b8a8);

                // Bark color patches
                const barkColors = [0xe8d8c8, 0xd8a8a0, 0xb8a898, 0xc8c0b0];
                for (let i = 0; i < 8; i++) {
                    const px = x - 5 * scale + seededRandom(i) * 8 * scale;
                    const py = y - 10 * scale - seededRandom(i + 10) * 40 * scale;
                    const pw = (3 + seededRandom(i + 20) * 4) * scale;
                    const ph = (5 + seededRandom(i + 30) * 8) * scale;
                    const colorIdx = Math.floor(seededRandom(i + 40) * barkColors.length);
                    graphics.rect(px, py, pw, ph);
                    graphics.fill(barkColors[colorIdx]);
                }

                // Wide spreading crown
                graphics.ellipse(x, y - redGumH - 5 * scale, 35 * scale, 22 * scale);
                graphics.fill(0x3a5a23);

                // Hanging eucalyptus leaves
                for (let i = 0; i < 14; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 60 * scale;
                    const ly = y - redGumH - 5 * scale + (seededRandom(i + 10) - 0.5) * 36 * scale;
                    // Sickle-shaped leaves
                    graphics.ellipse(lx, ly, 6 * scale, 2 * scale);
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x4a6a33 : 0x5a7a43);
                }
                break;
            }

            case 'hard_quandong': {
                // Australian native with drooping foliage
                // Shadow
                graphics.ellipse(x, y + 5, 24 * scale, 10 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                const quandongH = 45 * scale;
                graphics.rect(x - 4 * scale, y - quandongH, 8 * scale, quandongH);
                graphics.fill(0x5a4a3a);

                // Branches
                graphics.moveTo(x - 2 * scale, y - quandongH + 8);
                graphics.lineTo(x - 16 * scale, y - quandongH - 6 * scale);
                graphics.stroke({ color: 0x5a4a3a, width: 3 * scale });
                graphics.moveTo(x + 2 * scale, y - quandongH + 10);
                graphics.lineTo(x + 18 * scale, y - quandongH - 4 * scale);
                graphics.stroke({ color: 0x5a4a3a, width: 3 * scale });

                // Drooping crown
                graphics.ellipse(x, y - quandongH - 8 * scale, 28 * scale, 18 * scale);
                graphics.fill(0x3a5a2a);

                // Drooping leaf clusters
                for (let i = 0; i < 10; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 48 * scale;
                    const ly = y - quandongH - 8 * scale + seededRandom(i + 10) * 20 * scale;
                    graphics.ellipse(lx, ly, 5 * scale, 8 * scale);
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x4a6a3a : 0x3a5a2a);
                }

                // Bright blue fruit (quandong fruit)
                if (seededRandom(888) > 0.4) {
                    for (let i = 0; i < 4; i++) {
                        const fx = x + (seededRandom(i + 500) - 0.5) * 30 * scale;
                        const fy = y - quandongH + seededRandom(i + 510) * 15 * scale;
                        graphics.circle(fx, fy, 2.5 * scale);
                        graphics.fill(0x4488cc);
                    }
                }
                break;
            }

            case 'eucalyptus': {
                // Tall aromatic eucalyptus
                // Shadow
                graphics.ellipse(x, y + 6, 26 * scale, 11 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Tall smooth trunk
                const eucH = 60 * scale;
                graphics.rect(x - 5 * scale, y - eucH, 10 * scale, eucH);
                graphics.fill(0xb8a898);

                // Peeling bark strips
                for (let i = 0; i < 4; i++) {
                    const stripY = y - 10 * scale - i * 12 * scale;
                    graphics.moveTo(x - 4 * scale, stripY);
                    graphics.quadraticCurveTo(x - 6 * scale, stripY - 6, x - 5 * scale, stripY - 10);
                    graphics.stroke({ color: 0xc8b8a0, width: 2, alpha: 0.6 });
                }

                // Crown - open and airy
                graphics.ellipse(x, y - eucH - 8 * scale, 28 * scale, 20 * scale);
                graphics.fill({ color: 0x4a6a33, alpha: 0.8 });

                // Hanging sickle-shaped leaves
                for (let i = 0; i < 16; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 50 * scale;
                    const ly = y - eucH - 8 * scale + (seededRandom(i + 10) - 0.5) * 35 * scale;
                    const angle = seededRandom(i + 20) * 0.5;
                    // Draw curved leaf
                    graphics.moveTo(lx - 4 * scale, ly);
                    graphics.quadraticCurveTo(lx, ly - 3 * scale * angle, lx + 4 * scale, ly);
                    graphics.stroke({ color: seededRandom(i + 30) > 0.5 ? 0x5a7a43 : 0x6a8a53, width: 2 });
                }

                // Gum nuts occasionally
                if (seededRandom(777) > 0.5) {
                    for (let i = 0; i < 3; i++) {
                        const nx = x + (seededRandom(i + 600) - 0.5) * 20 * scale;
                        const ny = y - eucH + 5 + seededRandom(i + 610) * 10 * scale;
                        graphics.circle(nx, ny, 2 * scale);
                        graphics.fill(0x5a4a3a);
                    }
                }
                break;
            }

            case 'broadleaf_bush': {
                // Dense bush with broad green leaves
                // Shadow
                graphics.ellipse(x, y + 4, 18 * scale, 7 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Main bush body
                graphics.ellipse(x, y - 10 * scale, 20 * scale, 16 * scale);
                graphics.fill(0x2d5a1e);

                // Broad leaf clusters
                const leafColors = [0x3d7a2e, 0x4d8a3e, 0x2d6a1e, 0x3d7028];
                for (let i = 0; i < 14; i++) {
                    const angle = (i / 14) * Math.PI * 2;
                    const dist = 8 + seededRandom(i) * 8;
                    const lx = x + Math.cos(angle) * dist * scale;
                    const ly = y - 10 * scale + Math.sin(angle) * dist * 0.7 * scale;
                    const leafW = (6 + seededRandom(i + 10) * 4) * scale;
                    const leafH = (4 + seededRandom(i + 20) * 3) * scale;
                    const colorIdx = Math.floor(seededRandom(i + 30) * leafColors.length);

                    // Broad oval leaves
                    graphics.ellipse(lx, ly, leafW, leafH);
                    graphics.fill(leafColors[colorIdx]);
                }

                // Leaf vein details on top leaves
                for (let i = 0; i < 5; i++) {
                    const lx = x + (seededRandom(i + 100) - 0.5) * 24 * scale;
                    const ly = y - 14 * scale + (seededRandom(i + 110) - 0.5) * 10 * scale;
                    graphics.moveTo(lx - 4 * scale, ly);
                    graphics.lineTo(lx + 4 * scale, ly);
                    graphics.stroke({ color: 0x1d4a0e, width: 0.5, alpha: 0.4 });
                }

                // Highlight
                graphics.ellipse(x - 4 * scale, y - 18 * scale, 8 * scale, 5 * scale);
                graphics.fill({ color: 0x5d9a4e, alpha: 0.4 });
                break;
            }

            case 'monkey_puzzle_tree': {
                // Ancient conifer with distinctive spiky branches
                // Shadow
                graphics.ellipse(x, y + 6, 24 * scale, 10 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk - tall and straight
                const mpH = 65 * scale;
                graphics.rect(x - 4 * scale, y - mpH + 15, 8 * scale, mpH - 10);
                graphics.fill(0x4a3a2a);

                // Bark texture
                for (let i = 0; i < 6; i++) {
                    const by = y - 10 * scale - i * 8 * scale;
                    graphics.moveTo(x - 3 * scale, by);
                    graphics.lineTo(x + 2 * scale, by + 2);
                    graphics.stroke({ color: 0x3a2a1a, width: 1, alpha: 0.5 });
                }

                // Distinctive tiered branches with spiky leaves
                // Monkey puzzle trees have whorls of branches at regular intervals
                const tiers = 5;
                for (let tier = 0; tier < tiers; tier++) {
                    const tierY = y - 20 * scale - tier * 10 * scale;
                    const tierWidth = (18 - tier * 2.5) * scale;
                    const branchCount = 6;

                    for (let b = 0; b < branchCount; b++) {
                        const angle = (b / branchCount) * Math.PI * 2 + tier * 0.3;
                        const bx = x + Math.cos(angle) * tierWidth;
                        const by = tierY + Math.sin(angle) * tierWidth * 0.3;

                        // Branch
                        graphics.moveTo(x, tierY);
                        graphics.lineTo(bx, by);
                        graphics.stroke({ color: 0x2a4a1a, width: 3 * scale });

                        // Spiky triangular leaves along branch
                        const leafCount = 4;
                        for (let l = 0; l < leafCount; l++) {
                            const t = 0.3 + l * 0.2;
                            const lx = x + (bx - x) * t;
                            const ly = tierY + (by - tierY) * t;

                            // Triangular spiky leaf
                            graphics.moveTo(lx, ly - 3 * scale);
                            graphics.lineTo(lx - 2 * scale, ly + 2 * scale);
                            graphics.lineTo(lx + 2 * scale, ly + 2 * scale);
                            graphics.closePath();
                            graphics.fill(0x2a5a1a);
                        }
                    }
                }

                // Top tuft
                graphics.moveTo(x, y - mpH + 5);
                graphics.lineTo(x - 6 * scale, y - mpH + 15);
                graphics.lineTo(x + 6 * scale, y - mpH + 15);
                graphics.closePath();
                graphics.fill(0x3a6a2a);

                // Additional top spikes
                for (let i = 0; i < 4; i++) {
                    const angle = (i / 4) * Math.PI * 2;
                    const tipX = x + Math.cos(angle) * 5 * scale;
                    const tipY = y - mpH + 8 + Math.sin(angle) * 3 * scale;
                    graphics.moveTo(x, y - mpH + 10);
                    graphics.lineTo(tipX, tipY);
                    graphics.stroke({ color: 0x2a5a1a, width: 2 * scale });
                }
                break;
            }

            case 'thornless_mesquite': {
                // Spreading shade tree with feathery foliage
                graphics.ellipse(x, y + 5, 24 * scale, 10 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Twisted trunk
                graphics.moveTo(x - 3 * scale, y);
                graphics.quadraticCurveTo(x - 5 * scale, y - 20 * scale, x, y - 40 * scale);
                graphics.lineTo(x + 4 * scale, y - 38 * scale);
                graphics.quadraticCurveTo(x + 2 * scale, y - 18 * scale, x + 3 * scale, y);
                graphics.fill(0x5a4030);

                // Spreading canopy
                graphics.ellipse(x - 12 * scale, y - 45 * scale, 18 * scale, 12 * scale);
                graphics.fill(0x3a6a2a);
                graphics.ellipse(x + 14 * scale, y - 42 * scale, 16 * scale, 10 * scale);
                graphics.fill(0x4a7a3a);
                graphics.ellipse(x, y - 50 * scale, 20 * scale, 14 * scale);
                graphics.fill(0x3a7030);

                // Feathery leaf texture
                for (let i = 0; i < 12; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 50 * scale;
                    const ly = y - 45 * scale + (seededRandom(i + 10) - 0.5) * 20 * scale;
                    graphics.ellipse(lx, ly, 3 * scale, 1.5 * scale);
                    graphics.fill(0x5a8a4a);
                }
                break;
            }

            case 'maple_tree': {
                // Classic maple with star-shaped leaves
                graphics.ellipse(x, y + 5, 28 * scale, 12 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                graphics.rect(x - 5 * scale, y - 45 * scale, 10 * scale, 50 * scale);
                graphics.fill(0x5a4a3a);

                // Rounded crown
                graphics.ellipse(x, y - 55 * scale, 30 * scale, 22 * scale);
                graphics.fill(0x2a6a1a);

                // Maple leaf clusters (mix of green and orange/red for fall color)
                const mapleColors = [0x3a7a2a, 0x4a8a3a, 0xc44a20, 0xd4642a];
                for (let i = 0; i < 16; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 55 * scale;
                    const ly = y - 55 * scale + (seededRandom(i + 10) - 0.5) * 38 * scale;
                    const colorIdx = Math.floor(seededRandom(i + 20) * mapleColors.length);
                    // Star-shaped leaf approximation
                    graphics.circle(lx, ly, 4 * scale);
                    graphics.fill(mapleColors[colorIdx]);
                }
                break;
            }

            case 'elm_tree': {
                // Vase-shaped canopy
                graphics.ellipse(x, y + 5, 26 * scale, 11 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                graphics.rect(x - 5 * scale, y - 48 * scale, 10 * scale, 53 * scale);
                graphics.fill(0x4a3a2a);

                // Vase-shaped crown (wider at top)
                graphics.moveTo(x - 8 * scale, y - 45 * scale);
                graphics.quadraticCurveTo(x - 30 * scale, y - 60 * scale, x - 25 * scale, y - 75 * scale);
                graphics.lineTo(x + 25 * scale, y - 75 * scale);
                graphics.quadraticCurveTo(x + 30 * scale, y - 60 * scale, x + 8 * scale, y - 45 * scale);
                graphics.fill(0x3a6a2a);

                // Leaf texture
                for (let i = 0; i < 14; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 45 * scale;
                    const ly = y - 60 * scale + (seededRandom(i + 10) - 0.5) * 25 * scale;
                    graphics.ellipse(lx, ly, 4 * scale, 2 * scale);
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x4a7a3a : 0x5a8a4a);
                }
                break;
            }

            case 'gingko_tree': {
                // Ancient tree with fan-shaped leaves
                graphics.ellipse(x, y + 5, 24 * scale, 10 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Straight trunk
                graphics.rect(x - 4 * scale, y - 50 * scale, 8 * scale, 55 * scale);
                graphics.fill(0x6a5a4a);

                // Conical crown
                graphics.moveTo(x, y - 70 * scale);
                graphics.lineTo(x - 22 * scale, y - 40 * scale);
                graphics.lineTo(x + 22 * scale, y - 40 * scale);
                graphics.closePath();
                graphics.fill(0x7a9a3a);

                // Fan-shaped leaves (golden-green)
                for (let i = 0; i < 12; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 38 * scale;
                    const ly = y - 55 * scale + (seededRandom(i + 10) - 0.5) * 25 * scale;
                    // Fan shape
                    graphics.moveTo(lx, ly + 3 * scale);
                    graphics.lineTo(lx - 3 * scale, ly - 3 * scale);
                    graphics.lineTo(lx + 3 * scale, ly - 3 * scale);
                    graphics.closePath();
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x8aaa4a : 0x9aba5a);
                }
                break;
            }

            case 'weeping_willow': {
                // Graceful tree with drooping branches
                graphics.ellipse(x, y + 6, 35 * scale, 14 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                graphics.rect(x - 5 * scale, y - 45 * scale, 10 * scale, 50 * scale);
                graphics.fill(0x5a4a3a);

                // Main crown
                graphics.ellipse(x, y - 50 * scale, 28 * scale, 18 * scale);
                graphics.fill(0x4a7a3a);

                // Long drooping branches
                for (let i = 0; i < 14; i++) {
                    const startX = x + (seededRandom(i) - 0.5) * 40 * scale;
                    const startY = y - 50 * scale + seededRandom(i + 10) * 10 * scale;
                    const endX = startX + (seededRandom(i + 20) - 0.5) * 10 * scale;
                    const endY = y - 5 * scale + seededRandom(i + 30) * 10 * scale;
                    graphics.moveTo(startX, startY);
                    graphics.quadraticCurveTo(startX, (startY + endY) / 2, endX, endY);
                    graphics.stroke({ color: 0x5a8a4a, width: 1.5 });
                }
                break;
            }

            case 'birch_tree': {
                // White bark, slender
                graphics.ellipse(x, y + 4, 20 * scale, 8 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // White trunk
                graphics.rect(x - 3 * scale, y - 55 * scale, 6 * scale, 60 * scale);
                graphics.fill(0xe8e0d8);

                // Black bark marks
                for (let i = 0; i < 8; i++) {
                    const markY = y - 5 * scale - i * 7 * scale;
                    const markW = (2 + seededRandom(i) * 3) * scale;
                    graphics.rect(x - markW / 2, markY, markW, 2 * scale);
                    graphics.fill(0x2a2a2a);
                }

                // Light airy crown
                graphics.ellipse(x, y - 62 * scale, 22 * scale, 16 * scale);
                graphics.fill({ color: 0x5a9a4a, alpha: 0.85 });

                // Small leaves
                for (let i = 0; i < 12; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 38 * scale;
                    const ly = y - 62 * scale + (seededRandom(i + 10) - 0.5) * 26 * scale;
                    graphics.ellipse(lx, ly, 3 * scale, 2 * scale);
                    graphics.fill(0x6aaa5a);
                }
                break;
            }

            case 'white_oak': {
                // Majestic spreading crown
                graphics.ellipse(x, y + 6, 32 * scale, 14 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Thick trunk
                graphics.rect(x - 6 * scale, y - 40 * scale, 12 * scale, 46 * scale);
                graphics.fill(0x5a4a3a);

                // Spreading branches
                graphics.moveTo(x - 4 * scale, y - 38 * scale);
                graphics.lineTo(x - 25 * scale, y - 50 * scale);
                graphics.stroke({ color: 0x5a4a3a, width: 4 * scale });
                graphics.moveTo(x + 4 * scale, y - 36 * scale);
                graphics.lineTo(x + 28 * scale, y - 48 * scale);
                graphics.stroke({ color: 0x5a4a3a, width: 4 * scale });

                // Wide crown
                graphics.ellipse(x, y - 55 * scale, 38 * scale, 24 * scale);
                graphics.fill(0x3a6a2a);

                // Lobed oak leaves
                for (let i = 0; i < 16; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 68 * scale;
                    const ly = y - 55 * scale + (seededRandom(i + 10) - 0.5) * 42 * scale;
                    graphics.ellipse(lx, ly, 5 * scale, 3 * scale);
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x4a7a3a : 0x3a6a2a);
                }
                break;
            }

            case 'cherry_tree': {
                // Flowering tree with pink blossoms
                graphics.ellipse(x, y + 5, 24 * scale, 10 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Dark trunk
                graphics.rect(x - 4 * scale, y - 42 * scale, 8 * scale, 47 * scale);
                graphics.fill(0x4a3028);

                // Rounded crown with blossoms
                graphics.ellipse(x, y - 52 * scale, 26 * scale, 18 * scale);
                graphics.fill(0x4a7a3a);

                // Pink blossoms
                const blossomColors = [0xffb0c0, 0xffc0d0, 0xffa0b0, 0xffd0e0];
                for (let i = 0; i < 20; i++) {
                    const bx = x + (seededRandom(i) - 0.5) * 48 * scale;
                    const by = y - 52 * scale + (seededRandom(i + 10) - 0.5) * 32 * scale;
                    const colorIdx = Math.floor(seededRandom(i + 20) * blossomColors.length);
                    graphics.circle(bx, by, (2 + seededRandom(i + 30)) * scale);
                    graphics.fill(blossomColors[colorIdx]);
                }
                break;
            }

            case 'trembling_aspen': {
                // Slender with round leaves
                graphics.ellipse(x, y + 4, 20 * scale, 8 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Pale trunk
                graphics.rect(x - 3 * scale, y - 55 * scale, 6 * scale, 60 * scale);
                graphics.fill(0xc8c0b0);

                // Narrow crown
                graphics.ellipse(x, y - 58 * scale, 18 * scale, 22 * scale);
                graphics.fill(0x5a9a4a);

                // Round quivering leaves
                for (let i = 0; i < 14; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 32 * scale;
                    const ly = y - 58 * scale + (seededRandom(i + 10) - 0.5) * 38 * scale;
                    graphics.circle(lx, ly, 2.5 * scale);
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x6aaa5a : 0x7aba6a);
                }
                break;
            }

            case 'bonsai': {
                // Miniature ornamental tree
                graphics.ellipse(x, y + 2, 12 * scale, 5 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.15 });

                // Small gnarled trunk
                graphics.moveTo(x - 2 * scale, y);
                graphics.quadraticCurveTo(x - 4 * scale, y - 8 * scale, x, y - 15 * scale);
                graphics.lineTo(x + 2 * scale, y - 14 * scale);
                graphics.quadraticCurveTo(x + 3 * scale, y - 7 * scale, x + 2 * scale, y);
                graphics.fill(0x5a4030);

                // Small shaped crown
                graphics.ellipse(x - 4 * scale, y - 18 * scale, 8 * scale, 5 * scale);
                graphics.fill(0x2a5a1a);
                graphics.ellipse(x + 5 * scale, y - 16 * scale, 6 * scale, 4 * scale);
                graphics.fill(0x3a6a2a);
                graphics.ellipse(x, y - 20 * scale, 7 * scale, 5 * scale);
                graphics.fill(0x2a6a1a);
                break;
            }

            case 'snowbell_tree': {
                // Small tree with white bell flowers
                graphics.ellipse(x, y + 4, 16 * scale, 6 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.18 });

                // Slender trunk
                graphics.rect(x - 2.5 * scale, y - 35 * scale, 5 * scale, 39 * scale);
                graphics.fill(0x6a5a4a);

                // Rounded crown
                graphics.ellipse(x, y - 42 * scale, 18 * scale, 14 * scale);
                graphics.fill(0x4a7a3a);

                // White bell-shaped flowers
                for (let i = 0; i < 10; i++) {
                    const fx = x + (seededRandom(i) - 0.5) * 30 * scale;
                    const fy = y - 42 * scale + (seededRandom(i + 10) - 0.5) * 22 * scale;
                    graphics.moveTo(fx, fy - 3 * scale);
                    graphics.lineTo(fx - 2 * scale, fy + 2 * scale);
                    graphics.lineTo(fx + 2 * scale, fy + 2 * scale);
                    graphics.closePath();
                    graphics.fill(0xffffff);
                }
                break;
            }

            case 'japanese_maple': {
                // Ornamental with delicate red leaves
                graphics.ellipse(x, y + 4, 20 * scale, 8 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Elegant trunk
                graphics.moveTo(x - 3 * scale, y);
                graphics.quadraticCurveTo(x - 2 * scale, y - 18 * scale, x, y - 35 * scale);
                graphics.lineTo(x + 3 * scale, y - 34 * scale);
                graphics.quadraticCurveTo(x + 2 * scale, y - 17 * scale, x + 3 * scale, y);
                graphics.fill(0x5a4030);

                // Spreading crown
                graphics.ellipse(x, y - 42 * scale, 24 * scale, 14 * scale);
                graphics.fill(0x8a2020);

                // Delicate red/purple leaves
                const jmColors = [0xa03030, 0xb04040, 0x902020, 0xc05050];
                for (let i = 0; i < 14; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 42 * scale;
                    const ly = y - 42 * scale + (seededRandom(i + 10) - 0.5) * 24 * scale;
                    const colorIdx = Math.floor(seededRandom(i + 20) * jmColors.length);
                    graphics.circle(lx, ly, 2 * scale);
                    graphics.fill(jmColors[colorIdx]);
                }
                break;
            }

            case 'deciduous_bush': {
                // Common leafy shrub
                graphics.ellipse(x, y + 3, 16 * scale, 6 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.15 });

                // Bush body
                graphics.ellipse(x, y - 8 * scale, 18 * scale, 14 * scale);
                graphics.fill(0x3a6a2a);

                // Leaf clusters
                for (let i = 0; i < 12; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 32 * scale;
                    const ly = y - 8 * scale + (seededRandom(i + 10) - 0.5) * 22 * scale;
                    graphics.ellipse(lx, ly, 4 * scale, 3 * scale);
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x4a7a3a : 0x5a8a4a);
                }

                // Highlight
                graphics.ellipse(x - 3 * scale, y - 14 * scale, 8 * scale, 4 * scale);
                graphics.fill({ color: 0x6a9a5a, alpha: 0.4 });
                break;
            }

            case 'glossopteris': {
                // Prehistoric seed fern
                graphics.ellipse(x, y + 5, 22 * scale, 9 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                graphics.rect(x - 4 * scale, y - 48 * scale, 8 * scale, 53 * scale);
                graphics.fill(0x5a4a3a);

                // Fern-like crown
                graphics.ellipse(x, y - 55 * scale, 24 * scale, 16 * scale);
                graphics.fill(0x3a6a2a);

                // Tongue-shaped leaves (glossopteris means tongue-fern)
                for (let i = 0; i < 10; i++) {
                    const angle = (i / 10) * Math.PI * 2;
                    const lx = x + Math.cos(angle) * 18 * scale;
                    const ly = y - 55 * scale + Math.sin(angle) * 10 * scale;
                    graphics.ellipse(lx, ly, 6 * scale, 3 * scale);
                    graphics.fill(0x4a7a3a);
                }
                break;
            }

            case 'magnolia_tree': {
                // Ancient flowering tree
                graphics.ellipse(x, y + 5, 24 * scale, 10 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                graphics.rect(x - 5 * scale, y - 45 * scale, 10 * scale, 50 * scale);
                graphics.fill(0x5a4a3a);

                // Rounded crown
                graphics.ellipse(x, y - 52 * scale, 26 * scale, 18 * scale);
                graphics.fill(0x3a6a2a);

                // Large white/pink flowers
                const magColors = [0xfff0f5, 0xffe0e8, 0xffd0d8];
                for (let i = 0; i < 8; i++) {
                    const fx = x + (seededRandom(i) - 0.5) * 44 * scale;
                    const fy = y - 52 * scale + (seededRandom(i + 10) - 0.5) * 28 * scale;
                    const colorIdx = Math.floor(seededRandom(i + 20) * magColors.length);
                    graphics.circle(fx, fy, (4 + seededRandom(i + 30) * 2) * scale);
                    graphics.fill(magColors[colorIdx]);
                }
                break;
            }

            case 'globe_willow': {
                // Round-crowned willow
                graphics.ellipse(x, y + 6, 30 * scale, 13 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                graphics.rect(x - 5 * scale, y - 40 * scale, 10 * scale, 46 * scale);
                graphics.fill(0x5a4a3a);

                // Spherical crown
                graphics.circle(x, y - 55 * scale, 28 * scale);
                graphics.fill(0x4a8a3a);

                // Dense leaf texture
                for (let i = 0; i < 18; i++) {
                    const angle = seededRandom(i) * Math.PI * 2;
                    const dist = seededRandom(i + 10) * 24;
                    const lx = x + Math.cos(angle) * dist * scale;
                    const ly = y - 55 * scale + Math.sin(angle) * dist * scale;
                    graphics.ellipse(lx, ly, 4 * scale, 2 * scale);
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x5a9a4a : 0x6aaa5a);
                }
                break;
            }

            case 'wild_olive': {
                // Gnarled Mediterranean tree
                graphics.ellipse(x, y + 5, 24 * scale, 10 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Gnarled twisted trunk
                graphics.moveTo(x - 5 * scale, y);
                graphics.quadraticCurveTo(x - 8 * scale, y - 15 * scale, x - 3 * scale, y - 35 * scale);
                graphics.lineTo(x + 4 * scale, y - 33 * scale);
                graphics.quadraticCurveTo(x + 7 * scale, y - 12 * scale, x + 5 * scale, y);
                graphics.fill(0x6a5a4a);

                // Silvery-green crown
                graphics.ellipse(x, y - 45 * scale, 26 * scale, 18 * scale);
                graphics.fill(0x7a9a6a);

                // Silvery olive leaves
                for (let i = 0; i < 14; i++) {
                    const lx = x + (seededRandom(i) - 0.5) * 46 * scale;
                    const ly = y - 45 * scale + (seededRandom(i + 10) - 0.5) * 30 * scale;
                    graphics.ellipse(lx, ly, 4 * scale, 1.5 * scale);
                    graphics.fill(seededRandom(i + 20) > 0.5 ? 0x8aaa7a : 0x9aba8a);
                }

                // Small olives
                if (seededRandom(888) > 0.5) {
                    for (let i = 0; i < 4; i++) {
                        const ox = x + (seededRandom(i + 300) - 0.5) * 30 * scale;
                        const oy = y - 40 * scale + seededRandom(i + 310) * 15 * scale;
                        graphics.circle(ox, oy, 2 * scale);
                        graphics.fill(0x4a6a3a);
                    }
                }
                break;
            }

            case 'pacific_dogwood': {
                // Flowering tree from Western North America
                graphics.ellipse(x, y + 4, 20 * scale, 8 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Trunk
                graphics.rect(x - 3 * scale, y - 38 * scale, 6 * scale, 42 * scale);
                graphics.fill(0x5a4a3a);

                // Crown
                graphics.ellipse(x, y - 45 * scale, 22 * scale, 16 * scale);
                graphics.fill(0x3a6a2a);

                // White dogwood flowers (4 petal pattern)
                for (let i = 0; i < 8; i++) {
                    const fx = x + (seededRandom(i) - 0.5) * 38 * scale;
                    const fy = y - 45 * scale + (seededRandom(i + 10) - 0.5) * 26 * scale;
                    // Four petals
                    for (let p = 0; p < 4; p++) {
                        const pAngle = (p / 4) * Math.PI * 2;
                        const px = fx + Math.cos(pAngle) * 3 * scale;
                        const py = fy + Math.sin(pAngle) * 3 * scale;
                        graphics.ellipse(px, py, 2.5 * scale, 1.5 * scale);
                        graphics.fill(0xffffff);
                    }
                    // Yellow center
                    graphics.circle(fx, fy, 1.5 * scale);
                    graphics.fill(0xffee00);
                }
                break;
            }

            default: {
                // Generic plant with more detail
                graphics.ellipse(x, y + 3, 14 * scale, 6 * scale);
                graphics.fill({ color: 0x000000, alpha: 0.2 });

                // Layered leaves
                graphics.circle(x, y - 8 * scale, 16 * scale);
                graphics.fill(0x1a6b1a);
                graphics.circle(x - 3 * scale, y - 12 * scale, 12 * scale);
                graphics.fill(0x228B22);
                graphics.circle(x + 4 * scale, y - 10 * scale, 10 * scale);
                graphics.fill(0x2a9b2a);

                // Highlight
                graphics.ellipse(x - 2 * scale, y - 16 * scale, 6 * scale, 4 * scale);
                graphics.fill({ color: 0x4acb4a, alpha: 0.5 });
            }
        }
    }

    /**
     * Draw a food pile
     */
    private drawFoodPile(graphics: Graphics, x: number, y: number, pile: any): void {
        const scale = 0.5 + pile.getPercentRemaining() * 0.5;

        // Shadow
        graphics.ellipse(x, y + 4, 12 * scale, 5 * scale);
        graphics.fill({ color: 0x000000, alpha: 0.2 });

        switch (pile.foodType) {
            case 'meat':
                // Meat chunks
                graphics.ellipse(x - 4, y - 2, 8 * scale, 5 * scale);
                graphics.fill(0x8B0000);
                graphics.ellipse(x + 4, y - 4, 7 * scale, 4 * scale);
                graphics.fill(0xA52A2A);
                graphics.ellipse(x, y - 6, 6 * scale, 4 * scale);
                graphics.fill(0xCD5C5C);
                break;

            case 'hay':
                // Hay bale
                graphics.ellipse(x, y, 14 * scale, 8 * scale);
                graphics.fill(0xc49a3a);
                graphics.ellipse(x, y - 6, 10 * scale, 5 * scale);
                graphics.fill(0xd4a843);
                break;

            case 'vegetables':
                // Green vegetables
                graphics.ellipse(x - 3, y - 2, 6 * scale, 4 * scale);
                graphics.fill(0x228B22);
                graphics.ellipse(x + 3, y - 4, 5 * scale, 3 * scale);
                graphics.fill(0x32CD32);
                break;

            case 'fruit':
                // Colorful fruit
                graphics.circle(x - 4, y - 2, 5 * scale);
                graphics.fill(0xFF6347);
                graphics.circle(x + 4, y - 3, 4 * scale);
                graphics.fill(0xFFD700);
                graphics.circle(x, y - 6, 4 * scale);
                graphics.fill(0xFF4500);
                break;

            default:
                // Generic food
                graphics.ellipse(x, y, 10 * scale, 6 * scale);
                graphics.fill(0x8B4513);
        }
    }

    /**
     * Draw a shelter aligned to tile grid
     */
    private drawShelter(graphics: Graphics, x: number, y: number, shelter: any): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Get shelter tile dimensions
        const tileWidth = shelter.width;  // tiles in X direction (already rotated)
        const tileDepth = shelter.depth;  // tiles in Y direction (already rotated)
        const rotation = shelter.rotation || 0;

        // Get the anchor tile position (bottom-left corner of shelter in world coords)
        const anchorX = shelter.tileX;
        const anchorY = shelter.tileY;

        // Calculate all 4 corners in screen space (tileToScreen already applies camera rotation)
        const corners = [
            this.game.camera.tileToScreen(anchorX, anchorY),
            this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY),
            this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY + tileDepth - 1),
            this.game.camera.tileToScreen(anchorX, anchorY + tileDepth - 1),
        ];

        // Sort corners by screen position to find top/right/bottom/left
        // Top = smallest Y, Bottom = largest Y, Left = smallest X, Right = largest X
        const sortedByY = [...corners].sort((a, b) => a.y - b.y);
        const sortedByX = [...corners].sort((a, b) => a.x - b.x);
        const topCorner = sortedByY[0];
        const bottomCorner = sortedByY[3];
        const leftCorner = sortedByX[0];
        const rightCorner = sortedByX[3];

        // Shelter height based on size
        const shelterHeight = 30 + tileDepth * 8;

        // Colors for concrete shelter
        const floorColor = 0x555555;
        const wallDark = 0x666666;
        const wallLight = 0x888888;
        const roofColor = 0x555555;
        const roofLight = 0x666666;

        // Calculate corner positions
        const top = { x: topCorner.x, y: topCorner.y - hh };
        const right = { x: rightCorner.x + hw, y: rightCorner.y };
        const bottom = { x: bottomCorner.x, y: bottomCorner.y + hh };
        const left = { x: leftCorner.x - hw, y: leftCorner.y };

        // Draw floor/base (isometric diamond matching tile footprint exactly)
        graphics.poly([top, right, bottom, left]);
        graphics.fill(floorColor);

        // Define all 4 walls with their vertices
        // Wall order: 0=back-left (left to top), 1=back-right (top to right),
        //             2=front-right (right to bottom), 3=front-left (bottom to left)
        const walls = [
            { start: left, end: top, color: wallDark },     // 0: back-left
            { start: top, end: right, color: wallDark },    // 1: back-right
            { start: right, end: bottom, color: wallLight }, // 2: front-right
            { start: bottom, end: left, color: wallLight },  // 3: front-left
        ];

        // Since corners are now sorted to screen positions, walls are always in screen-space:
        // Wall 0: back-left (left to top), Wall 1: back-right (top to right)
        // Wall 2: front-right (right to bottom), Wall 3: front-left (bottom to left)
        // Wall 1 (back-right) is always hidden behind the building in isometric view
        const skipWall = 1;

        // Draw walls in back-to-front order: 0 (back-left), then 2 and 3 (front walls)
        const drawOrder = [0, 2, 3];
        for (const wallIndex of drawOrder) {
            if (wallIndex === skipWall) continue;
            const wall = walls[wallIndex];
            graphics.poly([
                wall.start, wall.end,
                { x: wall.end.x, y: wall.end.y - shelterHeight },
                { x: wall.start.x, y: wall.start.y - shelterHeight },
            ]);
            graphics.fill(wall.color);
        }

        // Draw entrance based on rotation
        // Door is sized to fit within one tile's face
        const doorHeight = shelterHeight * 0.65;

        // Get original dimensions (before rotation) from shelter size
        let origWidth: number, origDepth: number;
        if (shelter.size === 'small') {
            origWidth = 2; origDepth = 1;
        } else if (shelter.size === 'regular') {
            origWidth = 2; origDepth = 2;
        } else {
            origWidth = 3; origDepth = 2;
        }

        // Base entrance wall (before rotation):
        // Walls indexed clockwise: 0=back-left, 1=back-right, 2=front-right, 3=front-left
        // - small (2x1): wall 2 (front-right, short side)
        // - regular (2x2): wall 2 (front-right, at edge)
        // - large (3x2): wall 3 (front-left, long side)
        let baseWall: number;
        if (shelter.size === 'large') {
            baseWall = 3; // front-left (long side)
        } else {
            baseWall = 2; // front-right (short side for 2x1, at edge for 2x2)
        }

        // Apply building rotation to get world wall, then convert to screen wall
        const worldWall = (baseWall + rotation) % 4;
        const actualWall = (worldWall + this.game.camera.rotation) % 4;

        // Define all 4 walls with their start/end points and tile counts for entrance calculation
        // Wall 0 = back-left: left to top (spans origWidth tiles along X)
        // Wall 1 = back-right: top to right (spans origDepth tiles along Y)
        // Wall 2 = front-right: right to bottom (spans origDepth tiles along Y)
        // Wall 3 = front-left: bottom to left (spans origWidth tiles along X)
        const entranceWalls = [
            { start: left, end: top, tileCount: tileWidth },      // back-left
            { start: top, end: right, tileCount: tileDepth },     // back-right
            { start: right, end: bottom, tileCount: tileDepth },  // front-right
            { start: bottom, end: left, tileCount: tileWidth },   // front-left
        ];

        // Only draw entrance if it's on a visible front wall
        // Visible walls depend on camera rotation
        const visibleWalls = this.getVisibleWalls();
        if (visibleWalls.includes(actualWall)) {
            const wall = entranceWalls[actualWall];
            const wallStart = wall.start;
            const wallEnd = wall.end;
            const wallTileCount = wall.tileCount;

            // Calculate door position
            const tileFraction = 1.0 / wallTileCount;
            const doorMargin = 0.15 * tileFraction;
            const doorW = tileFraction - (doorMargin * 2);

            // For 2x2 shelters, put entrance at edge (first tile)
            // For 3-tile walls, center on middle tile
            // For others, center the entrance
            const is2x2 = origWidth === 2 && origDepth === 2;
            let doorT: number;
            if (is2x2) {
                doorT = doorMargin; // At the edge (first tile)
            } else if (wallTileCount === 3) {
                // Center on middle tile (tile 1 of 0,1,2)
                doorT = tileFraction + (tileFraction - doorW) / 2;
            } else {
                doorT = 0.5 - (doorW / 2); // Centered
            }

            const doorStartX = wallStart.x + (wallEnd.x - wallStart.x) * doorT;
            const doorStartY = wallStart.y + (wallEnd.y - wallStart.y) * doorT;
            const doorEndX = wallStart.x + (wallEnd.x - wallStart.x) * (doorT + doorW);
            const doorEndY = wallStart.y + (wallEnd.y - wallStart.y) * (doorT + doorW);

            graphics.poly([
                { x: doorStartX, y: doorStartY },
                { x: doorEndX, y: doorEndY },
                { x: doorEndX, y: doorEndY - doorHeight },
                { x: doorStartX, y: doorStartY - doorHeight },
            ]);
            graphics.fill(0x222222);
        }

        // Draw roof (flat top)
        graphics.poly([
            { x: top.x, y: top.y - shelterHeight },
            { x: right.x, y: right.y - shelterHeight },
            { x: bottom.x, y: bottom.y - shelterHeight },
            { x: left.x, y: left.y - shelterHeight },
        ]);
        graphics.fill(roofColor);

        // Roof edge highlights - only on visible front edges
        // Front-right edge (right to bottom)
        graphics.moveTo(right.x, right.y - shelterHeight);
        graphics.lineTo(bottom.x, bottom.y - shelterHeight);
        graphics.stroke({ color: roofLight, width: 1 });

        // Front-left edge (bottom to left)
        graphics.moveTo(bottom.x, bottom.y - shelterHeight);
        graphics.lineTo(left.x, left.y - shelterHeight);
        graphics.stroke({ color: roofLight, width: 1 });

        // Corner edge lines - only visible corners (not top-right which is hidden)
        // Left corner (between back-left and front-left walls)
        graphics.moveTo(left.x, left.y);
        graphics.lineTo(left.x, left.y - shelterHeight);
        graphics.stroke({ color: 0x444444, width: 1 });

        // Bottom corner (between front-left and front-right walls)
        graphics.moveTo(bottom.x, bottom.y);
        graphics.lineTo(bottom.x, bottom.y - shelterHeight);
        graphics.stroke({ color: 0x555555, width: 1 });

        // Right corner (front edge of front-right wall)
        graphics.moveTo(right.x, right.y);
        graphics.lineTo(right.x, right.y - shelterHeight);
        graphics.stroke({ color: 0x555555, width: 1 });
    }

    /**
     * Draw a building (burger stand, etc.)
     */
    private drawBuilding(graphics: Graphics, screenX: number, screenY: number, building: Placeable): void {
        const config = PLACEABLE_CONFIGS[building.placeableType];
        if (!config) return;

        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Get building tile dimensions (already rotated)
        const tileWidth = building.width;
        const tileDepth = building.depth;

        // Get the anchor tile position
        const anchorX = building.tileX;
        const anchorY = building.tileY;

        // Calculate all 4 corners in screen space (tileToScreen already applies camera rotation)
        const corners = [
            this.game.camera.tileToScreen(anchorX, anchorY),
            this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY),
            this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY + tileDepth - 1),
            this.game.camera.tileToScreen(anchorX, anchorY + tileDepth - 1),
        ];

        // Sort corners by screen position to find top/right/bottom/left
        const sortedByY = [...corners].sort((a, b) => a.y - b.y);
        const sortedByX = [...corners].sort((a, b) => a.x - b.x);
        const topCorner = sortedByY[0];
        const bottomCorner = sortedByY[3];
        const leftCorner = sortedByX[0];
        const rightCorner = sortedByX[3];

        // Calculate corner positions (extend to tile edges)
        const top = { x: topCorner.x, y: topCorner.y - hh };
        const right = { x: rightCorner.x + hw, y: rightCorner.y };
        const bottom = { x: bottomCorner.x, y: bottomCorner.y + hh };
        const left = { x: leftCorner.x - hw, y: leftCorner.y };

        const buildingHeight = 45;

        // Convert building rotation to screen-space entrance wall
        // Building rotation gives world wall, add camera rotation to get screen wall
        const screenRotation = (building.rotation + this.game.camera.rotation) % 4;

        // Draw based on building style
        if (config.style === 'burger_stand') {
            this.drawBurgerStand(graphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (config.style === 'drink_stand') {
            this.drawDrinkStand(graphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (config.style === 'vending_machine') {
            this.drawVendingMachine(graphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (config.style === 'gift_shop') {
            this.drawGiftShop(graphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (config.style === 'restaurant') {
            this.drawRestaurant(graphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (config.style === 'bathroom') {
            this.drawBathroom(graphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (config.style === 'bathroom_large') {
            this.drawBathroomLarge(graphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (config.style === 'garbage_can') {
            this.drawTrashCan(graphics, top, right, bottom, left, screenRotation);
        } else if (config.style === 'bench') {
            this.drawBench(graphics, top, right, bottom, left, screenRotation);
        } else if (config.style === 'picnic_table') {
            this.drawPicnicTable(graphics, top, right, bottom, left, screenRotation);
        } else {
            // Default building style
            this.drawGenericBuilding(graphics, top, right, bottom, left, buildingHeight);
        }
    }

    /**
     * Draw burger stand with distinctive red/yellow colors
     * Service window position rotates with building:
     * - rotation 0: front-right wall (south)
     * - rotation 1: front-left wall (west)
     * - rotation 2: back-left wall (north) - not visible
     * - rotation 3: back-right wall (east) - not visible
     */
    private drawBurgerStand(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        buildingHeight: number,
        rotation: number = 0
    ): void {
        // Colors
        const wallRed = 0xcc2222;
        const wallRedDark = 0x991a1a;
        const awningYellow = 0xffcc00;
        const awningYellowDark = 0xcc9900;
        const roofBrown = 0x8b4513;

        // Determine which wall has the service window based on rotation
        // Base position is front-right (wall 2, south facing)
        // Rotation adds to wall index: 0=front-right, 1=front-left, 2=back-left, 3=back-right
        const serviceWall = rotation % 4;

        // Front-left wall (darker, facing away from light)
        graphics.poly([
            { x: bottom.x, y: bottom.y },
            { x: left.x, y: left.y },
            { x: left.x, y: left.y - buildingHeight },
            { x: bottom.x, y: bottom.y - buildingHeight },
        ]);
        graphics.fill(wallRedDark);

        // Front-right wall (brighter, facing light)
        graphics.poly([
            { x: right.x, y: right.y },
            { x: bottom.x, y: bottom.y },
            { x: bottom.x, y: bottom.y - buildingHeight },
            { x: right.x, y: right.y - buildingHeight },
        ]);
        graphics.fill(wallRed);

        // Draw isometric service window on the appropriate wall
        // Window positioned towards the interaction point side
        const windowHeight = 18;
        const awningExtend = 8;
        const awningHeight = 5;

        if (serviceWall === 0) {
            // Front-right wall (south facing) - interaction at tile (1,0) = right side of wall
            // Wall goes from right to bottom, window on right side (near 'right' corner)
            const wallDx = bottom.x - right.x;
            const wallDy = bottom.y - right.y;

            // Position window at 20-50% along wall (towards right/interaction side)
            const t1 = 0.2;
            const t2 = 0.5;
            const windowTop = buildingHeight * 0.65;
            const windowBottom = buildingHeight * 0.25;

            const wx1 = right.x + wallDx * t1;
            const wy1 = right.y + wallDy * t1;
            const wx2 = right.x + wallDx * t2;
            const wy2 = right.y + wallDy * t2;

            // Draw isometric window (parallelogram following wall angle)
            graphics.poly([
                { x: wx1, y: wy1 - windowBottom },
                { x: wx2, y: wy2 - windowBottom },
                { x: wx2, y: wy2 - windowTop },
                { x: wx1, y: wy1 - windowTop },
            ]);
            graphics.fill(0x222222);
            graphics.stroke({ color: 0xffff00, width: 2 });

            // Window shelf/counter
            graphics.poly([
                { x: wx1, y: wy1 - windowBottom },
                { x: wx2, y: wy2 - windowBottom },
                { x: wx2 + 4, y: wy2 - windowBottom + 2 },
                { x: wx1 + 4, y: wy1 - windowBottom + 2 },
            ]);
            graphics.fill(0x666666);

            // Awning over window area
            graphics.poly([
                { x: right.x + awningExtend, y: right.y + awningExtend / 2 - buildingHeight + 10 },
                { x: bottom.x, y: bottom.y - buildingHeight + 10 },
                { x: bottom.x, y: bottom.y - buildingHeight + 10 - awningHeight },
                { x: right.x + awningExtend, y: right.y + awningExtend / 2 - buildingHeight + 10 - awningHeight },
            ]);
            graphics.fill(awningYellow);

            // Stripes
            this.drawAwningStripes(graphics,
                { x: right.x + awningExtend, y: right.y + awningExtend / 2 - buildingHeight + 10 },
                { x: bottom.x, y: bottom.y - buildingHeight + 10 },
                awningHeight);

        } else if (serviceWall === 1) {
            // Front-left wall (west facing) - window positioned towards bottom corner
            // Wall goes from bottom to left
            const wallDx = left.x - bottom.x;
            const wallDy = left.y - bottom.y;

            // Position window at 20-50% along wall
            const t1 = 0.2;
            const t2 = 0.5;
            const windowTop = buildingHeight * 0.65;
            const windowBottom = buildingHeight * 0.25;

            const wx1 = bottom.x + wallDx * t1;
            const wy1 = bottom.y + wallDy * t1;
            const wx2 = bottom.x + wallDx * t2;
            const wy2 = bottom.y + wallDy * t2;

            // Draw isometric window (parallelogram following wall angle)
            graphics.poly([
                { x: wx1, y: wy1 - windowBottom },
                { x: wx2, y: wy2 - windowBottom },
                { x: wx2, y: wy2 - windowTop },
                { x: wx1, y: wy1 - windowTop },
            ]);
            graphics.fill(0x222222);
            graphics.stroke({ color: 0xffff00, width: 2 });

            // Window shelf/counter
            graphics.poly([
                { x: wx1, y: wy1 - windowBottom },
                { x: wx2, y: wy2 - windowBottom },
                { x: wx2 - 4, y: wy2 - windowBottom + 2 },
                { x: wx1 - 4, y: wy1 - windowBottom + 2 },
            ]);
            graphics.fill(0x555555);

            // Awning over front-left
            graphics.poly([
                { x: bottom.x, y: bottom.y - buildingHeight + 10 },
                { x: left.x - awningExtend, y: left.y + awningExtend / 2 - buildingHeight + 10 },
                { x: left.x - awningExtend, y: left.y + awningExtend / 2 - buildingHeight + 10 - awningHeight },
                { x: bottom.x, y: bottom.y - buildingHeight + 10 - awningHeight },
            ]);
            graphics.fill(awningYellowDark);
        }
        // Rotations 2 and 3 put the window on back walls (not visible from this camera angle)

        // Flat roof
        graphics.poly([
            { x: top.x, y: top.y - buildingHeight },
            { x: right.x, y: right.y - buildingHeight },
            { x: bottom.x, y: bottom.y - buildingHeight },
            { x: left.x, y: left.y - buildingHeight },
        ]);
        graphics.fill(roofBrown);

        // Burger icon on top (decorative)
        const burgerX = (top.x + bottom.x) / 2;
        const burgerY = (top.y + bottom.y) / 2 - buildingHeight - 8;

        // Burger bun (top)
        graphics.ellipse(burgerX, burgerY - 4, 10, 6);
        graphics.fill(0xd4a574);

        // Burger patty
        graphics.ellipse(burgerX, burgerY, 12, 4);
        graphics.fill(0x8b4513);

        // Burger bun (bottom)
        graphics.ellipse(burgerX, burgerY + 4, 10, 5);
        graphics.fill(0xd4a574);

        // Edge highlights
        graphics.moveTo(bottom.x, bottom.y);
        graphics.lineTo(bottom.x, bottom.y - buildingHeight);
        graphics.stroke({ color: 0x661111, width: 1 });

        graphics.moveTo(right.x, right.y);
        graphics.lineTo(right.x, right.y - buildingHeight);
        graphics.stroke({ color: 0x661111, width: 1 });
    }

    /**
     * Draw striped awning pattern
     */
    private drawAwningStripes(
        graphics: Graphics,
        start: { x: number; y: number },
        end: { x: number; y: number },
        awningHeight: number
    ): void {
        const stripeCount = 4;
        for (let i = 0; i < stripeCount; i += 2) {
            const t1 = i / stripeCount;
            const t2 = (i + 1) / stripeCount;

            const x1 = start.x + (end.x - start.x) * t1;
            const y1 = start.y + (end.y - start.y) * t1;
            const x2 = start.x + (end.x - start.x) * t2;
            const y2 = start.y + (end.y - start.y) * t2;

            graphics.poly([
                { x: x1, y: y1 },
                { x: x2, y: y2 },
                { x: x2, y: y2 - awningHeight },
                { x: x1, y: y1 - awningHeight },
            ]);
            graphics.fill(0xcc2222);
        }
    }

    /**
     * Draw drink stand with cyan/blue colors and cup icon
     * Narrower stand (1x2 tiles) with service window
     */
    private drawDrinkStand(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        buildingHeight: number,
        rotation: number = 0
    ): void {
        // Colors - cyan/blue theme for drinks
        const wallCyan = 0x22aacc;
        const wallCyanDark = 0x1a8899;
        const awningBlue = 0x3399ff;
        const awningBlueDark = 0x2277cc;
        const roofWhite = 0xeeeeee;

        const serviceWall = rotation % 4;

        // Front-left wall (darker)
        graphics.poly([
            { x: bottom.x, y: bottom.y },
            { x: left.x, y: left.y },
            { x: left.x, y: left.y - buildingHeight },
            { x: bottom.x, y: bottom.y - buildingHeight },
        ]);
        graphics.fill(wallCyanDark);

        // Front-right wall (brighter)
        graphics.poly([
            { x: right.x, y: right.y },
            { x: bottom.x, y: bottom.y },
            { x: bottom.x, y: bottom.y - buildingHeight },
            { x: right.x, y: right.y - buildingHeight },
        ]);
        graphics.fill(wallCyan);

        // Service window and awning
        const awningExtend = 6;
        const awningHeight = 5;

        if (serviceWall === 0) {
            // Front-right wall (south facing)
            const wallDx = bottom.x - right.x;
            const wallDy = bottom.y - right.y;

            const t1 = 0.15;
            const t2 = 0.55;
            const windowTop = buildingHeight * 0.65;
            const windowBottom = buildingHeight * 0.25;

            const wx1 = right.x + wallDx * t1;
            const wy1 = right.y + wallDy * t1;
            const wx2 = right.x + wallDx * t2;
            const wy2 = right.y + wallDy * t2;

            // Window
            graphics.poly([
                { x: wx1, y: wy1 - windowBottom },
                { x: wx2, y: wy2 - windowBottom },
                { x: wx2, y: wy2 - windowTop },
                { x: wx1, y: wy1 - windowTop },
            ]);
            graphics.fill(0x222222);
            graphics.stroke({ color: 0x66ddff, width: 2 });

            // Counter shelf
            graphics.poly([
                { x: wx1, y: wy1 - windowBottom },
                { x: wx2, y: wy2 - windowBottom },
                { x: wx2 + 3, y: wy2 - windowBottom + 2 },
                { x: wx1 + 3, y: wy1 - windowBottom + 2 },
            ]);
            graphics.fill(0x666666);

            // Awning
            graphics.poly([
                { x: right.x + awningExtend, y: right.y + awningExtend / 2 - buildingHeight + 10 },
                { x: bottom.x, y: bottom.y - buildingHeight + 10 },
                { x: bottom.x, y: bottom.y - buildingHeight + 10 - awningHeight },
                { x: right.x + awningExtend, y: right.y + awningExtend / 2 - buildingHeight + 10 - awningHeight },
            ]);
            graphics.fill(awningBlue);

            // Awning stripes (white)
            this.drawDrinkAwningStripes(graphics,
                { x: right.x + awningExtend, y: right.y + awningExtend / 2 - buildingHeight + 10 },
                { x: bottom.x, y: bottom.y - buildingHeight + 10 },
                awningHeight);

        } else if (serviceWall === 1) {
            // Front-left wall (west facing)
            const wallDx = left.x - bottom.x;
            const wallDy = left.y - bottom.y;

            const t1 = 0.15;
            const t2 = 0.55;
            const windowTop = buildingHeight * 0.65;
            const windowBottom = buildingHeight * 0.25;

            const wx1 = bottom.x + wallDx * t1;
            const wy1 = bottom.y + wallDy * t1;
            const wx2 = bottom.x + wallDx * t2;
            const wy2 = bottom.y + wallDy * t2;

            // Window
            graphics.poly([
                { x: wx1, y: wy1 - windowBottom },
                { x: wx2, y: wy2 - windowBottom },
                { x: wx2, y: wy2 - windowTop },
                { x: wx1, y: wy1 - windowTop },
            ]);
            graphics.fill(0x222222);
            graphics.stroke({ color: 0x66ddff, width: 2 });

            // Counter shelf
            graphics.poly([
                { x: wx1, y: wy1 - windowBottom },
                { x: wx2, y: wy2 - windowBottom },
                { x: wx2 - 3, y: wy2 - windowBottom + 2 },
                { x: wx1 - 3, y: wy1 - windowBottom + 2 },
            ]);
            graphics.fill(0x555555);

            // Awning
            graphics.poly([
                { x: bottom.x, y: bottom.y - buildingHeight + 10 },
                { x: left.x - awningExtend, y: left.y + awningExtend / 2 - buildingHeight + 10 },
                { x: left.x - awningExtend, y: left.y + awningExtend / 2 - buildingHeight + 10 - awningHeight },
                { x: bottom.x, y: bottom.y - buildingHeight + 10 - awningHeight },
            ]);
            graphics.fill(awningBlueDark);
        }

        // Flat roof (white/light gray)
        graphics.poly([
            { x: top.x, y: top.y - buildingHeight },
            { x: right.x, y: right.y - buildingHeight },
            { x: bottom.x, y: bottom.y - buildingHeight },
            { x: left.x, y: left.y - buildingHeight },
        ]);
        graphics.fill(roofWhite);

        // Cup icon on top
        const cupX = (top.x + bottom.x) / 2;
        const cupY = (top.y + bottom.y) / 2 - buildingHeight - 6;

        // Cup body (tall rectangle shape in isometric)
        graphics.poly([
            { x: cupX - 5, y: cupY + 8 },
            { x: cupX + 5, y: cupY + 8 },
            { x: cupX + 4, y: cupY - 4 },
            { x: cupX - 4, y: cupY - 4 },
        ]);
        graphics.fill(0xffffff);
        graphics.stroke({ color: 0x3399ff, width: 1 });

        // Lid
        graphics.ellipse(cupX, cupY - 5, 6, 3);
        graphics.fill(0x3399ff);

        // Straw
        graphics.moveTo(cupX + 2, cupY - 5);
        graphics.lineTo(cupX + 4, cupY - 12);
        graphics.stroke({ color: 0xff6666, width: 2 });

        // Edge highlights
        graphics.moveTo(bottom.x, bottom.y);
        graphics.lineTo(bottom.x, bottom.y - buildingHeight);
        graphics.stroke({ color: 0x116677, width: 1 });

        graphics.moveTo(right.x, right.y);
        graphics.lineTo(right.x, right.y - buildingHeight);
        graphics.stroke({ color: 0x116677, width: 1 });
    }

    /**
     * Draw white striped awning pattern for drink stand
     */
    private drawDrinkAwningStripes(
        graphics: Graphics,
        start: { x: number; y: number },
        end: { x: number; y: number },
        awningHeight: number
    ): void {
        const stripeCount = 4;
        for (let i = 0; i < stripeCount; i += 2) {
            const t1 = i / stripeCount;
            const t2 = (i + 1) / stripeCount;

            const x1 = start.x + (end.x - start.x) * t1;
            const y1 = start.y + (end.y - start.y) * t1;
            const x2 = start.x + (end.x - start.x) * t2;
            const y2 = start.y + (end.y - start.y) * t2;

            graphics.poly([
                { x: x1, y: y1 },
                { x: x2, y: y2 },
                { x: x2, y: y2 - awningHeight },
                { x: x1, y: y1 - awningHeight },
            ]);
            graphics.fill(0xffffff);
        }
    }

    /**
     * Draw vending machine (1x1) - tall rectangular machine with display
     */
    private drawVendingMachine(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        buildingHeight: number,
        rotation: number = 0
    ): void {
        const machineHeight = buildingHeight * 0.8;

        // Colors
        const bodyBlue = 0x2244aa;
        const bodyBlueDark = 0x1a3388;
        const displayGray = 0x333333;
        const accentRed = 0xcc2222;

        const displayWall = rotation % 4;
        const displayTop = machineHeight * 0.75;
        const displayBottom = machineHeight * 0.3;

        // For rotations 2 and 3, draw back walls first, then front walls on top
        if (displayWall === 2) {
            // Display faces back-left (north)
            // First: back walls (behind)
            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - machineHeight },
                { x: top.x, y: top.y - machineHeight },
            ]);
            graphics.fill(bodyBlueDark);

            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - machineHeight },
                { x: left.x, y: left.y - machineHeight },
            ]);
            graphics.fill(bodyBlue);

            // Display on back-left wall
            const wallDx = top.x - left.x;
            const wallDy = top.y - left.y;
            graphics.poly([
                { x: left.x + wallDx * 0.15, y: left.y + wallDy * 0.15 - displayBottom },
                { x: left.x + wallDx * 0.85, y: left.y + wallDy * 0.85 - displayBottom },
                { x: left.x + wallDx * 0.85, y: left.y + wallDy * 0.85 - displayTop },
                { x: left.x + wallDx * 0.15, y: left.y + wallDy * 0.15 - displayTop },
            ]);
            graphics.fill(displayGray);
            graphics.stroke({ color: 0x66aaff, width: 1 });

            // Coin slot
            graphics.poly([
                { x: left.x + wallDx * 0.6, y: left.y + wallDy * 0.6 - machineHeight * 0.15 },
                { x: left.x + wallDx * 0.75, y: left.y + wallDy * 0.75 - machineHeight * 0.15 },
                { x: left.x + wallDx * 0.75, y: left.y + wallDy * 0.75 - machineHeight * 0.25 },
                { x: left.x + wallDx * 0.6, y: left.y + wallDy * 0.6 - machineHeight * 0.25 },
            ]);
            graphics.fill(0x444444);

            // Then: front walls (in front)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - machineHeight },
                { x: bottom.x, y: bottom.y - machineHeight },
            ]);
            graphics.fill(bodyBlueDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - machineHeight },
                { x: right.x, y: right.y - machineHeight },
            ]);
            graphics.fill(bodyBlue);
        } else if (displayWall === 3) {
            // Display faces back-right (east)
            // First: back walls (behind)
            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - machineHeight },
                { x: left.x, y: left.y - machineHeight },
            ]);
            graphics.fill(bodyBlueDark);

            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - machineHeight },
                { x: top.x, y: top.y - machineHeight },
            ]);
            graphics.fill(bodyBlue);

            // Display on back-right wall
            const wallDx = right.x - top.x;
            const wallDy = right.y - top.y;
            graphics.poly([
                { x: top.x + wallDx * 0.15, y: top.y + wallDy * 0.15 - displayBottom },
                { x: top.x + wallDx * 0.85, y: top.y + wallDy * 0.85 - displayBottom },
                { x: top.x + wallDx * 0.85, y: top.y + wallDy * 0.85 - displayTop },
                { x: top.x + wallDx * 0.15, y: top.y + wallDy * 0.15 - displayTop },
            ]);
            graphics.fill(displayGray);
            graphics.stroke({ color: 0x66aaff, width: 1 });

            // Coin slot
            graphics.poly([
                { x: top.x + wallDx * 0.6, y: top.y + wallDy * 0.6 - machineHeight * 0.15 },
                { x: top.x + wallDx * 0.75, y: top.y + wallDy * 0.75 - machineHeight * 0.15 },
                { x: top.x + wallDx * 0.75, y: top.y + wallDy * 0.75 - machineHeight * 0.25 },
                { x: top.x + wallDx * 0.6, y: top.y + wallDy * 0.6 - machineHeight * 0.25 },
            ]);
            graphics.fill(0x444444);

            // Then: front walls (in front)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - machineHeight },
                { x: bottom.x, y: bottom.y - machineHeight },
            ]);
            graphics.fill(bodyBlueDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - machineHeight },
                { x: right.x, y: right.y - machineHeight },
            ]);
            graphics.fill(bodyBlue);
        } else {
            // Rotations 0 and 1 - normal front wall display
            // Front-left wall (darker)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - machineHeight },
                { x: bottom.x, y: bottom.y - machineHeight },
            ]);
            graphics.fill(bodyBlueDark);

            // Front-right wall (brighter)
            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - machineHeight },
                { x: right.x, y: right.y - machineHeight },
            ]);
            graphics.fill(bodyBlue);

            if (displayWall === 0) {
                // Front-right wall (south)
                const wallDx = bottom.x - right.x;
                const wallDy = bottom.y - right.y;

                graphics.poly([
                    { x: right.x + wallDx * 0.15, y: right.y + wallDy * 0.15 - displayBottom },
                    { x: right.x + wallDx * 0.85, y: right.y + wallDy * 0.85 - displayBottom },
                    { x: right.x + wallDx * 0.85, y: right.y + wallDy * 0.85 - displayTop },
                    { x: right.x + wallDx * 0.15, y: right.y + wallDy * 0.15 - displayTop },
                ]);
                graphics.fill(displayGray);
                graphics.stroke({ color: 0x66aaff, width: 1 });

                // Coin slot
                graphics.poly([
                    { x: right.x + wallDx * 0.6, y: right.y + wallDy * 0.6 - machineHeight * 0.15 },
                    { x: right.x + wallDx * 0.75, y: right.y + wallDy * 0.75 - machineHeight * 0.15 },
                    { x: right.x + wallDx * 0.75, y: right.y + wallDy * 0.75 - machineHeight * 0.25 },
                    { x: right.x + wallDx * 0.6, y: right.y + wallDy * 0.6 - machineHeight * 0.25 },
                ]);
                graphics.fill(0x444444);
            } else {
                // Front-left wall (west)
                const wallDx = left.x - bottom.x;
                const wallDy = left.y - bottom.y;

                graphics.poly([
                    { x: bottom.x + wallDx * 0.15, y: bottom.y + wallDy * 0.15 - displayBottom },
                    { x: bottom.x + wallDx * 0.85, y: bottom.y + wallDy * 0.85 - displayBottom },
                    { x: bottom.x + wallDx * 0.85, y: bottom.y + wallDy * 0.85 - displayTop },
                    { x: bottom.x + wallDx * 0.15, y: bottom.y + wallDy * 0.15 - displayTop },
                ]);
                graphics.fill(displayGray);
                graphics.stroke({ color: 0x66aaff, width: 1 });

                // Coin slot
                graphics.poly([
                    { x: bottom.x + wallDx * 0.6, y: bottom.y + wallDy * 0.6 - machineHeight * 0.15 },
                    { x: bottom.x + wallDx * 0.75, y: bottom.y + wallDy * 0.75 - machineHeight * 0.15 },
                    { x: bottom.x + wallDx * 0.75, y: bottom.y + wallDy * 0.75 - machineHeight * 0.25 },
                    { x: bottom.x + wallDx * 0.6, y: bottom.y + wallDy * 0.6 - machineHeight * 0.25 },
                ]);
                graphics.fill(0x444444);
            }
        }

        // Top of machine
        graphics.poly([
            { x: top.x, y: top.y - machineHeight },
            { x: right.x, y: right.y - machineHeight },
            { x: bottom.x, y: bottom.y - machineHeight },
            { x: left.x, y: left.y - machineHeight },
        ]);
        graphics.fill(bodyBlueDark);

        // Red accent stripe on top
        graphics.poly([
            { x: top.x, y: top.y - machineHeight - 3 },
            { x: right.x, y: right.y - machineHeight - 3 },
            { x: bottom.x, y: bottom.y - machineHeight - 3 },
            { x: left.x, y: left.y - machineHeight - 3 },
        ]);
        graphics.fill(accentRed);
    }

    /**
     * Draw gift shop (3x3) - colorful building with large windows and gift box on top
     */
    private drawGiftShop(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        buildingHeight: number,
        rotation: number = 0
    ): void {
        // Colors - bright pink/purple theme
        const wallPink = 0xdd66aa;
        const wallPinkDark = 0xbb4488;
        const roofPurple = 0x8844aa;
        const windowYellow = 0xffee88;
        const doorBrown = 0x8b4513;

        const entranceWall = rotation % 4;

        // Helper to draw windows on a wall
        const drawWindows = (startX: number, startY: number, dx: number, dy: number) => {
            // Window 1
            graphics.poly([
                { x: startX + dx * 0.1, y: startY + dy * 0.1 - buildingHeight * 0.2 },
                { x: startX + dx * 0.4, y: startY + dy * 0.4 - buildingHeight * 0.2 },
                { x: startX + dx * 0.4, y: startY + dy * 0.4 - buildingHeight * 0.7 },
                { x: startX + dx * 0.1, y: startY + dy * 0.1 - buildingHeight * 0.7 },
            ]);
            graphics.fill(windowYellow);
            graphics.stroke({ color: 0xffffff, width: 2 });

            // Window 2
            graphics.poly([
                { x: startX + dx * 0.5, y: startY + dy * 0.5 - buildingHeight * 0.2 },
                { x: startX + dx * 0.8, y: startY + dy * 0.8 - buildingHeight * 0.2 },
                { x: startX + dx * 0.8, y: startY + dy * 0.8 - buildingHeight * 0.7 },
                { x: startX + dx * 0.5, y: startY + dy * 0.5 - buildingHeight * 0.7 },
            ]);
            graphics.fill(windowYellow);
            graphics.stroke({ color: 0xffffff, width: 2 });
        };

        // Helper to draw door on a wall
        const drawDoor = (startX: number, startY: number, dx: number, dy: number) => {
            graphics.poly([
                { x: startX + dx * 0.3, y: startY + dy * 0.3 },
                { x: startX + dx * 0.6, y: startY + dy * 0.6 },
                { x: startX + dx * 0.6, y: startY + dy * 0.6 - buildingHeight * 0.6 },
                { x: startX + dx * 0.3, y: startY + dy * 0.3 - buildingHeight * 0.6 },
            ]);
            graphics.fill(doorBrown);
            graphics.stroke({ color: 0x5a3510, width: 2 });
        };

        // Door positions must match interaction point transforms (shifted 90 CCW):
        // rotation 0: interaction at (2,1) = right edge (x=2) = front-right wall
        // rotation 1: interaction at (1,2) = front edge (y=2) = front-left wall
        // rotation 2: interaction at (0,1) = left edge (x=0) = back-left wall
        // rotation 3: interaction at (1,0) = back edge (y=0) = back-right wall

        if (entranceWall === 2) {
            // Door on left edge (back-left wall) - draw back walls first
            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - buildingHeight },
                { x: top.x, y: top.y - buildingHeight },
            ]);
            graphics.fill(wallPinkDark);
            drawWindows(top.x, top.y, right.x - top.x, right.y - top.y);

            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - buildingHeight },
                { x: left.x, y: left.y - buildingHeight },
            ]);
            graphics.fill(wallPink);
            drawDoor(left.x, left.y, top.x - left.x, top.y - left.y);

            // Front walls on top
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - buildingHeight },
                { x: bottom.x, y: bottom.y - buildingHeight },
            ]);
            graphics.fill(wallPinkDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - buildingHeight },
                { x: right.x, y: right.y - buildingHeight },
            ]);
            graphics.fill(wallPink);
        } else if (entranceWall === 3) {
            // Door on back edge (back-right wall) - draw back walls first
            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - buildingHeight },
                { x: left.x, y: left.y - buildingHeight },
            ]);
            graphics.fill(wallPinkDark);
            drawWindows(left.x, left.y, top.x - left.x, top.y - left.y);

            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - buildingHeight },
                { x: top.x, y: top.y - buildingHeight },
            ]);
            graphics.fill(wallPink);
            drawDoor(top.x, top.y, right.x - top.x, right.y - top.y);

            // Front walls on top
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - buildingHeight },
                { x: bottom.x, y: bottom.y - buildingHeight },
            ]);
            graphics.fill(wallPinkDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - buildingHeight },
                { x: right.x, y: right.y - buildingHeight },
            ]);
            graphics.fill(wallPink);
        } else if (entranceWall === 1) {
            // Door on front edge (front-left wall) - normal front view
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - buildingHeight },
                { x: bottom.x, y: bottom.y - buildingHeight },
            ]);
            graphics.fill(wallPinkDark);
            drawDoor(bottom.x, bottom.y, left.x - bottom.x, left.y - bottom.y);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - buildingHeight },
                { x: right.x, y: right.y - buildingHeight },
            ]);
            graphics.fill(wallPink);
            drawWindows(right.x, right.y, bottom.x - right.x, bottom.y - right.y);
        } else {
            // entranceWall === 0: Door on right edge (front-right wall)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - buildingHeight },
                { x: bottom.x, y: bottom.y - buildingHeight },
            ]);
            graphics.fill(wallPinkDark);
            drawWindows(bottom.x, bottom.y, left.x - bottom.x, left.y - bottom.y);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - buildingHeight },
                { x: right.x, y: right.y - buildingHeight },
            ]);
            graphics.fill(wallPink);
            drawDoor(right.x, right.y, bottom.x - right.x, bottom.y - right.y);
        }

        // Roof
        graphics.poly([
            { x: top.x, y: top.y - buildingHeight },
            { x: right.x, y: right.y - buildingHeight },
            { x: bottom.x, y: bottom.y - buildingHeight },
            { x: left.x, y: left.y - buildingHeight },
        ]);
        graphics.fill(roofPurple);

        // Gift box on roof
        const boxSize = 12;
        const centerX = (top.x + bottom.x) / 2;
        const centerY = (top.y + bottom.y) / 2 - buildingHeight;

        // Box body
        graphics.rect(centerX - boxSize / 2, centerY - boxSize - 4, boxSize, boxSize);
        graphics.fill(0xff4488);
        graphics.stroke({ color: 0xffdd00, width: 3 });

        // Bow on top
        graphics.circle(centerX, centerY - boxSize - 8, 4);
        graphics.fill(0xffdd00);
    }

    /**
     * Draw restaurant (3x2) - large dining establishment with windows and entrance
     * Door is on the right tile of the 2-tile side
     */
    private drawRestaurant(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        buildingHeight: number,
        rotation: number = 0
    ): void {
        // Colors - warm restaurant theme
        const wallBrown = 0x8b4513;
        const wallBrownDark = 0x6b3410;
        const roofRed = 0xaa3333;
        const windowYellow = 0xffee99;
        const doorBrown = 0x4a2810;
        const awningRed = 0xcc4444;
        const awningRedDark = 0x993333;

        const entranceWall = rotation % 4;

        // Helper to draw window
        const drawWindow = (startX: number, startY: number, dx: number, dy: number, pos: number, width: number = 0.2) => {
            graphics.poly([
                { x: startX + dx * pos, y: startY + dy * pos - buildingHeight * 0.25 },
                { x: startX + dx * (pos + width), y: startY + dy * (pos + width) - buildingHeight * 0.25 },
                { x: startX + dx * (pos + width), y: startY + dy * (pos + width) - buildingHeight * 0.7 },
                { x: startX + dx * pos, y: startY + dy * pos - buildingHeight * 0.7 },
            ]);
            graphics.fill(windowYellow);
            graphics.stroke({ color: 0x654321, width: 2 });
        };

        // Helper to draw door with awning on specific position (0-1 range)
        const drawDoor = (startX: number, startY: number, dx: number, dy: number, doorStart: number, awningColor: number) => {
            const doorEnd = doorStart + 0.25;

            // Door
            graphics.poly([
                { x: startX + dx * doorStart, y: startY + dy * doorStart },
                { x: startX + dx * doorEnd, y: startY + dy * doorEnd },
                { x: startX + dx * doorEnd, y: startY + dy * doorEnd - buildingHeight * 0.65 },
                { x: startX + dx * doorStart, y: startY + dy * doorStart - buildingHeight * 0.65 },
            ]);
            graphics.fill(doorBrown);
            graphics.stroke({ color: 0x3a1800, width: 2 });

            // Door window
            graphics.poly([
                { x: startX + dx * (doorStart + 0.03), y: startY + dy * (doorStart + 0.03) - buildingHeight * 0.35 },
                { x: startX + dx * (doorEnd - 0.03), y: startY + dy * (doorEnd - 0.03) - buildingHeight * 0.35 },
                { x: startX + dx * (doorEnd - 0.03), y: startY + dy * (doorEnd - 0.03) - buildingHeight * 0.55 },
                { x: startX + dx * (doorStart + 0.03), y: startY + dy * (doorStart + 0.03) - buildingHeight * 0.55 },
            ]);
            graphics.fill(windowYellow);

            // Awning over entrance
            const awningExtend = 6;
            graphics.poly([
                { x: startX + dx * (doorStart - 0.05), y: startY + dy * (doorStart - 0.05) - buildingHeight * 0.7 },
                { x: startX + dx * (doorEnd + 0.05), y: startY + dy * (doorEnd + 0.05) - buildingHeight * 0.7 },
                { x: startX + dx * (doorEnd + 0.05) + awningExtend, y: startY + dy * (doorEnd + 0.05) + awningExtend / 2 - buildingHeight * 0.7 + 4 },
                { x: startX + dx * (doorStart - 0.05) + awningExtend, y: startY + dy * (doorStart - 0.05) + awningExtend / 2 - buildingHeight * 0.7 + 4 },
            ]);
            graphics.fill(awningColor);
        };

        // Helper to draw facade on a 2-tile wall (door on right half = higher position)
        const drawFacade2Tile = (startX: number, startY: number, dx: number, dy: number, awningColor: number) => {
            // Window on left half
            drawWindow(startX, startY, dx, dy, 0.1, 0.3);
            // Door on right half (position 0.55 to 0.8)
            drawDoor(startX, startY, dx, dy, 0.55, awningColor);
        };

        // Helper to draw facade on a 3-tile wall (windows with no door)
        const drawFacade3Tile = (startX: number, startY: number, dx: number, dy: number) => {
            drawWindow(startX, startY, dx, dy, 0.08, 0.18);
            drawWindow(startX, startY, dx, dy, 0.41, 0.18);
            drawWindow(startX, startY, dx, dy, 0.74, 0.18);
        };

        if (entranceWall === 2) {
            // Entrance on back-left (north) - draw back walls first, then front walls on top
            // First: back walls (behind)
            // Back-right wall (3-tile, no door)
            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - buildingHeight },
                { x: top.x, y: top.y - buildingHeight },
            ]);
            graphics.fill(wallBrownDark);
            drawFacade3Tile(top.x, top.y, right.x - top.x, right.y - top.y);

            // Back-left wall (2-tile, with door)
            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - buildingHeight },
                { x: left.x, y: left.y - buildingHeight },
            ]);
            graphics.fill(wallBrown);
            drawFacade2Tile(left.x, left.y, top.x - left.x, top.y - left.y, awningRed);

            // Then: front walls (in front)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - buildingHeight },
                { x: bottom.x, y: bottom.y - buildingHeight },
            ]);
            graphics.fill(wallBrownDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - buildingHeight },
                { x: right.x, y: right.y - buildingHeight },
            ]);
            graphics.fill(wallBrown);
        } else if (entranceWall === 3) {
            // Entrance on back-right (east) - draw back walls first, then front walls on top
            // First: back walls (behind)
            // Back-left wall (3-tile, no door)
            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - buildingHeight },
                { x: left.x, y: left.y - buildingHeight },
            ]);
            graphics.fill(wallBrownDark);
            drawFacade3Tile(left.x, left.y, top.x - left.x, top.y - left.y);

            // Back-right wall (2-tile, with door)
            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - buildingHeight },
                { x: top.x, y: top.y - buildingHeight },
            ]);
            graphics.fill(wallBrown);
            drawFacade2Tile(top.x, top.y, right.x - top.x, right.y - top.y, awningRed);

            // Then: front walls (in front)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - buildingHeight },
                { x: bottom.x, y: bottom.y - buildingHeight },
            ]);
            graphics.fill(wallBrownDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - buildingHeight },
                { x: right.x, y: right.y - buildingHeight },
            ]);
            graphics.fill(wallBrown);
        } else {
            // Front-left wall (darker, 3-tile at rot 0, 2-tile at rot 1)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - buildingHeight },
                { x: bottom.x, y: bottom.y - buildingHeight },
            ]);
            graphics.fill(wallBrownDark);

            // Front-right wall (brighter)
            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - buildingHeight },
                { x: right.x, y: right.y - buildingHeight },
            ]);
            graphics.fill(wallBrown);

            if (entranceWall === 0) {
                // Facade on front-right wall (2-tile, with door)
                drawFacade2Tile(right.x, right.y, bottom.x - right.x, bottom.y - right.y, awningRed);
                // Windows on front-left wall (3-tile)
                drawFacade3Tile(bottom.x, bottom.y, left.x - bottom.x, left.y - bottom.y);
            } else {
                // Facade on front-left wall (2-tile, with door)
                drawFacade2Tile(bottom.x, bottom.y, left.x - bottom.x, left.y - bottom.y, awningRedDark);
                // Windows on front-right wall (3-tile)
                drawFacade3Tile(right.x, right.y, bottom.x - right.x, bottom.y - right.y);
            }
        }

        // Roof
        graphics.poly([
            { x: top.x, y: top.y - buildingHeight },
            { x: right.x, y: right.y - buildingHeight },
            { x: bottom.x, y: bottom.y - buildingHeight },
            { x: left.x, y: left.y - buildingHeight },
        ]);
        graphics.fill(roofRed);

        // Restaurant sign on roof
        const signX = (top.x + bottom.x) / 2;
        const signY = top.y - buildingHeight - 6;

        // Sign background
        graphics.roundRect(signX - 15, signY - 8, 30, 14, 2);
        graphics.fill(0xffffff);
        graphics.stroke({ color: 0x8b4513, width: 2 });

        // Fork and knife icons (simplified)
        graphics.moveTo(signX - 8, signY - 5);
        graphics.lineTo(signX - 8, signY + 3);
        graphics.stroke({ color: 0x666666, width: 2 });

        graphics.moveTo(signX + 8, signY - 5);
        graphics.lineTo(signX + 8, signY + 3);
        graphics.stroke({ color: 0x666666, width: 2 });

        // Plate circle
        graphics.circle(signX, signY - 1, 5);
        graphics.stroke({ color: 0x666666, width: 1.5 });
    }

    /**
     * Draw bathroom (1x1) - small building with restroom sign
     */
    private drawBathroom(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        buildingHeight: number,
        rotation: number = 0
    ): void {
        const height = buildingHeight * 0.7;

        // Colors - clean blue/white theme
        const wallBlue = 0x4488cc;
        const wallBlueDark = 0x336699;
        const roofWhite = 0xeeeeee;
        const doorColor = 0x224466;

        const doorWall = rotation % 4;

        // Helper to draw door on a wall
        const drawDoor = (startX: number, startY: number, dx: number, dy: number) => {
            graphics.poly([
                { x: startX + dx * 0.2, y: startY + dy * 0.2 },
                { x: startX + dx * 0.8, y: startY + dy * 0.8 },
                { x: startX + dx * 0.8, y: startY + dy * 0.8 - height * 0.75 },
                { x: startX + dx * 0.2, y: startY + dy * 0.2 - height * 0.75 },
            ]);
            graphics.fill(doorColor);
            graphics.stroke({ color: 0x66aacc, width: 1 });
        };

        if (doorWall === 2) {
            // Door on back-left (north) - draw back walls first, then front walls on top
            // First: back walls (behind)
            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - height },
                { x: top.x, y: top.y - height },
            ]);
            graphics.fill(wallBlueDark);

            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - height },
                { x: left.x, y: left.y - height },
            ]);
            graphics.fill(wallBlue);
            drawDoor(left.x, left.y, top.x - left.x, top.y - left.y);

            // Then: front walls (in front)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - height },
                { x: bottom.x, y: bottom.y - height },
            ]);
            graphics.fill(wallBlueDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - height },
                { x: right.x, y: right.y - height },
            ]);
            graphics.fill(wallBlue);
        } else if (doorWall === 3) {
            // Door on back-right (east) - draw back walls first, then front walls on top
            // First: back walls (behind)
            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - height },
                { x: left.x, y: left.y - height },
            ]);
            graphics.fill(wallBlueDark);

            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - height },
                { x: top.x, y: top.y - height },
            ]);
            graphics.fill(wallBlue);
            drawDoor(top.x, top.y, right.x - top.x, right.y - top.y);

            // Then: front walls (in front)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - height },
                { x: bottom.x, y: bottom.y - height },
            ]);
            graphics.fill(wallBlueDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - height },
                { x: right.x, y: right.y - height },
            ]);
            graphics.fill(wallBlue);
        } else {
            // Front-left wall (darker)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - height },
                { x: bottom.x, y: bottom.y - height },
            ]);
            graphics.fill(wallBlueDark);

            // Front-right wall (brighter)
            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - height },
                { x: right.x, y: right.y - height },
            ]);
            graphics.fill(wallBlue);

            if (doorWall === 0) {
                // Door on front-right
                drawDoor(right.x, right.y, bottom.x - right.x, bottom.y - right.y);
            } else {
                // Door on front-left
                drawDoor(bottom.x, bottom.y, left.x - bottom.x, left.y - bottom.y);
            }
        }

        // Roof
        graphics.poly([
            { x: top.x, y: top.y - height },
            { x: right.x, y: right.y - height },
            { x: bottom.x, y: bottom.y - height },
            { x: left.x, y: left.y - height },
        ]);
        graphics.fill(roofWhite);

        // Restroom sign (simple person icon)
        const signX = (top.x + bottom.x) / 2;
        const signY = (right.y + left.y) / 2 - height * 0.5;

        // Sign background
        graphics.circle(signX, signY, 6);
        graphics.fill(0xffffff);
        graphics.stroke({ color: 0x4488cc, width: 1 });

        // Person silhouette (simple)
        graphics.circle(signX, signY - 2, 2);
        graphics.fill(0x4488cc);
        graphics.rect(signX - 2, signY, 4, 4);
        graphics.fill(0x4488cc);
    }

    /**
     * Draw large bathroom (1x2) - bigger building with more details
     */
    private drawBathroomLarge(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        buildingHeight: number,
        rotation: number = 0
    ): void {
        const height = buildingHeight * 0.8;

        // Colors - clean blue/white theme
        const wallBlue = 0x4488cc;
        const wallBlueDark = 0x336699;
        const roofWhite = 0xeeeeee;
        const doorColor = 0x224466;

        const doorWall = rotation % 4;

        // Helper to draw two doors on a wall
        const drawDoors = (startX: number, startY: number, dx: number, dy: number) => {
            // Door 1 (men's - blue accent)
            graphics.poly([
                { x: startX + dx * 0.1, y: startY + dy * 0.1 },
                { x: startX + dx * 0.4, y: startY + dy * 0.4 },
                { x: startX + dx * 0.4, y: startY + dy * 0.4 - height * 0.7 },
                { x: startX + dx * 0.1, y: startY + dy * 0.1 - height * 0.7 },
            ]);
            graphics.fill(doorColor);
            graphics.stroke({ color: 0x66aacc, width: 1 });

            // Door 2 (women's - pink accent)
            graphics.poly([
                { x: startX + dx * 0.55, y: startY + dy * 0.55 },
                { x: startX + dx * 0.85, y: startY + dy * 0.85 },
                { x: startX + dx * 0.85, y: startY + dy * 0.85 - height * 0.7 },
                { x: startX + dx * 0.55, y: startY + dy * 0.55 - height * 0.7 },
            ]);
            graphics.fill(doorColor);
            graphics.stroke({ color: 0xcc6688, width: 1 });
        };

        if (doorWall === 2) {
            // Doors on back-left (north) - draw back walls first, then front walls on top
            // First: back walls (behind)
            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - height },
                { x: top.x, y: top.y - height },
            ]);
            graphics.fill(wallBlueDark);

            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - height },
                { x: left.x, y: left.y - height },
            ]);
            graphics.fill(wallBlue);
            drawDoors(left.x, left.y, top.x - left.x, top.y - left.y);

            // Then: front walls (in front)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - height },
                { x: bottom.x, y: bottom.y - height },
            ]);
            graphics.fill(wallBlueDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - height },
                { x: right.x, y: right.y - height },
            ]);
            graphics.fill(wallBlue);
        } else if (doorWall === 3) {
            // Doors on back-right (east) - draw back walls first, then front walls on top
            // First: back walls (behind)
            graphics.poly([
                { x: left.x, y: left.y },
                { x: top.x, y: top.y },
                { x: top.x, y: top.y - height },
                { x: left.x, y: left.y - height },
            ]);
            graphics.fill(wallBlueDark);

            graphics.poly([
                { x: top.x, y: top.y },
                { x: right.x, y: right.y },
                { x: right.x, y: right.y - height },
                { x: top.x, y: top.y - height },
            ]);
            graphics.fill(wallBlue);
            drawDoors(top.x, top.y, right.x - top.x, right.y - top.y);

            // Then: front walls (in front)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - height },
                { x: bottom.x, y: bottom.y - height },
            ]);
            graphics.fill(wallBlueDark);

            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - height },
                { x: right.x, y: right.y - height },
            ]);
            graphics.fill(wallBlue);
        } else {
            // Front-left wall (darker)
            graphics.poly([
                { x: bottom.x, y: bottom.y },
                { x: left.x, y: left.y },
                { x: left.x, y: left.y - height },
                { x: bottom.x, y: bottom.y - height },
            ]);
            graphics.fill(wallBlueDark);

            // Front-right wall (brighter)
            graphics.poly([
                { x: right.x, y: right.y },
                { x: bottom.x, y: bottom.y },
                { x: bottom.x, y: bottom.y - height },
                { x: right.x, y: right.y - height },
            ]);
            graphics.fill(wallBlue);

            if (doorWall === 0) {
                // Doors on front-right
                drawDoors(right.x, right.y, bottom.x - right.x, bottom.y - right.y);
            } else {
                // Doors on front-left
                drawDoors(bottom.x, bottom.y, left.x - bottom.x, left.y - bottom.y);
            }
        }

        // Roof
        graphics.poly([
            { x: top.x, y: top.y - height },
            { x: right.x, y: right.y - height },
            { x: bottom.x, y: bottom.y - height },
            { x: left.x, y: left.y - height },
        ]);
        graphics.fill(roofWhite);

        // Large restroom sign on roof
        const signX = (top.x + bottom.x) / 2;
        const signY = top.y - height - 8;

        graphics.roundRect(signX - 10, signY - 6, 20, 12, 2);
        graphics.fill(0xffffff);
        graphics.stroke({ color: 0x4488cc, width: 2 });

        // WC text simulation with simple shapes
        graphics.rect(signX - 6, signY - 2, 3, 4);
        graphics.fill(0x4488cc);
        graphics.rect(signX + 2, signY - 2, 3, 4);
        graphics.fill(0x4488cc);
    }

    /**
     * Draw trash can (1x1) - small cylindrical can
     */
    private drawTrashCan(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        rotation: number = 0
    ): void {
        const canHeight = 18;
        const centerX = (top.x + bottom.x) / 2;
        const centerY = (top.y + bottom.y) / 2;

        // Colors
        const canGreen = 0x228833;
        const canGreenDark = 0x1a6628;
        const lidGray = 0x555555;

        // Can body (hexagonal to simulate cylinder in isometric)
        const rx = 10;
        const ry = 6;

        // Body
        graphics.poly([
            { x: centerX - rx, y: centerY },
            { x: centerX - rx * 0.5, y: centerY + ry },
            { x: centerX + rx * 0.5, y: centerY + ry },
            { x: centerX + rx, y: centerY },
            { x: centerX + rx, y: centerY - canHeight },
            { x: centerX + rx * 0.5, y: centerY - canHeight + ry * 0.5 },
            { x: centerX - rx * 0.5, y: centerY - canHeight + ry * 0.5 },
            { x: centerX - rx, y: centerY - canHeight },
        ]);
        graphics.fill(canGreen);

        // Darker side
        graphics.poly([
            { x: centerX, y: centerY + ry * 0.7 },
            { x: centerX + rx * 0.5, y: centerY + ry },
            { x: centerX + rx, y: centerY },
            { x: centerX + rx, y: centerY - canHeight },
            { x: centerX, y: centerY - canHeight + ry * 0.3 },
        ]);
        graphics.fill(canGreenDark);

        // Lid (ellipse top)
        graphics.ellipse(centerX, centerY - canHeight, rx, ry * 0.7);
        graphics.fill(lidGray);

        // Recycling symbol hint (three small marks)
        graphics.moveTo(centerX - 3, centerY - canHeight * 0.5);
        graphics.lineTo(centerX, centerY - canHeight * 0.4);
        graphics.lineTo(centerX + 3, centerY - canHeight * 0.5);
        graphics.stroke({ color: 0xaaffaa, width: 2 });
    }

    /**
     * Draw bench (1x1) - simple wooden bench
     */
    private drawBench(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        rotation: number = 0
    ): void {
        const benchHeight = 10;
        const legHeight = 8;
        const centerX = (top.x + bottom.x) / 2;
        const centerY = (top.y + bottom.y) / 2;

        // Colors
        const woodBrown = 0x8b5a2b;
        const woodBrownDark = 0x6b4423;
        const legGray = 0x444444;

        // Bench seat (rectangular slab)
        const seatWidth = 24;
        const seatDepth = 10;

        // Seat top
        graphics.poly([
            { x: centerX, y: centerY - seatDepth / 2 - benchHeight },
            { x: centerX + seatWidth / 2, y: centerY - benchHeight },
            { x: centerX, y: centerY + seatDepth / 2 - benchHeight },
            { x: centerX - seatWidth / 2, y: centerY - benchHeight },
        ]);
        graphics.fill(woodBrown);

        // Seat front edge
        graphics.poly([
            { x: centerX + seatWidth / 2, y: centerY - benchHeight },
            { x: centerX, y: centerY + seatDepth / 2 - benchHeight },
            { x: centerX, y: centerY + seatDepth / 2 - benchHeight + 3 },
            { x: centerX + seatWidth / 2, y: centerY - benchHeight + 3 },
        ]);
        graphics.fill(woodBrownDark);

        // Seat side edge
        graphics.poly([
            { x: centerX, y: centerY + seatDepth / 2 - benchHeight },
            { x: centerX - seatWidth / 2, y: centerY - benchHeight },
            { x: centerX - seatWidth / 2, y: centerY - benchHeight + 3 },
            { x: centerX, y: centerY + seatDepth / 2 - benchHeight + 3 },
        ]);
        graphics.fill(woodBrownDark);

        // Legs (4 small rectangles)
        const legPositions = [
            { x: centerX - seatWidth / 3, y: centerY - seatDepth / 3 },
            { x: centerX + seatWidth / 3, y: centerY - seatDepth / 3 },
            { x: centerX - seatWidth / 3, y: centerY + seatDepth / 3 },
            { x: centerX + seatWidth / 3, y: centerY + seatDepth / 3 },
        ];

        for (const leg of legPositions) {
            graphics.rect(leg.x - 2, leg.y - benchHeight + 3, 4, legHeight);
            graphics.fill(legGray);
        }

        // Backrest
        graphics.poly([
            { x: centerX - seatWidth / 2 + 2, y: centerY - 3 - benchHeight - 8 },
            { x: centerX, y: centerY - seatDepth / 2 + 2 - benchHeight - 8 },
            { x: centerX, y: centerY - seatDepth / 2 + 2 - benchHeight - 4 },
            { x: centerX - seatWidth / 2 + 2, y: centerY - 3 - benchHeight - 4 },
        ]);
        graphics.fill(woodBrown);
    }

    /**
     * Draw picnic table (1x1) - table with attached benches
     */
    private drawPicnicTable(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        rotation: number = 0
    ): void {
        const tableHeight = 12;
        const centerX = (top.x + bottom.x) / 2;
        const centerY = (top.y + bottom.y) / 2;

        // Colors
        const woodBrown = 0x8b5a2b;
        const woodBrownDark = 0x6b4423;
        const legGray = 0x555555;

        // Table dimensions
        const tableWidth = 26;
        const tableDepth = 14;

        // Bench 1 (front-left)
        const bench1Y = centerY + tableDepth / 2 + 3;
        graphics.poly([
            { x: centerX - tableWidth / 3, y: bench1Y - 5 },
            { x: centerX + tableWidth / 3, y: bench1Y - 5 },
            { x: centerX + tableWidth / 3, y: bench1Y - 8 },
            { x: centerX - tableWidth / 3, y: bench1Y - 8 },
        ]);
        graphics.fill(woodBrown);

        // Bench 2 (back-right)
        const bench2Y = centerY - tableDepth / 2 - 3;
        graphics.poly([
            { x: centerX - tableWidth / 3, y: bench2Y - 5 },
            { x: centerX + tableWidth / 3, y: bench2Y - 5 },
            { x: centerX + tableWidth / 3, y: bench2Y - 8 },
            { x: centerX - tableWidth / 3, y: bench2Y - 8 },
        ]);
        graphics.fill(woodBrownDark);

        // Table top
        graphics.poly([
            { x: centerX, y: centerY - tableDepth / 2 - tableHeight },
            { x: centerX + tableWidth / 2, y: centerY - tableHeight },
            { x: centerX, y: centerY + tableDepth / 2 - tableHeight },
            { x: centerX - tableWidth / 2, y: centerY - tableHeight },
        ]);
        graphics.fill(woodBrown);

        // Table front edge
        graphics.poly([
            { x: centerX + tableWidth / 2, y: centerY - tableHeight },
            { x: centerX, y: centerY + tableDepth / 2 - tableHeight },
            { x: centerX, y: centerY + tableDepth / 2 - tableHeight + 3 },
            { x: centerX + tableWidth / 2, y: centerY - tableHeight + 3 },
        ]);
        graphics.fill(woodBrownDark);

        // Table side edge
        graphics.poly([
            { x: centerX, y: centerY + tableDepth / 2 - tableHeight },
            { x: centerX - tableWidth / 2, y: centerY - tableHeight },
            { x: centerX - tableWidth / 2, y: centerY - tableHeight + 3 },
            { x: centerX, y: centerY + tableDepth / 2 - tableHeight + 3 },
        ]);
        graphics.fill(woodBrownDark);

        // Center support leg
        graphics.poly([
            { x: centerX - 3, y: centerY },
            { x: centerX + 3, y: centerY },
            { x: centerX + 3, y: centerY - tableHeight + 3 },
            { x: centerX - 3, y: centerY - tableHeight + 3 },
        ]);
        graphics.fill(legGray);
    }

    /**
     * Draw a generic building
     */
    private drawGenericBuilding(
        graphics: Graphics,
        top: { x: number; y: number },
        right: { x: number; y: number },
        bottom: { x: number; y: number },
        left: { x: number; y: number },
        buildingHeight: number
    ): void {
        const wallColor = 0x888888;
        const wallDark = 0x666666;
        const roofColor = 0x555555;

        // Front-left wall
        graphics.poly([
            { x: bottom.x, y: bottom.y },
            { x: left.x, y: left.y },
            { x: left.x, y: left.y - buildingHeight },
            { x: bottom.x, y: bottom.y - buildingHeight },
        ]);
        graphics.fill(wallDark);

        // Front-right wall
        graphics.poly([
            { x: right.x, y: right.y },
            { x: bottom.x, y: bottom.y },
            { x: bottom.x, y: bottom.y - buildingHeight },
            { x: right.x, y: right.y - buildingHeight },
        ]);
        graphics.fill(wallColor);

        // Roof
        graphics.poly([
            { x: top.x, y: top.y - buildingHeight },
            { x: right.x, y: right.y - buildingHeight },
            { x: bottom.x, y: bottom.y - buildingHeight },
            { x: left.x, y: left.y - buildingHeight },
        ]);
        graphics.fill(roofColor);
    }

    /**
     * Render overlay (selection, placement preview)
     */
    private renderOverlay(): void {
        this.overlayGraphics.clear();

        const input = this.game.input;
        if (!input) return;

        // Handle gate relocation mode
        if (input.isGateRelocateMode && input.selectedExhibit) {
            this.renderGateRelocateOverlay(input);
            return;
        }

        // In touch mode, draw selected tile highlight if present
        if (input.touchMode && input.selectedTile) {
            this.drawSelectedTileHighlight(input.selectedTile.x, input.selectedTile.y);
        }

        // Get tool info
        const tool = this.game.currentTool;
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;
        const hoveredTile = input.hoveredTile;

        // Handle fence tool overlay (before hoveredTile check - need to show pending placement)
        if (tool === 'fence') {
            // In touch mode, always show start point if set (cyan)
            if (input.touchMode && input.touchFenceStart) {
                this.drawFenceFacingHighlight(input.touchFenceStart);
                this.drawEdgePreview(input.touchFenceStart, 0x00ffff, 0.9); // Cyan for start point
            }

            // In touch mode with placement ready, show the full L-shape in green
            if (input.touchMode && input.touchPlacementReady && input.touchFenceStart && input.touchFenceEnd) {
                const edges = input.calculateLShapeEdges(input.touchFenceStart, input.touchFenceEnd);
                for (const edge of edges) {
                    this.drawFenceFacingHighlight(edge);
                    this.drawEdgePreview(edge, 0x00ff00, 0.8); // Green for ready to confirm
                }
            }
            // Show L-shape preview if dragging for second point
            else if (input.isFenceDragging && input.fenceDragStart && input.hoveredEdge) {
                const edges = input.calculateLShapeEdges(input.fenceDragStart, input.hoveredEdge);
                for (const edge of edges) {
                    this.drawFenceFacingHighlight(edge);
                    this.drawEdgePreview(edge, 0xffff00, 0.7);
                }
            }
            // Touch mode selecting first point: show hovered edge preview
            else if (input.touchMode && !input.touchFenceStart && input.hoveredEdge) {
                this.drawFenceFacingHighlight(input.hoveredEdge);
                this.drawEdgePreview(input.hoveredEdge, 0xffff00, 0.5);
            }
            // Normal mode: just show hovered edge
            else if (!input.touchMode && input.hoveredEdge) {
                this.drawFenceFacingHighlight(input.hoveredEdge);
                this.drawEdgePreview(input.hoveredEdge, 0xffff00, 0.5);
            }
            return;
        }

        // Handle path tool overlay (before hoveredTile check - need to show pending placement)
        if (tool === 'path') {
            // In touch mode, always show start point if set (cyan)
            if (input.touchMode && input.touchPathStart) {
                this.drawTilePreview(input.touchPathStart.x, input.touchPathStart.y, 0x00ffff, 0.9); // Cyan for start point
            }

            // In touch mode with placement ready, show the full L-shape in green
            if (input.touchMode && input.touchPlacementReady && input.touchPathStart && input.touchPathEnd) {
                const tiles = input.calculateLShapeTiles(input.touchPathStart, input.touchPathEnd);
                for (const tile of tiles) {
                    this.drawTilePreview(tile.x, tile.y, 0x00ff00, 0.8); // Green for ready to confirm
                }
            }
            // Show L-shape preview if dragging for second point
            else if (input.isPathDragging && input.pathDragStart && hoveredTile) {
                const tiles = input.calculateLShapeTiles(input.pathDragStart, hoveredTile);
                for (const tile of tiles) {
                    this.drawTilePreview(tile.x, tile.y, 0x00aaff, 0.5);
                }
            }
            // Touch mode selecting first point: show hovered tile preview
            else if (input.touchMode && !input.touchPathStart && hoveredTile) {
                this.drawTilePreview(hoveredTile.x, hoveredTile.y, 0x00aaff, 0.5);
            }
            // Normal mode: just show hovered tile
            else if (!input.touchMode && hoveredTile) {
                this.drawTilePreview(hoveredTile.x, hoveredTile.y, 0x00aaff, 0.5);
            }
            return;
        }

        // Handle demolish tool overlay with red highlights (before hoveredTile check - need to show pending deletion)
        if (tool === 'demolish') {
            const rect = input.getDemolishRectangle();

            // Rectangle selection mode (drag or touch pending confirmation)
            if (rect) {
                // Use brighter red when ready for confirmation
                const isConfirmPending = input.touchPlacementReady;
                const baseAlpha = isConfirmPending ? 0.25 : 0.15;
                const highlightAlpha = isConfirmPending ? 0.6 : 0.5;

                // Draw red overlay on all tiles in rectangle
                for (let y = rect.minY; y <= rect.maxY; y++) {
                    for (let x = rect.minX; x <= rect.maxX; x++) {
                        const tile = this.game.world.getTile(x, y);
                        if (!tile) continue;

                        // Base red for selection area
                        this.drawTilePreview(x, y, 0xff0000, baseAlpha);

                        // Brighter red for things that will be deleted
                        if (tile.path) {
                            this.drawTilePreview(x, y, 0xff0000, highlightAlpha);
                        }

                        // Check for foliage
                        const foliageAtTile = this.game.getFoliageAtTile(x, y);
                        if (foliageAtTile.length > 0) {
                            this.drawTilePreview(x, y, 0xff0000, highlightAlpha);
                        }

                        // Check for buildings/shelters
                        const placeable = this.game.getPlaceableAtTile(x, y);
                        if (placeable) {
                            this.drawTilePreview(x, y, 0xff0000, highlightAlpha);
                        }

                        // Highlight internal fences that will be deleted
                        for (const edge of ['north', 'south', 'east', 'west'] as const) {
                            const fenceType = tile.fences[edge];
                            if (!fenceType) continue;

                            // Get adjacent tile
                            let adjX = x, adjY = y;
                            if (edge === 'north') adjY = y - 1;
                            else if (edge === 'south') adjY = y + 1;
                            else if (edge === 'east') adjX = x + 1;
                            else if (edge === 'west') adjX = x - 1;

                            // Only highlight if adjacent tile is also in rectangle
                            const isInternal = adjX >= rect.minX && adjX <= rect.maxX &&
                                               adjY >= rect.minY && adjY <= rect.maxY;
                            if (isInternal) {
                                this.drawEdgePreview({ tileX: x, tileY: y, edge }, 0xff0000, 0.7);
                            }
                        }
                    }
                }
                return;
            }

            // Single tile hover mode (only if hoveredTile available)
            if (hoveredTile) {
                const tile = this.game.world.getTile(hoveredTile.x, hoveredTile.y);
                if (tile) {
                    // Check for fence at hovered edge first (priority)
                    if (input.hoveredEdge) {
                        const edge = input.hoveredEdge.edge;
                        const fenceType = tile.fences[edge as keyof typeof tile.fences];
                        if (fenceType) {
                            // Draw red highlight on the fence edge
                            this.drawEdgePreview(input.hoveredEdge, 0xff0000, 0.7);
                            return;
                        }
                    }

                    // Check for path on tile
                    if (tile.path) {
                        this.drawTilePreview(hoveredTile.x, hoveredTile.y, 0xff0000, 0.5);
                        return;
                    }

                    // Check for foliage
                    const foliageAtTile = this.game.getFoliageAtTile(hoveredTile.x, hoveredTile.y);
                    if (foliageAtTile.length > 0) {
                        this.drawTilePreview(hoveredTile.x, hoveredTile.y, 0xff0000, 0.5);
                        return;
                    }

                    // Check for buildings/shelters
                    const placeable = this.game.getPlaceableAtTile(hoveredTile.x, hoveredTile.y);
                    if (placeable) {
                        // Highlight all tiles of the placeable
                        const tiles = placeable.getOccupiedTiles();
                        for (const t of tiles) {
                            this.drawTilePreview(t.x, t.y, 0xff0000, 0.5);
                        }
                        return;
                    }

                    // Nothing to demolish - show default hover
                    this.drawTilePreview(hoveredTile.x, hoveredTile.y, 0x888888, 0.3);
                }
            }
            return;
        }

        // For other tools, require hoveredTile
        if (!hoveredTile) return;

        // Handle terrain tool overlay with brush size preview
        if (tool === 'terrain') {
            const brushSize = input.brushSize;
            const radius = Math.floor(brushSize / 2);

            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const x = hoveredTile.x + dx;
                    const y = hoveredTile.y + dy;
                    this.drawTilePreview(x, y, 0x8b4513, 0.4);
                }
            }
            return;
        }

        // Handle shelter tool overlay with size preview
        if (tool === 'shelter') {
            const item = this.game.currentItem;
            if (item) {
                // Parse shelter size from item id (e.g., "concrete_small")
                const size = item.split('_')[1] as 'small' | 'regular' | 'large';
                const sizeConfigs: Record<string, { width: number; depth: number }> = {
                    small: { width: 2, depth: 1 },
                    regular: { width: 2, depth: 2 },
                    large: { width: 3, depth: 2 },
                };
                const baseConfig = sizeConfigs[size] || sizeConfigs.small;
                const rotation = input.placementRotation;

                // Swap width/depth for 90° and 270° rotations
                const width = rotation % 2 === 1 ? baseConfig.depth : baseConfig.width;
                const depth = rotation % 2 === 1 ? baseConfig.width : baseConfig.depth;

                // Check if placement is valid
                const canPlace = this.canPlaceShelter(hoveredTile.x, hoveredTile.y, width, depth);
                const color = canPlace ? 0x00ff00 : 0xff0000;

                // Draw preview for each tile in the footprint
                for (let dx = 0; dx < width; dx++) {
                    for (let dy = 0; dy < depth; dy++) {
                        this.drawTilePreview(hoveredTile.x + dx, hoveredTile.y + dy, color, 0.4);
                    }
                }

                // Draw a transparent shelter preview
                if (canPlace) {
                    this.drawShelterPreview(hoveredTile.x, hoveredTile.y, width, depth, rotation, size);
                }
            }
            return;
        }

        // Handle building tool overlay with size preview
        if (tool === 'building') {
            const item = this.game.currentItem;
            if (item) {
                // Get building config from PLACEABLE_CONFIGS
                const config = PLACEABLE_CONFIGS[item];
                if (config) {
                    const rotation = input.placementRotation;

                    // Swap width/depth for 90° and 270° rotations
                    const width = rotation % 2 === 1 ? config.depth : config.width;
                    const depth = rotation % 2 === 1 ? config.width : config.depth;

                    // Check if placement is valid using Placeable.canPlace
                    const canPlace = Placeable.canPlace(this.game, item, hoveredTile.x, hoveredTile.y, rotation);
                    const color = canPlace ? 0x00ff00 : 0xff0000;

                    // Draw preview for each tile in the footprint
                    for (let dx = 0; dx < width; dx++) {
                        for (let dy = 0; dy < depth; dy++) {
                            this.drawTilePreview(hoveredTile.x + dx, hoveredTile.y + dy, color, 0.4);
                        }
                    }

                    // Draw a transparent building preview
                    if (canPlace) {
                        this.drawBuildingPreview(hoveredTile.x, hoveredTile.y, width, depth, rotation, item);
                    }
                }
            }
            return;
        }

        // Default tile highlight for other tools
        const screenPos = this.game.camera.tileToScreen(hoveredTile.x, hoveredTile.y);

        this.overlayGraphics.poly([
            { x: screenPos.x, y: screenPos.y - hh },
            { x: screenPos.x + hw, y: screenPos.y },
            { x: screenPos.x, y: screenPos.y + hh },
            { x: screenPos.x - hw, y: screenPos.y },
        ]);
        this.overlayGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

        // Draw selection indicator for selected animal
        if (input.selectedAnimal) {
            this.drawAnimalSelectionIndicator(input.selectedAnimal);
        }
    }

    /**
     * Draw selection indicator around an animal
     */
    private drawAnimalSelectionIndicator(animal: any): void {
        const worldPos = animal.getWorldPos();
        const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);

        // Pulsing effect based on time
        const pulse = Math.sin(Date.now() / 200) * 0.15 + 0.85;
        const radius = 25 * pulse;

        // Draw selection circle under the animal
        this.overlayGraphics.circle(screenPos.x, screenPos.y - 10, radius);
        this.overlayGraphics.stroke({ width: 3, color: 0xffff00, alpha: 0.8 });

        // Draw inner glow
        this.overlayGraphics.circle(screenPos.x, screenPos.y - 10, radius - 4);
        this.overlayGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.4 });

        // Draw selection arrow above the animal
        const arrowY = screenPos.y - 50 - Math.sin(Date.now() / 300) * 5;
        this.overlayGraphics.poly([
            { x: screenPos.x, y: arrowY + 10 },
            { x: screenPos.x - 8, y: arrowY },
            { x: screenPos.x + 8, y: arrowY },
        ]);
        this.overlayGraphics.fill({ color: 0xffff00, alpha: 0.9 });
    }

    /**
     * Render gate relocation overlay
     */
    private renderGateRelocateOverlay(input: any): void {
        const exhibit = input.selectedExhibit;
        if (!exhibit || !exhibit.perimeterFences) return;

        // Highlight all perimeter fences in orange
        for (const fence of exhibit.perimeterFences) {
            const isCurrentGate = exhibit.isGateAt(fence.tileX, fence.tileY, fence.edge);
            const isHovered = input.hoveredEdge &&
                input.hoveredEdge.tileX === fence.tileX &&
                input.hoveredEdge.tileY === fence.tileY &&
                input.hoveredEdge.edge === fence.edge;

            if (isCurrentGate) {
                // Current gate - green highlight
                this.drawEdgePreview(fence, 0x00ff00, 0.8);
            } else if (isHovered) {
                // Hovered fence - yellow/bright highlight with gate preview
                this.drawEdgePreview(fence, 0xffff00, 0.9);
            } else {
                // Other perimeter fences - orange highlight
                this.drawEdgePreview(fence, 0xff8800, 0.4);
            }
        }
    }

    /**
     * Draw a tile preview for path placement
     */
    private drawTilePreview(tileX: number, tileY: number, color: number, alpha: number): void {
        const screenPos = this.game.camera.tileToScreen(tileX, tileY);
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Draw filled diamond
        this.overlayGraphics.poly([
            { x: screenPos.x, y: screenPos.y - hh },
            { x: screenPos.x + hw, y: screenPos.y },
            { x: screenPos.x, y: screenPos.y + hh },
            { x: screenPos.x - hw, y: screenPos.y },
        ]);
        this.overlayGraphics.fill({ color, alpha: alpha * 0.5 });
        this.overlayGraphics.stroke({ width: 2, color, alpha });
    }

    /**
     * Draw a highlighted tile for touch mode selection (pulsing cyan border)
     */
    private drawSelectedTileHighlight(tileX: number, tileY: number): void {
        const screenPos = this.game.camera.tileToScreen(tileX, tileY);
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Draw a prominent cyan border with fill
        this.overlayGraphics.poly([
            { x: screenPos.x, y: screenPos.y - hh },
            { x: screenPos.x + hw, y: screenPos.y },
            { x: screenPos.x, y: screenPos.y + hh },
            { x: screenPos.x - hw, y: screenPos.y },
        ]);
        this.overlayGraphics.fill({ color: 0x00ffff, alpha: 0.3 });
        this.overlayGraphics.stroke({ width: 3, color: 0x00ffff, alpha: 0.9 });
    }

    /**
     * Draw an edge preview for fence placement
     */
    private drawEdgePreview(edge: TileEdge, color: number, alpha: number): void {
        const screenPos = this.game.camera.tileToScreen(edge.tileX, edge.tileY);
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Edge endpoints (isometric diamond edges)
        const edgePoints: Record<EdgeDirection, { x1: number; y1: number; x2: number; y2: number }> = {
            north: { x1: screenPos.x - hw, y1: screenPos.y, x2: screenPos.x, y2: screenPos.y - hh },
            east: { x1: screenPos.x, y1: screenPos.y - hh, x2: screenPos.x + hw, y2: screenPos.y },
            south: { x1: screenPos.x + hw, y1: screenPos.y, x2: screenPos.x, y2: screenPos.y + hh },
            west: { x1: screenPos.x, y1: screenPos.y + hh, x2: screenPos.x - hw, y2: screenPos.y },
        };

        // Convert world edge to screen edge for proper visual rotation
        const screenEdge = this.getScreenEdge(edge.edge);
        const e = edgePoints[screenEdge];

        // Draw thick line for the edge
        this.overlayGraphics.moveTo(e.x1, e.y1);
        this.overlayGraphics.lineTo(e.x2, e.y2);
        this.overlayGraphics.stroke({ width: 4, color, alpha });
    }

    /**
     * Get the tile that a fence edge is facing (the tile the fence belongs to)
     */
    private getFenceFacingTile(edge: TileEdge): { x: number; y: number } {
        // The fence belongs to this tile - highlight it to show which side is "inside"
        return { x: edge.tileX, y: edge.tileY };
    }

    /**
     * Draw a subtle highlight on the tile a fence is facing
     */
    private drawFenceFacingHighlight(edge: TileEdge): void {
        const facingTile = this.getFenceFacingTile(edge);
        // Only draw if tile is in bounds
        if (this.game.world.isInBounds(facingTile.x, facingTile.y)) {
            this.drawTilePreview(facingTile.x, facingTile.y, 0x00ff00, 0.15);
        }
    }

    /**
     * Check if a shelter can be placed at the given position
     */
    private canPlaceShelter(tileX: number, tileY: number, width: number, depth: number): boolean {
        for (let dx = 0; dx < width; dx++) {
            for (let dy = 0; dy < depth; dy++) {
                const x = tileX + dx;
                const y = tileY + dy;

                // Check bounds
                if (!this.game.world.isInBounds(x, y)) return false;

                // Check terrain
                const tile = this.game.world.getTile(x, y);
                if (!tile) return false;
                if (tile.terrain === 'fresh_water' || tile.terrain === 'salt_water') return false;
                if (tile.path) return false; // Can't place on paths

                // Check for existing shelters
                if (this.game.getShelterAtTile(x, y)) return false;

                // Check for fences BETWEEN tiles in the shelter footprint
                // Fences on exterior edges are OK (allows placement against exhibit perimeter)

                // Check south edge (toward +X) - blocked if there's another tile at dx+1
                if (tile.fences.south && dx < width - 1) return false;

                // Check north edge (toward -X) - blocked if there's another tile at dx-1
                if (tile.fences.north && dx > 0) return false;

                // Check west edge (toward +Y) - blocked if there's another tile at dy+1
                if (tile.fences.west && dy < depth - 1) return false;

                // Check east edge (toward -Y) - blocked if there's another tile at dy-1
                if (tile.fences.east && dy > 0) return false;
            }
        }
        return true;
    }

    /**
     * Draw a transparent shelter preview for placement
     */
    private drawShelterPreview(anchorX: number, anchorY: number, tileWidth: number, tileDepth: number, rotation: number = 0, size: string = 'small'): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Calculate all 4 corners in screen space (tileToScreen already applies camera rotation)
        const corners = [
            this.game.camera.tileToScreen(anchorX, anchorY),
            this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY),
            this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY + tileDepth - 1),
            this.game.camera.tileToScreen(anchorX, anchorY + tileDepth - 1),
        ];

        // Sort corners by screen position to find top/right/bottom/left
        const sortedByY = [...corners].sort((a, b) => a.y - b.y);
        const sortedByX = [...corners].sort((a, b) => a.x - b.x);
        const topCorner = sortedByY[0];
        const bottomCorner = sortedByY[3];
        const leftCorner = sortedByX[0];
        const rightCorner = sortedByX[3];

        const shelterHeight = 30 + tileDepth * 8;
        const previewAlpha = 0.4;
        const previewColor = 0x888888;
        const entranceColor = 0x444444;

        // Calculate corner positions
        const top = { x: topCorner.x, y: topCorner.y - hh };
        const right = { x: rightCorner.x + hw, y: rightCorner.y };
        const bottom = { x: bottomCorner.x, y: bottomCorner.y + hh };
        const left = { x: leftCorner.x - hw, y: leftCorner.y };

        // Draw floor outline
        this.overlayGraphics.poly([top, right, bottom, left]);
        this.overlayGraphics.fill({ color: previewColor, alpha: previewAlpha * 0.5 });

        // Determine which wall has the entrance (same logic as drawShelter)
        // Base entrance wall (before rotation):
        // Walls indexed clockwise: 0=back-left, 1=back-right, 2=front-right, 3=front-left
        let baseWall: number;
        if (size === 'large') {
            baseWall = 3; // front-left (long side)
        } else {
            baseWall = 2; // front-right (short side for small, at edge for regular)
        }
        // Apply building rotation to get world wall, then convert to screen wall
        const worldWall = (baseWall + rotation) % 4;
        const actualWall = (worldWall + this.game.camera.rotation) % 4;

        // Wall colors: entrance wall is darker
        const wallColors = [previewColor, previewColor, previewColor, previewColor];
        wallColors[actualWall] = entranceColor;

        // Draw all 4 walls
        // Wall 0: back-left (left to top)
        this.overlayGraphics.poly([
            left, top,
            { x: top.x, y: top.y - shelterHeight },
            { x: left.x, y: left.y - shelterHeight },
        ]);
        this.overlayGraphics.fill({ color: wallColors[0], alpha: previewAlpha * 0.8 });

        // Wall 1: back-right (top to right)
        this.overlayGraphics.poly([
            top, right,
            { x: right.x, y: right.y - shelterHeight },
            { x: top.x, y: top.y - shelterHeight },
        ]);
        this.overlayGraphics.fill({ color: wallColors[1], alpha: previewAlpha * 0.6 });

        // Wall 2: front-right (right to bottom)
        this.overlayGraphics.poly([
            right, bottom,
            { x: bottom.x, y: bottom.y - shelterHeight },
            { x: right.x, y: right.y - shelterHeight },
        ]);
        this.overlayGraphics.fill({ color: wallColors[2], alpha: previewAlpha });

        // Wall 3: front-left (bottom to left)
        this.overlayGraphics.poly([
            bottom, left,
            { x: left.x, y: left.y - shelterHeight },
            { x: bottom.x, y: bottom.y - shelterHeight },
        ]);
        this.overlayGraphics.fill({ color: wallColors[3], alpha: previewAlpha });

        // Roof
        this.overlayGraphics.poly([
            { x: top.x, y: top.y - shelterHeight },
            { x: right.x, y: right.y - shelterHeight },
            { x: bottom.x, y: bottom.y - shelterHeight },
            { x: left.x, y: left.y - shelterHeight },
        ]);
        this.overlayGraphics.fill({ color: previewColor, alpha: previewAlpha * 0.7 });
    }

    /**
     * Draw a transparent building preview for placement
     * Uses the actual building drawing methods with transparency
     */
    private drawBuildingPreview(anchorX: number, anchorY: number, tileWidth: number, tileDepth: number, rotation: number = 0, buildingType: string): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Calculate all 4 corners in screen space (tileToScreen already applies camera rotation)
        const corners = [
            this.game.camera.tileToScreen(anchorX, anchorY),
            this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY),
            this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY + tileDepth - 1),
            this.game.camera.tileToScreen(anchorX, anchorY + tileDepth - 1),
        ];

        // Sort corners by screen position to find top/right/bottom/left
        const sortedByY = [...corners].sort((a, b) => a.y - b.y);
        const sortedByX = [...corners].sort((a, b) => a.x - b.x);
        const topCorner = sortedByY[0];
        const bottomCorner = sortedByY[3];
        const leftCorner = sortedByX[0];
        const rightCorner = sortedByX[3];

        // Calculate corner positions
        const top = { x: topCorner.x, y: topCorner.y - hh };
        const right = { x: rightCorner.x + hw, y: rightCorner.y };
        const bottom = { x: bottomCorner.x, y: bottomCorner.y + hh };
        const left = { x: leftCorner.x - hw, y: leftCorner.y };

        const buildingHeight = 45;

        // Set transparency for preview
        this.overlayGraphics.alpha = 0.5;

        // Convert building rotation to screen-space entrance wall
        const screenRotation = (rotation + this.game.camera.rotation) % 4;

        // Use the actual detailed building drawing methods
        if (buildingType === 'burger_stand') {
            this.drawBurgerStand(this.overlayGraphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (buildingType === 'drink_stand') {
            this.drawDrinkStand(this.overlayGraphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (buildingType === 'vending_machine') {
            this.drawVendingMachine(this.overlayGraphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (buildingType === 'gift_shop') {
            this.drawGiftShop(this.overlayGraphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (buildingType === 'restaurant') {
            this.drawRestaurant(this.overlayGraphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (buildingType === 'bathroom') {
            this.drawBathroom(this.overlayGraphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (buildingType === 'bathroom_large') {
            this.drawBathroomLarge(this.overlayGraphics, top, right, bottom, left, buildingHeight, screenRotation);
        } else if (buildingType === 'garbage_can') {
            this.drawTrashCan(this.overlayGraphics, top, right, bottom, left, screenRotation);
        } else if (buildingType === 'bench') {
            this.drawBench(this.overlayGraphics, top, right, bottom, left, screenRotation);
        } else if (buildingType === 'picnic_table') {
            this.drawPicnicTable(this.overlayGraphics, top, right, bottom, left, screenRotation);
        } else {
            // Generic building preview for other types
            this.drawGenericBuilding(this.overlayGraphics, top, right, bottom, left, buildingHeight);
        }

        // Restore alpha
        this.overlayGraphics.alpha = 1.0;
    }

    /**
     * Render debug tile grid with coordinates
     */
    private renderTileGrid(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
        this.gridGraphics.clear();

        // Hide all pooled text objects first
        for (let i = this.activeGridTextCount; i < this.gridTextPool.length; i++) {
            this.gridTextPool[i].visible = false;
        }
        this.activeGridTextCount = 0;

        if (!this.showTileGrid) {
            this.gridContainer.visible = false;
            return;
        }

        this.gridContainer.visible = true;
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Draw grid for each visible tile
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
            for (let x = bounds.minX; x <= bounds.maxX; x++) {
                const tile = this.game.world.getTile(x, y);
                if (!tile) continue;

                const screenPos = this.game.camera.tileToScreen(x, y);

                // Draw tile outline
                this.gridGraphics.poly([
                    { x: screenPos.x, y: screenPos.y - hh },
                    { x: screenPos.x + hw, y: screenPos.y },
                    { x: screenPos.x, y: screenPos.y + hh },
                    { x: screenPos.x - hw, y: screenPos.y },
                ]);
                this.gridGraphics.stroke({ width: 1, color: 0xffffff, alpha: 0.3 });

                // Draw coordinate text
                const coordText = `${x},${y}`;
                let text: Text;

                if (this.activeGridTextCount < this.gridTextPool.length) {
                    text = this.gridTextPool[this.activeGridTextCount];
                    text.text = coordText;
                    text.visible = true;
                } else {
                    text = new Text({ text: coordText, style: this.gridTextStyle });
                    this.gridTextPool.push(text);
                    this.gridContainer.addChild(text);
                }

                text.anchor.set(0.5, 0.5);
                text.x = screenPos.x;
                text.y = screenPos.y;
                this.activeGridTextCount++;
            }
        }
    }

    /**
     * Handle resize
     */
    handleResize(): void {
        // Chunks will be re-rendered as needed based on visibility
    }

    /**
     * Force re-render of all chunks (after major world changes)
     */
    invalidateAllChunks(): void {
        for (const chunk of this.game.world.getAllChunks()) {
            chunk.dirty = true;
        }
    }
}
