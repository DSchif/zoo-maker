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
    dirt: { base: 0x8b7355, highlight: 0x9b8365, shadow: 0x7b6345 },
    sand: { base: 0xd4a843, highlight: 0xe4b853, shadow: 0xc49833 },
    water: { base: 0x4a90d9, highlight: 0x5aa0e9, shadow: 0x3a80c9 },
    savanna: { base: 0xc4a747, highlight: 0xd4b757, shadow: 0xb49737 },
    prairie: { base: 0x7cb342, highlight: 0x8cc352, shadow: 0x6ca332 },
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
        const key = `${chunk.x},${chunk.y}`;
        const chunkSize = this.game.world.chunkSize;

        // Calculate chunk dimensions in screen space
        // A chunk covers chunkSize x chunkSize tiles
        // The bounding box in isometric space needs to account for the diamond shape
        const chunkPixelWidth = (chunkSize * 2) * (TILE_WIDTH / 2) + TILE_WIDTH;
        const chunkPixelHeight = (chunkSize * 2) * (TILE_HEIGHT / 2) + TILE_HEIGHT;

        // Create or get the render texture
        let cached = this.chunkTextures.get(key);
        if (!cached) {
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

        // Calculate offset for this chunk's local coordinate system
        const baseWorldX = chunk.x * chunkSize;
        const baseWorldY = chunk.y * chunkSize;

        // Draw each tile
        for (let ly = 0; ly < chunkSize; ly++) {
            for (let lx = 0; lx < chunkSize; lx++) {
                const tile = chunk.tiles[ly]?.[lx];
                if (!tile) continue;

                const worldX = baseWorldX + lx;
                const worldY = baseWorldY + ly;

                // Convert to screen position relative to chunk origin
                const screenPos = this.game.camera.tileToScreen(worldX, worldY);
                const chunkOrigin = this.game.camera.tileToScreen(baseWorldX, baseWorldY);

                const localX = screenPos.x - chunkOrigin.x + chunkPixelWidth / 2;
                const localY = screenPos.y - chunkOrigin.y + TILE_HEIGHT;

                this.drawTile(graphics, localX, localY, tile, worldX, worldY);
            }
        }

        // Render to texture
        this.game.app.renderer.render({
            container: graphics,
            target: cached.texture,
            clear: true,
        });

        // Position the sprite
        const chunkOrigin = this.game.camera.tileToScreen(baseWorldX, baseWorldY);
        cached.sprite.x = chunkOrigin.x - chunkPixelWidth / 2;
        cached.sprite.y = chunkOrigin.y - TILE_HEIGHT;

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

        // Add small overlap to prevent gaps between tiles (anti-aliasing fix)
        const overlap = 0.5;

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

        // Draw path if present (fills entire tile)
        if (tile.path) {
            const pathColor = PATH_COLORS[tile.path] || PATH_COLORS.dirt;

            graphics.poly([
                { x: x, y: y - hh },      // Top
                { x: x + hw, y: y },       // Right
                { x: x, y: y + hh },       // Bottom
                { x: x - hw, y: y },       // Left
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
        const overlap = 0.5; // Match the base tile overlap

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

            // Draw parallelogram band along the edge (constant width)
            // Outer points include overlap to match base tile anti-aliasing
            switch (neighbor.edge) {
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

            // Draw small triangle at the corner
            switch (corner.corner) {
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

            case 'water': {
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

            case 'savanna': {
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
                        // Calculate depth based on edge position in isometric view
                        // North/East edges are at the TOP of the diamond (render behind entities)
                        // South/West edges are at the BOTTOM of the diamond (render in front)
                        let depth = x + y;
                        if (edge === 'south' || edge === 'west') {
                            depth += 0.5;  // Bottom edges render after entities on same tile
                        } else {
                            depth -= 0.1;  // Top edges render before entities on same tile
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

            if (fence.isGate) {
                this.drawGateEdge(g, fence.x, fence.y, fence.edge, fence.fenceType);
            } else {
                this.drawFenceEdge(g, fence.x, fence.y, fence.edge, fence.fenceType, fence.condition);
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
     * Render entities (depth-sorted)
     */
    private renderEntities(): void {
        // Reset pools
        this.resetSpritePool();
        this.resetGraphicsPool();
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

        // Add entrance gate
        const entrance = this.game.world.getEntrancePosition();
        const gateScreenPos = this.game.camera.tileToScreen(entrance.x, entrance.y);
        items.push({
            type: 'entrance_gate',
            entity: null,
            depth: entrance.x + entrance.y + 0.5, // Slightly in front of the entrance tile
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
                depth: animal.getDepth(),
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
                depth: staff.getDepth(),
                screenX: screenPos.x,
                screenY: screenPos.y,
            });
        }

        // Add guests
        for (const guest of this.game.guests) {
            const worldPos = guest.getWorldPos();
            const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
            items.push({
                type: 'guest',
                entity: guest,
                depth: guest.getDepth(),
                screenX: screenPos.x,
                screenY: screenPos.y,
            });
        }

        // Add foliage
        for (const foliageItem of this.game.foliage) {
            const worldPos = foliageItem.getWorldPos();
            const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
            items.push({
                type: 'foliage',
                entity: foliageItem,
                depth: foliageItem.getDepth(),
                screenX: screenPos.x,
                screenY: screenPos.y,
            });
        }

        // Add food piles
        for (const pile of this.game.foodPiles) {
            const worldPos = pile.getWorldPos();
            const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
            items.push({
                type: 'food',
                entity: pile,
                depth: pile.getDepth(),
                screenX: screenPos.x,
                screenY: screenPos.y,
            });
        }

        // Add shelters
        for (const shelter of this.game.shelters) {
            const worldPos = shelter.getWorldPos();
            const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
            items.push({
                type: 'shelter',
                entity: shelter,
                depth: shelter.getDepth(),
                screenX: screenPos.x,
                screenY: screenPos.y,
            });
        }

        // Add buildings
        for (const building of this.game.buildings) {
            const worldPos = building.getWorldPos();
            const screenPos = this.game.camera.tileToScreen(worldPos.x, worldPos.y);
            items.push({
                type: 'building',
                entity: building,
                depth: building.getDepth(),
                screenX: screenPos.x,
                screenY: screenPos.y,
            });
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
    }

    /**
     * Draw the entrance gate
     */
    private drawEntranceGate(x: number, y: number, depth: number): void {
        const texture = this.textures.get('entrance_gate');
        if (texture) {
            const sprite = this.getPooledSprite(texture);
            sprite.anchor.set(0.5, 0.75); // Center horizontally, anchor near bottom
            sprite.x = x;
            sprite.y = y + 8; // Offset to align with entrance tiles
            sprite.zIndex = depth;
            sprite.scale.set(1.1); // Scale to span entrance area
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
        const direction = animal.facingDirection || 'ne';
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

        // Flip based on facing direction
        const facing = staff.facingX || 1;
        sprite.scale.x = Math.abs(sprite.scale.x) * facing;
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

        // Flip based on facing direction
        const facing = guest.facingX || 1;
        sprite.scale.x = Math.abs(sprite.scale.x) * facing;
    }

    /**
     * Draw an animal with detailed textures
     */
    private drawAnimal(graphics: Graphics, x: number, y: number, animal: any): void {
        const facing = animal.facingX || 1; // 1 = right, -1 = left
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
        const facing = staff.facingX || 1;

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
        const facing = guest.facingX || 1;
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

        // Calculate screen positions for the corners of the isometric footprint
        const topCorner = this.game.camera.tileToScreen(anchorX, anchorY);
        const rightCorner = this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY);
        const bottomCorner = this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY + tileDepth - 1);
        const leftCorner = this.game.camera.tileToScreen(anchorX, anchorY + tileDepth - 1);

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
        // Only draw the visible portion (front half)
        graphics.poly([top, right, bottom, left]);
        graphics.fill(floorColor);

        // Only draw the 3 visible walls (back-right wall from top to right is hidden)

        // Draw back-left wall (left to top) - darker, visible from left side
        graphics.poly([
            left, top,
            { x: top.x, y: top.y - shelterHeight },
            { x: left.x, y: left.y - shelterHeight },
        ]);
        graphics.fill(wallDark);

        // Draw front-left wall (bottom to left) - medium shade
        graphics.poly([
            bottom, left,
            { x: left.x, y: left.y - shelterHeight },
            { x: bottom.x, y: bottom.y - shelterHeight },
        ]);
        graphics.fill(wallLight);

        // Draw front-right wall (right to bottom) - lightest (faces camera directly)
        graphics.poly([
            right, bottom,
            { x: bottom.x, y: bottom.y - shelterHeight },
            { x: right.x, y: right.y - shelterHeight },
        ]);
        graphics.fill(wallLight);

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

        // Apply rotation to get actual wall
        const actualWall = (baseWall + rotation) % 4;

        // Define all 4 walls with their start/end points and tile counts
        // Wall 0 = back-left: left to top (spans origWidth tiles along X)
        // Wall 1 = back-right: top to right (spans origDepth tiles along Y)
        // Wall 2 = front-right: right to bottom (spans origDepth tiles along Y)
        // Wall 3 = front-left: bottom to left (spans origWidth tiles along X)
        const walls = [
            { start: left, end: top, tileCount: tileWidth },      // back-left
            { start: top, end: right, tileCount: tileDepth },     // back-right
            { start: right, end: bottom, tileCount: tileDepth },  // front-right
            { start: bottom, end: left, tileCount: tileWidth },   // front-left
        ];

        // Only draw entrance if it's on a visible front wall (2=front-right, 3=front-left)
        // Back walls (0=back-left, 1=back-right) face away from camera
        if (actualWall === 2 || actualWall === 3) {
            const wall = walls[actualWall];
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

        // Calculate screen positions for the corners of the isometric footprint
        // (same approach as drawShelter)
        const topCorner = this.game.camera.tileToScreen(anchorX, anchorY);
        const rightCorner = this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY);
        const bottomCorner = this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY + tileDepth - 1);
        const leftCorner = this.game.camera.tileToScreen(anchorX, anchorY + tileDepth - 1);

        // Calculate corner positions (extend to tile edges)
        const top = { x: topCorner.x, y: topCorner.y - hh };
        const right = { x: rightCorner.x + hw, y: rightCorner.y };
        const bottom = { x: bottomCorner.x, y: bottomCorner.y + hh };
        const left = { x: leftCorner.x - hw, y: leftCorner.y };

        const buildingHeight = 45;

        // Draw based on building style
        if (config.style === 'burger_stand') {
            this.drawBurgerStand(graphics, top, right, bottom, left, buildingHeight, building.rotation);
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
                this.drawEdgePreview(input.touchFenceStart, 0x00ffff, 0.9); // Cyan for start point
            }

            // In touch mode with placement ready, show the full L-shape in green
            if (input.touchMode && input.touchPlacementReady && input.touchFenceStart && input.touchFenceEnd) {
                const edges = input.calculateLShapeEdges(input.touchFenceStart, input.touchFenceEnd);
                for (const edge of edges) {
                    this.drawEdgePreview(edge, 0x00ff00, 0.8); // Green for ready to confirm
                }
            }
            // Show L-shape preview if dragging for second point
            else if (input.isFenceDragging && input.fenceDragStart && input.hoveredEdge) {
                const edges = input.calculateLShapeEdges(input.fenceDragStart, input.hoveredEdge);
                for (const edge of edges) {
                    this.drawEdgePreview(edge, 0xffff00, 0.7);
                }
            }
            // Touch mode selecting first point: show hovered edge preview
            else if (input.touchMode && !input.touchFenceStart && input.hoveredEdge) {
                this.drawEdgePreview(input.hoveredEdge, 0xffff00, 0.5);
            }
            // Normal mode: just show hovered edge
            else if (!input.touchMode && input.hoveredEdge) {
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

        const e = edgePoints[edge.edge];

        // Draw thick line for the edge
        this.overlayGraphics.moveTo(e.x1, e.y1);
        this.overlayGraphics.lineTo(e.x2, e.y2);
        this.overlayGraphics.stroke({ width: 4, color, alpha });
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
                if (tile.terrain === 'water') return false;
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

        // Calculate screen positions for the corners (using last tile in each direction)
        const topCorner = this.game.camera.tileToScreen(anchorX, anchorY);
        const rightCorner = this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY);
        const bottomCorner = this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY + tileDepth - 1);
        const leftCorner = this.game.camera.tileToScreen(anchorX, anchorY + tileDepth - 1);

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
        const actualWall = (baseWall + rotation) % 4;

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
     */
    private drawBuildingPreview(anchorX: number, anchorY: number, tileWidth: number, tileDepth: number, rotation: number = 0, buildingType: string): void {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        // Calculate screen positions for the corners
        const topCorner = this.game.camera.tileToScreen(anchorX, anchorY);
        const rightCorner = this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY);
        const bottomCorner = this.game.camera.tileToScreen(anchorX + tileWidth - 1, anchorY + tileDepth - 1);
        const leftCorner = this.game.camera.tileToScreen(anchorX, anchorY + tileDepth - 1);

        const previewAlpha = 0.5;

        // Calculate corner positions
        const top = { x: topCorner.x, y: topCorner.y - hh };
        const right = { x: rightCorner.x + hw, y: rightCorner.y };
        const bottom = { x: bottomCorner.x, y: bottomCorner.y + hh };
        const left = { x: leftCorner.x - hw, y: leftCorner.y };

        if (buildingType === 'burger_stand') {
            // Burger stand preview - red/orange stand with awning on service side
            const standHeight = 35;
            const standColor = 0xcc4422;
            const awningColor = 0xffcc00;
            const serviceWall = rotation % 4;

            // Draw floor
            this.overlayGraphics.poly([top, right, bottom, left]);
            this.overlayGraphics.fill({ color: 0x666666, alpha: previewAlpha * 0.5 });

            // Draw main body (walls)
            // Back-left wall
            this.overlayGraphics.poly([
                left, top,
                { x: top.x, y: top.y - standHeight },
                { x: left.x, y: left.y - standHeight },
            ]);
            this.overlayGraphics.fill({ color: standColor, alpha: previewAlpha * 0.8 });

            // Back-right wall
            this.overlayGraphics.poly([
                top, right,
                { x: right.x, y: right.y - standHeight },
                { x: top.x, y: top.y - standHeight },
            ]);
            this.overlayGraphics.fill({ color: standColor, alpha: previewAlpha * 0.6 });

            // Front-right wall
            this.overlayGraphics.poly([
                right, bottom,
                { x: bottom.x, y: bottom.y - standHeight },
                { x: right.x, y: right.y - standHeight },
            ]);
            this.overlayGraphics.fill({ color: standColor, alpha: previewAlpha });

            // Front-left wall
            this.overlayGraphics.poly([
                bottom, left,
                { x: left.x, y: left.y - standHeight },
                { x: bottom.x, y: bottom.y - standHeight },
            ]);
            this.overlayGraphics.fill({ color: standColor, alpha: previewAlpha });

            // Awning only on service window side
            const awningExtend = 10;
            const awningHeight = standHeight + 10;

            if (serviceWall === 0) {
                // Front-right awning (south)
                this.overlayGraphics.poly([
                    { x: right.x + awningExtend, y: right.y - awningHeight + 5 },
                    { x: bottom.x, y: bottom.y - awningHeight + 10 },
                    { x: bottom.x, y: bottom.y - standHeight },
                    { x: right.x + awningExtend, y: right.y - standHeight },
                ]);
                this.overlayGraphics.fill({ color: awningColor, alpha: previewAlpha * 0.8 });
            } else if (serviceWall === 1) {
                // Front-left awning (west)
                this.overlayGraphics.poly([
                    { x: bottom.x, y: bottom.y - awningHeight + 10 },
                    { x: left.x - awningExtend, y: left.y - awningHeight + 5 },
                    { x: left.x - awningExtend, y: left.y - standHeight },
                    { x: bottom.x, y: bottom.y - standHeight },
                ]);
                this.overlayGraphics.fill({ color: awningColor, alpha: previewAlpha * 0.8 });
            }
            // Rotations 2 and 3 have window on back walls (not visible)

            // Roof
            this.overlayGraphics.poly([
                { x: top.x, y: top.y - standHeight },
                { x: right.x, y: right.y - standHeight },
                { x: bottom.x, y: bottom.y - standHeight },
                { x: left.x, y: left.y - standHeight },
            ]);
            this.overlayGraphics.fill({ color: 0x8b4513, alpha: previewAlpha * 0.7 });
        } else {
            // Generic building preview
            const buildingHeight = 40;
            const buildingColor = 0x888888;

            // Draw floor
            this.overlayGraphics.poly([top, right, bottom, left]);
            this.overlayGraphics.fill({ color: buildingColor, alpha: previewAlpha * 0.5 });

            // Draw walls
            this.overlayGraphics.poly([
                left, top,
                { x: top.x, y: top.y - buildingHeight },
                { x: left.x, y: left.y - buildingHeight },
            ]);
            this.overlayGraphics.fill({ color: buildingColor, alpha: previewAlpha * 0.8 });

            this.overlayGraphics.poly([
                top, right,
                { x: right.x, y: right.y - buildingHeight },
                { x: top.x, y: top.y - buildingHeight },
            ]);
            this.overlayGraphics.fill({ color: buildingColor, alpha: previewAlpha * 0.6 });

            this.overlayGraphics.poly([
                right, bottom,
                { x: bottom.x, y: bottom.y - buildingHeight },
                { x: right.x, y: right.y - buildingHeight },
            ]);
            this.overlayGraphics.fill({ color: buildingColor, alpha: previewAlpha });

            this.overlayGraphics.poly([
                bottom, left,
                { x: left.x, y: left.y - buildingHeight },
                { x: bottom.x, y: bottom.y - buildingHeight },
            ]);
            this.overlayGraphics.fill({ color: buildingColor, alpha: previewAlpha });

            // Roof
            this.overlayGraphics.poly([
                { x: top.x, y: top.y - buildingHeight },
                { x: right.x, y: right.y - buildingHeight },
                { x: bottom.x, y: bottom.y - buildingHeight },
                { x: left.x, y: left.y - buildingHeight },
            ]);
            this.overlayGraphics.fill({ color: buildingColor, alpha: previewAlpha * 0.7 });
        }
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
