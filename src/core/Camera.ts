import { GridPos, ScreenPos, ISO, CameraState, TileEdge, EdgeDirection } from './types';

/**
 * Camera handles viewport position, zoom, and coordinate transformations
 * between logical grid coordinates and screen/isometric coordinates.
 */
export class Camera {
    // Camera position in world space (center of viewport)
    public x: number = 0;
    public y: number = 0;
    public zoom: number = 1;

    // Viewport dimensions
    public viewportWidth: number = 0;
    public viewportHeight: number = 0;

    // Zoom constraints
    public readonly minZoom: number = 0.25;
    public readonly maxZoom: number = 2;

    // Panning state
    private isPanning: boolean = false;
    private panStartX: number = 0;
    private panStartY: number = 0;
    private panStartCamX: number = 0;
    private panStartCamY: number = 0;

    // Camera rotation: 0 = 0°, 1 = 90° CW, 2 = 180°, 3 = 270° CW
    public rotation: 0 | 1 | 2 | 3 = 0;

    // World dimensions (needed for rotation transforms)
    private worldWidth: number = 64;
    private worldHeight: number = 64;

    // Callback for when rotation changes (to invalidate chunks, etc.)
    public onRotationChange?: () => void;

    constructor(viewportWidth: number, viewportHeight: number) {
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
    }

    /**
     * Set world dimensions (call after world is created)
     */
    setWorldDimensions(width: number, height: number): void {
        this.worldWidth = width;
        this.worldHeight = height;
    }

    /**
     * Transform world coordinates to view coordinates based on rotation
     */
    rotateWorldToView(worldX: number, worldY: number): { x: number; y: number } {
        const maxX = this.worldWidth - 1;
        const maxY = this.worldHeight - 1;

        switch (this.rotation) {
            case 0: return { x: worldX, y: worldY };
            case 1: return { x: maxY - worldY, y: worldX };
            case 2: return { x: maxX - worldX, y: maxY - worldY };
            case 3: return { x: worldY, y: maxX - worldX };
        }
    }

    /**
     * Transform view coordinates back to world coordinates (inverse of rotateWorldToView)
     */
    rotateViewToWorld(viewX: number, viewY: number): { x: number; y: number } {
        const maxX = this.worldWidth - 1;
        const maxY = this.worldHeight - 1;

        switch (this.rotation) {
            case 0: return { x: viewX, y: viewY };
            case 1: return { x: viewY, y: maxY - viewX };
            case 2: return { x: maxX - viewX, y: maxY - viewY };
            case 3: return { x: maxX - viewY, y: viewX };
        }
    }

    /**
     * Rotate camera clockwise (90° CW)
     */
    rotateClockwise(): void {
        // Find the world tile at the center of the screen before rotation
        const centerTile = this.screenToTile(this.viewportWidth / 2, this.viewportHeight / 2);

        // Apply rotation
        this.rotation = ((this.rotation + 1) % 4) as 0 | 1 | 2 | 3;

        // Re-center on the same world tile after rotation
        this.centerOnTile(centerTile.x, centerTile.y);

        this.onRotationChange?.();
    }

    /**
     * Rotate camera counter-clockwise (90° CCW)
     */
    rotateCounterClockwise(): void {
        // Find the world tile at the center of the screen before rotation
        const centerTile = this.screenToTile(this.viewportWidth / 2, this.viewportHeight / 2);

        // Apply rotation
        this.rotation = ((this.rotation + 3) % 4) as 0 | 1 | 2 | 3;

        // Re-center on the same world tile after rotation
        this.centerOnTile(centerTile.x, centerTile.y);

        this.onRotationChange?.();
    }

    /**
     * Update viewport dimensions (call on resize)
     */
    resize(width: number, height: number): void {
        this.viewportWidth = width;
        this.viewportHeight = height;
    }

    /**
     * Center the camera on a specific tile
     */
    centerOnTile(tileX: number, tileY: number): void {
        const screenPos = this.tileToScreen(tileX, tileY);
        this.x = screenPos.x;
        this.y = screenPos.y;
    }

    /**
     * Convert logical grid coordinates to screen coordinates
     * This is the isometric projection formula with rotation applied
     */
    tileToScreen(tileX: number, tileY: number): ScreenPos {
        // Rotate world coords to view coords
        const view = this.rotateWorldToView(tileX, tileY);

        return {
            x: (view.x - view.y) * (ISO.TILE_WIDTH / 2),
            y: (view.x + view.y) * (ISO.TILE_HEIGHT / 2),
        };
    }

    /**
     * Convert screen coordinates to logical grid coordinates
     * Inverse of the isometric projection with rotation applied
     */
    screenToTile(screenX: number, screenY: number): GridPos {
        // First convert from viewport to isometric world coordinates
        const isoX = (screenX - this.viewportWidth / 2) / this.zoom + this.x;
        const isoY = (screenY - this.viewportHeight / 2) / this.zoom + this.y;

        // Then convert from isometric to view-space grid coords
        const viewX = (isoX / (ISO.TILE_WIDTH / 2) + isoY / (ISO.TILE_HEIGHT / 2)) / 2;
        const viewY = (isoY / (ISO.TILE_HEIGHT / 2) - isoX / (ISO.TILE_WIDTH / 2)) / 2;

        // Rotate view coords back to world coords
        const world = this.rotateViewToWorld(viewX, viewY);

        // Offset in world-space to align picking with tile visual center
        // The tile center is at (0.5, 0.5) offset from the anchor in grid space
        return { x: world.x + 0.5, y: world.y + 0.5 };
    }

    /**
     * Get the tile coordinates at a screen position (floored to integers)
     */
    getTileAt(screenX: number, screenY: number): GridPos {
        const pos = this.screenToTile(screenX, screenY);
        return {
            x: Math.floor(pos.x),
            y: Math.floor(pos.y),
        };
    }

    /**
     * Get the tile edge at a screen position (for fence placement)
     * Divides tile into 4 triangles from corners to center - each triangle selects its edge
     */
    getTileEdgeAt(screenX: number, screenY: number): TileEdge {
        const pos = this.screenToTile(screenX, screenY);

        // Get integer tile and fractional position within tile (0 to 1)
        const tileX = Math.floor(pos.x);
        const tileY = Math.floor(pos.y);
        const fracX = pos.x - tileX;
        const fracY = pos.y - tileY;

        // The tile diamond is divided by two diagonals through center:
        // 1. fracY = fracX (from top vertex to bottom vertex)
        // 2. fracX + fracY = 1 (from right vertex to left vertex)
        // These create 4 triangles, each containing one edge

        let edge: EdgeDirection;

        if (fracX + fracY < 1) {
            // Top half of diamond
            if (fracX < fracY) {
                edge = 'north';  // Left-top triangle (low fracX side)
            } else {
                edge = 'east';   // Right-top triangle (low fracY side)
            }
        } else {
            // Bottom half of diamond
            if (fracX > fracY) {
                edge = 'south';  // Right-bottom triangle (high fracX side)
            } else {
                edge = 'west';   // Left-bottom triangle (high fracY side)
            }
        }

        return {
            tileX,
            tileY,
            edge,
        };
    }

    /**
     * Convert world position to viewport position (for rendering)
     */
    worldToViewport(worldX: number, worldY: number): ScreenPos {
        return {
            x: (worldX - this.x) * this.zoom + this.viewportWidth / 2,
            y: (worldY - this.y) * this.zoom + this.viewportHeight / 2,
        };
    }

    /**
     * Get the visible tile bounds (for culling)
     */
    getVisibleBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
        // Calculate screen corners in tile coordinates
        const topLeft = this.screenToTile(0, 0);
        const topRight = this.screenToTile(this.viewportWidth, 0);
        const bottomLeft = this.screenToTile(0, this.viewportHeight);
        const bottomRight = this.screenToTile(this.viewportWidth, this.viewportHeight);

        // Find bounds with some padding
        const padding = 2;
        return {
            minX: Math.floor(Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x)) - padding,
            minY: Math.floor(Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y)) - padding,
            maxX: Math.ceil(Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x)) + padding,
            maxY: Math.ceil(Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y)) + padding,
        };
    }

    /**
     * Zoom by a delta amount, centered on a screen position
     */
    zoomAt(screenX: number, screenY: number, delta: number): void {
        const oldZoom = this.zoom;
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + delta));

        if (this.zoom !== oldZoom) {
            // Adjust position to zoom toward the mouse position
            const zoomFactor = this.zoom / oldZoom;
            const centerX = this.viewportWidth / 2;
            const centerY = this.viewportHeight / 2;

            this.x += (screenX - centerX) * (1 - 1 / zoomFactor) / this.zoom;
            this.y += (screenY - centerY) * (1 - 1 / zoomFactor) / this.zoom;
        }
    }

    /**
     * Zoom in by a fixed amount, centered on viewport
     */
    zoomIn(): void {
        this.zoom = Math.min(this.maxZoom, this.zoom + 0.1);
    }

    /**
     * Zoom out by a fixed amount, centered on viewport
     */
    zoomOut(): void {
        this.zoom = Math.max(this.minZoom, this.zoom - 0.1);
    }

    /**
     * Set zoom to a specific level
     */
    setZoom(level: number): void {
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, level));
    }

    /**
     * Start panning from a screen position
     */
    startPan(screenX: number, screenY: number): void {
        this.isPanning = true;
        this.panStartX = screenX;
        this.panStartY = screenY;
        this.panStartCamX = this.x;
        this.panStartCamY = this.y;
    }

    /**
     * Update pan position
     */
    updatePan(screenX: number, screenY: number): void {
        if (!this.isPanning) return;

        const dx = (screenX - this.panStartX) / this.zoom;
        const dy = (screenY - this.panStartY) / this.zoom;

        this.x = this.panStartCamX - dx;
        this.y = this.panStartCamY - dy;
    }

    /**
     * End panning
     */
    endPan(): void {
        this.isPanning = false;
    }

    /**
     * Check if currently panning
     */
    get panning(): boolean {
        return this.isPanning;
    }

    /**
     * Get current camera state (for serialization)
     */
    getState(): CameraState {
        return {
            x: this.x,
            y: this.y,
            zoom: this.zoom,
        };
    }

    /**
     * Restore camera state
     */
    setState(state: CameraState): void {
        this.x = state.x;
        this.y = state.y;
        this.zoom = state.zoom;
    }
}
