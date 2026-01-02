import { Game } from './core/Game';

/**
 * Zoo Tycoon Clone v2
 *
 * Built with:
 * - TypeScript for type safety
 * - PixiJS for WebGL rendering
 * - Web Workers for async pathfinding
 * - HTML/CSS for UI overlays
 *
 * Architecture:
 * - Chunk-based world for efficient rendering
 * - Layer separation (terrain, fences, entities, overlay)
 * - Fixed-rate simulation tick separate from render loop
 * - Async pathfinding off the main thread
 */

async function main() {
    console.log('🦁 Zoo Tycoon Clone v2 starting...');

    // Create and initialize the game
    const game = new Game({
        worldWidth: 64,
        worldHeight: 64,
        chunkSize: 16,
        startingMoney: 10000,
        simTickRate: 10,
    });

    // Make game accessible for debugging
    (window as any).game = game;

    try {
        await game.init();
        console.log('✅ Game initialized');

        // Start the game loop
        game.start();
        console.log('🎮 Game started');

        // Update initial UI
        document.getElementById('money')!.textContent = game.money.toLocaleString();
        document.getElementById('day')!.textContent = game.getDateString();

    } catch (error) {
        console.error('❌ Failed to initialize game:', error);
    }
}

// Start the game when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
