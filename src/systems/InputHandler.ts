import type { Game } from '../core/Game';
import type { GridPos, EdgeDirection, FenceType, AnimalSpecies, FoliageType, TileEdge, TerrainType, PathType, Gender, ShelterSize } from '../core/types';
import { LionInfo } from '../entities/animals/Lion';
import { BisonInfo } from '../entities/animals/Bison';
import { FoliageTypes } from '../entities/Foliage';

/**
 * Action types for undo system
 */
interface UndoAction {
    type: 'terrain' | 'path' | 'fence' | 'animal' | 'foliage' | 'staff' | 'shelter' | 'building';
    data: any;
}

/**
 * Animal species info for display
 */
const ANIMAL_INFO: Record<string, any> = {
    lion: LionInfo,
    bison: BisonInfo,
};

/**
 * InputHandler manages all mouse/keyboard/touch input for the game.
 */
export class InputHandler {
    private game: Game;

    // Current hover position
    public hoveredTile: GridPos | null = null;
    public hoveredScreenPos: { x: number; y: number } | null = null;
    public hoveredEdge: TileEdge | null = null;

    // Mouse state
    private isMouseDown: boolean = false;
    private mouseButton: number = 0;
    private _lastMouseX: number = 0; // Reserved for future drag calculations
    private _lastMouseY: number = 0; // Reserved for future drag calculations

    // Drag state
    private isDragging: boolean = false;
    private _dragStartTile: GridPos | null = null; // Reserved for drag operations

    // Fence drag state
    public fenceDragStart: TileEdge | null = null;
    public isFenceDragging: boolean = false;

    // Path drag state
    public pathDragStart: GridPos | null = null;
    public isPathDragging: boolean = false;

    // Demolish drag state
    public demolishDragStart: GridPos | null = null;
    public isDemolishDragging: boolean = false;

    // Undo history
    private undoHistory: UndoAction[] = [];
    private readonly maxUndoHistory: number = 50;

    // Selected gender for animal placement
    private selectedGender: Gender = 'male';

    // Brush size for terrain painting (odd numbers: 1, 3, 5, 7, 9)
    public brushSize: number = 1;
    private readonly minBrushSize: number = 1;
    private readonly maxBrushSize: number = 9;

    // Placeable rotation (0, 1, 2, 3 = 0°, 90°, 180°, 270°)
    public placementRotation: number = 0;

    // Gate relocation mode
    public isGateRelocateMode: boolean = false;
    public selectedExhibit: any = null;

    // Selected animal for info panel
    public selectedAnimal: any = null;
    private animalPanelUpdateInterval: number | null = null;
    public selectedShelter: any = null;
    private shelterPanelUpdateInterval: number | null = null;

    // Selected staff for info panel
    public selectedStaff: any = null;
    private staffPanelUpdateInterval: number | null = null;

    // Selected guest for info panel
    public selectedGuest: any = null;
    private guestPanelUpdateInterval: number | null = null;

    // Entrance panel state
    private entrancePanelVisible: boolean = false;
    private entrancePanelUpdateInterval: number | null = null;

    // Touch mode state
    public touchMode: boolean = false;
    public selectedTile: GridPos | null = null;  // For two-step placement in touch mode
    private touchStartPos: { x: number; y: number } | null = null;
    private touchStartTime: number = 0;
    private initialPinchDistance: number = 0;
    private initialZoom: number = 1;
    private isTouchPanning: boolean = false;

    // Touch fence/path placement state (two-step: tap start, drag to end, confirm)
    public touchFenceStart: TileEdge | null = null;  // First point for fence
    public touchFenceEnd: TileEdge | null = null;    // Second point for fence
    public touchPathStart: GridPos | null = null;    // First point for path
    public touchPathEnd: GridPos | null = null;      // Second point for path
    public touchPlacementReady: boolean = false;     // True when ready to confirm
    private wasTwoFingerGesture: boolean = false;    // Track if last gesture was two-finger

    constructor(game: Game) {
        this.game = game;
        this.bindEvents();
    }

    /**
     * Bind all input event listeners
     */
    private bindEvents(): void {
        const canvas = this.game.app.canvas;

        // Mouse events
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('mouseleave', () => this.onMouseLeave());
        canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Touch events (for iPad support)
        canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));

        // Keyboard events
        document.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Prevent context menu on right-click
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // UI event bindings
        this.bindUIEvents();
    }

    /**
     * Bind UI button events
     */
    private bindUIEvents(): void {
        // Tool buttons
        const toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = (btn as HTMLElement).dataset.tool;
                if (tool) {
                    this.selectTool(tool);
                }
            });
        });

        // Speed button
        const speedBtn = document.getElementById('speed-btn');
        speedBtn?.addEventListener('click', () => {
            this.game.cycleSpeed();
        });

        // Undo button
        const undoBtn = document.getElementById('undo-btn');
        undoBtn?.addEventListener('click', () => {
            this.undo();
        });

        // Settings button
        const settingsBtn = document.getElementById('settings-btn');
        const settingsPanel = document.getElementById('settings-panel');
        const settingsClose = document.getElementById('settings-close');

        settingsBtn?.addEventListener('click', () => {
            settingsPanel?.classList.toggle('hidden');
        });

        settingsClose?.addEventListener('click', () => {
            settingsPanel?.classList.add('hidden');
        });

        // Visibility toggle buttons
        const toggleGuests = document.getElementById('toggle-guests');
        const toggleFoliage = document.getElementById('toggle-foliage');
        const toggleBuildings = document.getElementById('toggle-buildings');

        toggleGuests?.addEventListener('click', () => {
            this.game.showGuests = !this.game.showGuests;
            toggleGuests.classList.toggle('active', this.game.showGuests);
            // Hide guest panel if hiding guests
            if (!this.game.showGuests) {
                this.hideSelectedGuestPanel();
            }
        });

        toggleFoliage?.addEventListener('click', () => {
            this.game.showFoliage = !this.game.showFoliage;
            toggleFoliage.classList.toggle('active', this.game.showFoliage);
        });

        toggleBuildings?.addEventListener('click', () => {
            this.game.showBuildings = !this.game.showBuildings;
            toggleBuildings.classList.toggle('active', this.game.showBuildings);
            // Hide shelter panel if hiding buildings
            if (!this.game.showBuildings) {
                this.hideSelectedShelterPanel();
            }
        });

        // Grid toggle
        const showGridToggle = document.getElementById('show-grid-toggle') as HTMLInputElement;
        showGridToggle?.addEventListener('change', () => {
            this.game.renderer.showTileGrid = showGridToggle.checked;
        });

        // FPS toggle
        const showFpsToggle = document.getElementById('show-fps-toggle') as HTMLInputElement;
        showFpsToggle?.addEventListener('change', () => {
            const debugPanel = document.getElementById('debug-panel');
            if (showFpsToggle.checked) {
                debugPanel?.classList.remove('hidden');
            } else {
                debugPanel?.classList.add('hidden');
            }
        });

        // Touch mode toggle
        const touchModeToggle = document.getElementById('touch-mode-toggle') as HTMLInputElement;
        touchModeToggle?.addEventListener('change', () => {
            this.setTouchMode(touchModeToggle.checked);
        });

        // Touch control buttons
        const touchRotateBtn = document.getElementById('touch-rotate-btn');
        touchRotateBtn?.addEventListener('click', () => {
            this.rotatePlacement();
        });

        const touchZoomInBtn = document.getElementById('touch-zoom-in-btn');
        touchZoomInBtn?.addEventListener('click', () => {
            this.game.camera.zoomIn();
        });

        const touchZoomOutBtn = document.getElementById('touch-zoom-out-btn');
        touchZoomOutBtn?.addEventListener('click', () => {
            this.game.camera.zoomOut();
        });

        const touchConfirmBtn = document.getElementById('touch-confirm-btn');
        touchConfirmBtn?.addEventListener('click', () => {
            this.confirmTouchPlacement();
        });

        const touchCancelBtn = document.getElementById('touch-cancel-btn');
        touchCancelBtn?.addEventListener('click', () => {
            this.cancelTouchPlacement();
        });

        // Info panel close
        const infoClose = document.getElementById('info-close');
        infoClose?.addEventListener('click', () => {
            const infoPanel = document.getElementById('info-panel');
            infoPanel?.classList.add('hidden');
        });

        // Gender buttons
        const genderButtons = document.querySelectorAll('.gender-btn');
        genderButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const gender = (btn as HTMLElement).dataset.gender as Gender;
                if (gender) {
                    this.selectedGender = gender;
                    genderButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        });

        // Exhibit info panel close
        const exhibitPanelClose = document.getElementById('exhibit-panel-close');
        exhibitPanelClose?.addEventListener('click', () => {
            this.hideExhibitPanel();
        });

        // Exhibit name input
        const exhibitNameInput = document.getElementById('exhibit-panel-name') as HTMLInputElement;
        exhibitNameInput?.addEventListener('change', () => {
            if (this.selectedExhibit && exhibitNameInput.value.trim()) {
                this.selectedExhibit.setName(exhibitNameInput.value.trim());
            }
        });
        // Enter key dismisses keyboard and saves
        exhibitNameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                exhibitNameInput.blur();
            }
        });

        // New exhibit name input (modal) - Enter key handling
        const newExhibitNameInput = document.getElementById('exhibit-name-input') as HTMLInputElement;
        newExhibitNameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Click the confirm button to save
                const confirmBtn = document.getElementById('exhibit-name-confirm');
                confirmBtn?.click();
            }
        });

        // Relocate gate button
        const relocateGateBtn = document.getElementById('exhibit-relocate-gate-btn');
        relocateGateBtn?.addEventListener('click', () => {
            this.toggleGateRelocateMode();
        });

        // Selected animal panel close
        const animalPanelClose = document.getElementById('selected-animal-close');
        animalPanelClose?.addEventListener('click', () => {
            this.hideSelectedAnimalPanel();
        });

        // Selected animal name input
        const animalNameInput = document.getElementById('selected-animal-name') as HTMLInputElement;
        animalNameInput?.addEventListener('change', () => {
            if (this.selectedAnimal && animalNameInput.value.trim()) {
                this.selectedAnimal.setName(animalNameInput.value.trim());
            }
        });

        // Happiness breakdown toggle
        const happinessBarGroup = document.getElementById('happiness-bar-group');
        happinessBarGroup?.addEventListener('click', () => {
            const breakdown = document.getElementById('happiness-breakdown');
            if (breakdown) {
                breakdown.classList.toggle('hidden');
                happinessBarGroup.classList.toggle('expanded', !breakdown.classList.contains('hidden'));
            }
        });

        // Selected staff panel close
        const staffPanelClose = document.getElementById('selected-staff-close');
        staffPanelClose?.addEventListener('click', () => {
            this.hideSelectedStaffPanel();
        });

        // Selected shelter panel close
        const shelterPanelClose = document.getElementById('selected-shelter-close');
        shelterPanelClose?.addEventListener('click', () => {
            this.hideSelectedShelterPanel();
        });

        // Selected staff name input
        const staffNameInput = document.getElementById('selected-staff-name') as HTMLInputElement;
        staffNameInput?.addEventListener('change', () => {
            if (this.selectedStaff && staffNameInput.value.trim()) {
                this.selectedStaff.setName(staffNameInput.value.trim());
            }
        });

        // Brush size controls
        const brushDecreaseBtn = document.getElementById('brush-size-decrease');
        brushDecreaseBtn?.addEventListener('click', () => {
            this.decreaseBrushSize();
        });

        const brushIncreaseBtn = document.getElementById('brush-size-increase');
        brushIncreaseBtn?.addEventListener('click', () => {
            this.increaseBrushSize();
        });
    }

    /**
     * Select a tool
     */
    private selectTool(tool: string): void {
        // Update button states
        const buttons = document.querySelectorAll('.tool-btn[data-tool]');
        buttons.forEach(btn => {
            btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === tool);
        });

        // Set game tool
        this.game.setTool(tool as any);

        // Hide info panels when switching tools
        if (tool !== 'animal') {
            this.hideAnimalInfo();
        }
        if (tool !== 'foliage') {
            this.hideFoliageInfo();
        }

        // Show/hide submenu based on tool
        this.updateSubmenu(tool);
    }

    /**
     * Update submenu for selected tool
     */
    private updateSubmenu(tool: string): void {
        const submenuPanel = document.getElementById('submenu-panel');
        const submenuContent = document.getElementById('submenu-content');

        if (!submenuPanel || !submenuContent) return;

        // Define submenu items for each tool
        const submenus: Record<string, Array<{ id: string; name: string; cost: number; icon: string; biome?: string }>> = {
            terrain: [
                { id: 'grass', name: 'Grass', cost: 10, icon: '🌿' },
                { id: 'dirt', name: 'Dirt', cost: 5, icon: '🟫' },
                { id: 'sand', name: 'Sand', cost: 15, icon: '🏖️' },
                { id: 'savanna', name: 'Savanna', cost: 20, icon: '🌾' },
                { id: 'prairie', name: 'Prairie', cost: 18, icon: '🌱' },
                { id: 'water', name: 'Water', cost: 50, icon: '💧' },
            ],
            path: [
                { id: 'dirt', name: 'Dirt Path', cost: 15, icon: '🟤' },
                { id: 'stone', name: 'Stone Path', cost: 25, icon: '⬜' },
                { id: 'brick', name: 'Brick Path', cost: 35, icon: '🧱' },
                { id: 'cobble', name: 'Cobblestone', cost: 30, icon: '⚫' },
            ],
            fence: [
                { id: 'wood', name: 'Wooden Fence', cost: 50, icon: '🪵' },
                { id: 'iron', name: 'Iron Fence', cost: 100, icon: '🔩' },
                { id: 'concrete', name: 'Concrete Wall', cost: 150, icon: '🧱' },
            ],
            animal: [
                { id: 'lion', name: 'Lion', cost: 2500, icon: '🦁' },
                { id: 'bison', name: 'American Bison', cost: 1800, icon: '🦬' },
            ],
            staff: [
                { id: 'zookeeper', name: 'Zookeeper', cost: 500, icon: '🧑‍🌾' },
                { id: 'maintenance', name: 'Maintenance', cost: 400, icon: '🔧' },
            ],
            foliage: [
                { id: 'acacia', name: 'Acacia Tree', cost: 150, icon: '🌳', biome: 'savanna' },
                { id: 'tall_grass', name: 'Tall Grass', cost: 25, icon: '🌾', biome: 'savanna' },
                { id: 'prairie_grass', name: 'Prairie Grass', cost: 20, icon: '🌿', biome: 'prairie' },
                { id: 'shrub', name: 'Prairie Shrub', cost: 75, icon: '🌲', biome: 'prairie' },
                { id: 'wildflowers', name: 'Wildflowers', cost: 30, icon: '🌸', biome: 'prairie' },
            ],
            shelter: [
                { id: 'concrete_small', name: 'Small Shelter (2x1)', cost: 500, icon: '🏠' },
                { id: 'concrete_regular', name: 'Regular Shelter (2x2)', cost: 900, icon: '🏘️' },
                { id: 'concrete_large', name: 'Large Shelter (3x2)', cost: 1400, icon: '🏛️' },
            ],
            building: [
                { id: 'burger_stand', name: 'Burger Stand (2x2)', cost: 1500, icon: '🍔' },
            ],
        };

        const items = submenus[tool];

        if (!items || items.length === 0) {
            submenuPanel.classList.add('hidden');
            return;
        }

        // Build submenu HTML
        let submenuHTML = items.map((item, index) => `
            <div class="submenu-item ${index === 0 ? 'selected' : ''}" data-item="${item.id}">
                <span class="icon">${item.icon}</span>
                <div class="details">
                    <div class="name">${item.name}</div>
                    <div class="cost">$${item.cost}</div>
                </div>
            </div>
        `).join('');

        // Add brush size controls for terrain tool
        if (tool === 'terrain') {
            submenuHTML += `
                <div class="brush-size-control">
                    <span class="brush-label">Brush Size:</span>
                    <div class="brush-size-buttons">
                        <button id="brush-size-decrease" class="brush-btn" ${this.brushSize <= this.minBrushSize ? 'disabled' : ''}>-</button>
                        <span id="brush-size-value">${this.brushSize}x${this.brushSize}</span>
                        <button id="brush-size-increase" class="brush-btn" ${this.brushSize >= this.maxBrushSize ? 'disabled' : ''}>+</button>
                    </div>
                    <span class="brush-hint">[ / ]</span>
                </div>
            `;
        }

        // Add rotation controls for shelter and building tools
        if (tool === 'shelter' || tool === 'building') {
            const rotationLabels = ['0°', '90°', '180°', '270°'];
            submenuHTML += `
                <div class="rotation-control">
                    <span class="rotation-label">Rotation:</span>
                    <div class="rotation-buttons">
                        <button id="rotate-left" class="rotate-btn" title="Rotate Left">↺</button>
                        <span id="rotation-value">${rotationLabels[this.placementRotation]}</span>
                        <button id="rotate-right" class="rotate-btn" title="Rotate Right">↻</button>
                    </div>
                    <span class="rotation-hint">[R]</span>
                </div>
            `;
        }

        submenuContent.innerHTML = submenuHTML;

        // Bind click events
        const submenuItems = submenuContent.querySelectorAll('.submenu-item');
        submenuItems.forEach(itemEl => {
            itemEl.addEventListener('click', () => {
                submenuItems.forEach(el => el.classList.remove('selected'));
                itemEl.classList.add('selected');
                const itemId = (itemEl as HTMLElement).dataset.item;
                if (itemId) {
                    this.game.setItem(itemId);
                    // Show info panels based on tool
                    if (tool === 'animal') {
                        this.showAnimalInfo(itemId);
                        this.hideFoliageInfo();
                    } else if (tool === 'foliage') {
                        this.showFoliageInfo(itemId);
                        this.hideAnimalInfo();
                    }
                }
            });
        });

        // Select first item
        if (items.length > 0) {
            this.game.setItem(items[0].id);
            // Show info panels based on tool
            if (tool === 'animal') {
                this.showAnimalInfo(items[0].id);
            } else if (tool === 'foliage') {
                this.showFoliageInfo(items[0].id);
            }
        }

        // Bind brush size button events for terrain tool
        if (tool === 'terrain') {
            const brushDecreaseBtn = document.getElementById('brush-size-decrease');
            brushDecreaseBtn?.addEventListener('click', () => {
                this.decreaseBrushSize();
            });

            const brushIncreaseBtn = document.getElementById('brush-size-increase');
            brushIncreaseBtn?.addEventListener('click', () => {
                this.increaseBrushSize();
            });
        }

        // Bind rotation button events for shelter and building tools
        if (tool === 'shelter' || tool === 'building') {
            const rotateLeftBtn = document.getElementById('rotate-left');
            rotateLeftBtn?.addEventListener('click', () => {
                this.rotatePlacementLeft();
            });

            const rotateRightBtn = document.getElementById('rotate-right');
            rotateRightBtn?.addEventListener('click', () => {
                this.rotatePlacementRight();
            });
        }

        submenuPanel.classList.remove('hidden');
    }

    /**
     * Show animal info panel
     */
    private showAnimalInfo(animalId: string): void {
        const info = ANIMAL_INFO[animalId];
        if (!info) {
            this.hideAnimalInfo();
            return;
        }

        const panel = document.getElementById('animal-info-panel');
        if (!panel) return;

        // Update panel content
        const iconEl = document.getElementById('animal-info-icon');
        const nameEl = document.getElementById('animal-info-name');
        const scientificEl = document.getElementById('animal-info-scientific');
        const descEl = document.getElementById('animal-info-description');
        const dietEl = document.getElementById('animal-info-diet');
        const sizeEl = document.getElementById('animal-info-size');
        const lifespanEl = document.getElementById('animal-info-lifespan');
        const temperamentEl = document.getElementById('animal-info-temperament');
        const groupEl = document.getElementById('animal-info-group');
        const terrainEl = document.getElementById('animal-info-terrain');
        const foliageEl = document.getElementById('animal-info-foliage');

        if (iconEl) iconEl.textContent = animalId === 'lion' ? '🦁' : '🦬';
        if (nameEl) nameEl.textContent = info.speciesName;
        if (scientificEl) scientificEl.textContent = info.scientificName;
        if (descEl) descEl.textContent = info.description;
        if (dietEl) dietEl.textContent = info.preferredFood.join(', ');
        if (sizeEl) sizeEl.textContent = info.size;
        if (lifespanEl) lifespanEl.textContent = info.lifespan;
        if (temperamentEl) temperamentEl.textContent = info.temperament;
        if (groupEl) groupEl.textContent = `${info.socialNeeds.minGroupSize}-${info.socialNeeds.maxGroupSize} (ideal: ${info.socialNeeds.idealGroupSize})`;

        // Terrain needs
        if (terrainEl) {
            const terrainNames: Record<string, string> = {
                savanna: 'Savanna', grass: 'Grass', prairie: 'Prairie', dirt: 'Dirt', sand: 'Sand', water: 'Water'
            };
            terrainEl.innerHTML = Object.entries(info.terrainNeeds)
                .map(([terrain, pct]) => {
                    const percentage = Math.round((pct as number) * 100);
                    return `
                        <div class="need-item">
                            <span class="need-name">${terrainNames[terrain] || terrain}</span>
                            <div class="need-bar">
                                <div class="need-fill" style="width: ${percentage}%"></div>
                            </div>
                            <span class="need-value">${percentage}%</span>
                        </div>
                    `;
                }).join('');
        }

        // Foliage needs
        if (foliageEl) {
            const foliageNames: Record<string, string> = {
                acacia: 'Acacia Tree', tall_grass: 'Tall Grass', prairie_grass: 'Prairie Grass', shrub: 'Shrub'
            };
            foliageEl.innerHTML = Object.entries(info.foliageNeeds)
                .map(([foliage, pct]) => {
                    const percentage = Math.round((pct as number) * 100);
                    return `
                        <div class="need-item">
                            <span class="need-name">${foliageNames[foliage] || foliage}</span>
                            <div class="need-bar">
                                <div class="need-fill" style="width: ${percentage}%"></div>
                            </div>
                            <span class="need-value">${percentage}%</span>
                        </div>
                    `;
                }).join('');
        }

        panel.classList.remove('hidden');
    }

    /**
     * Hide animal info panel
     */
    private hideAnimalInfo(): void {
        const panel = document.getElementById('animal-info-panel');
        if (panel) {
            panel.classList.add('hidden');
        }
    }

    /**
     * Show foliage info panel
     */
    private showFoliageInfo(foliageId: string): void {
        const foliageType = FoliageTypes[foliageId as keyof typeof FoliageTypes];
        if (!foliageType) {
            this.hideFoliageInfo();
            return;
        }

        const panel = document.getElementById('foliage-info-panel');
        if (!panel) return;

        // Update panel content
        const iconEl = document.getElementById('foliage-info-icon');
        const nameEl = document.getElementById('foliage-info-name');
        const biomeEl = document.getElementById('foliage-info-biome');
        const descEl = document.getElementById('foliage-info-description');
        const heightEl = document.getElementById('foliage-info-height');
        const spaceEl = document.getElementById('foliage-info-space');
        const costEl = document.getElementById('foliage-info-cost');

        if (iconEl) iconEl.textContent = foliageType.icon;
        if (nameEl) nameEl.textContent = foliageType.name;
        if (biomeEl) {
            const biomeNames: Record<string, string> = {
                savanna: 'Savanna Biome',
                prairie: 'Prairie Biome'
            };
            biomeEl.textContent = biomeNames[foliageType.biome] || foliageType.biome;
        }
        if (descEl) descEl.textContent = foliageType.description;
        if (heightEl) {
            const heightNames: Record<string, string> = {
                low: 'Low',
                medium: 'Medium',
                tall: 'Tall'
            };
            heightEl.textContent = heightNames[foliageType.height] || foliageType.height;
        }
        if (spaceEl) {
            const perTile = Math.round(1 / foliageType.tileSpace);
            spaceEl.textContent = `${perTile} per tile`;
        }
        if (costEl) costEl.textContent = `$${foliageType.cost}`;

        panel.classList.remove('hidden');
    }

    /**
     * Hide foliage info panel
     */
    private hideFoliageInfo(): void {
        const panel = document.getElementById('foliage-info-panel');
        if (panel) {
            panel.classList.add('hidden');
        }
    }

    /**
     * Show exhibit info panel for a gate
     */
    private showExhibitPanel(exhibit: any): void {
        this.selectedExhibit = exhibit;

        const panel = document.getElementById('exhibit-info-panel');
        if (!panel) return;

        const stats = exhibit.getStats();

        // Update name input
        const nameInput = document.getElementById('exhibit-panel-name') as HTMLInputElement;
        if (nameInput) nameInput.value = stats.name;

        // Update stats
        const sizeEl = document.getElementById('exhibit-panel-size');
        const animalsEl = document.getElementById('exhibit-panel-animals');
        const happinessEl = document.getElementById('exhibit-panel-happiness');
        const hungerEl = document.getElementById('exhibit-panel-hunger');

        if (sizeEl) sizeEl.textContent = `${stats.size} tiles`;
        if (animalsEl) animalsEl.textContent = `${stats.totalAnimals}`;
        if (happinessEl) happinessEl.textContent = `${stats.avgHappiness}%`;
        if (hungerEl) hungerEl.textContent = `${stats.avgHunger}%`;

        // Update animal list
        const animalList = document.getElementById('exhibit-panel-animal-list');
        if (animalList) {
            const animals = exhibit.getAnimals();
            if (animals.length > 0) {
                animalList.innerHTML = animals.map((animal: any) => `
                    <div class="animal-list-item">
                        <span class="icon">${animal.getIcon?.() || '🐾'}</span>
                        <span class="name">${animal.speciesName || 'Unknown'}</span>
                        <span class="gender">${animal.gender === 'male' ? '♂' : '♀'}</span>
                    </div>
                `).join('');
            } else {
                animalList.innerHTML = '';
            }
        }

        panel.classList.remove('hidden');
    }

    /**
     * Hide exhibit info panel
     */
    private hideExhibitPanel(): void {
        const panel = document.getElementById('exhibit-info-panel');
        if (panel) {
            panel.classList.add('hidden');
        }
        this.selectedExhibit = null;
        this.exitGateRelocateMode();
    }

    /**
     * Toggle gate relocation mode
     */
    private toggleGateRelocateMode(): void {
        if (this.isGateRelocateMode) {
            this.exitGateRelocateMode();
        } else {
            this.enterGateRelocateMode();
        }
    }

    /**
     * Enter gate relocation mode
     */
    private enterGateRelocateMode(): void {
        if (!this.selectedExhibit) return;

        this.isGateRelocateMode = true;
        document.body.classList.add('gate-relocate-mode');

        const btn = document.getElementById('exhibit-relocate-gate-btn');
        if (btn) btn.classList.add('active');

        // Add hint text
        const body = document.querySelector('.exhibit-panel-body');
        if (body && !body.querySelector('.gate-relocate-hint')) {
            const hint = document.createElement('div');
            hint.className = 'gate-relocate-hint';
            hint.textContent = 'Click on any fence in this exhibit to move the gate there';
            body.appendChild(hint);
        }
    }

    /**
     * Exit gate relocation mode
     */
    private exitGateRelocateMode(): void {
        this.isGateRelocateMode = false;
        document.body.classList.remove('gate-relocate-mode');

        const btn = document.getElementById('exhibit-relocate-gate-btn');
        if (btn) btn.classList.remove('active');

        // Remove hint text
        const hint = document.querySelector('.gate-relocate-hint');
        if (hint) hint.remove();
    }

    /**
     * Relocate gate to a new fence edge
     */
    private relocateGate(tileX: number, tileY: number, edge: string): void {
        if (!this.selectedExhibit) return;

        // Check if this fence is part of the exhibit's perimeter
        if (!this.selectedExhibit.hasFenceEdge(tileX, tileY, edge)) {
            console.log('This fence is not part of the exhibit perimeter');
            return;
        }

        // Get the fence type from the tile
        const tile = this.game.world.getTile(tileX, tileY);
        if (!tile) return;

        const fenceType = tile.fences[edge as keyof typeof tile.fences];

        // Update the gate location
        this.selectedExhibit.setGate(tileX, tileY, edge, fenceType);

        // Update pathfinding with new gate location
        this.game.pathfinding.updateWorld(this.game.world);

        console.log(`Gate relocated to (${tileX}, ${tileY}) edge: ${edge}`);

        this.exitGateRelocateMode();
    }

    /**
     * Show selected animal info panel
     */
    private showSelectedAnimalPanel(animal: any): void {
        this.selectedAnimal = animal;

        const panel = document.getElementById('selected-animal-panel');
        if (!panel) return;

        // Update static info
        const iconEl = document.getElementById('selected-animal-icon');
        const nameInput = document.getElementById('selected-animal-name') as HTMLInputElement;
        const speciesEl = document.getElementById('selected-animal-species');
        const ageEl = document.getElementById('selected-animal-age');
        const genderEl = document.getElementById('selected-animal-gender');

        if (iconEl) iconEl.textContent = animal.getIcon?.() || '🐾';
        if (nameInput) nameInput.value = animal.name;
        if (speciesEl) speciesEl.textContent = animal.speciesName;
        if (ageEl) ageEl.textContent = animal.getAgeString?.() || `${animal.age} days`;
        if (genderEl) genderEl.textContent = animal.gender === 'male' ? '♂ Male' : '♀ Female';

        // Reset happiness breakdown state
        const breakdown = document.getElementById('happiness-breakdown');
        const happinessBarGroup = document.getElementById('happiness-bar-group');
        if (breakdown) breakdown.classList.add('hidden');
        if (happinessBarGroup) happinessBarGroup.classList.remove('expanded');

        // Update dynamic stats
        this.updateSelectedAnimalPanel();

        // Start update interval for live stats
        if (this.animalPanelUpdateInterval) {
            clearInterval(this.animalPanelUpdateInterval);
        }
        this.animalPanelUpdateInterval = window.setInterval(() => {
            this.updateSelectedAnimalPanel();
        }, 500);

        panel.classList.remove('hidden');
    }

    /**
     * Update selected animal panel stats
     */
    private updateSelectedAnimalPanel(): void {
        if (!this.selectedAnimal) return;

        const animal = this.selectedAnimal;

        // Update stat bars
        const hungerBar = document.getElementById('selected-animal-hunger-bar');
        const hungerValue = document.getElementById('selected-animal-hunger-value');
        const energyBar = document.getElementById('selected-animal-energy-bar');
        const energyValue = document.getElementById('selected-animal-energy-value');
        const happinessBar = document.getElementById('selected-animal-happiness-bar');
        const happinessValue = document.getElementById('selected-animal-happiness-value');
        const healthBar = document.getElementById('selected-animal-health-bar');
        const healthValue = document.getElementById('selected-animal-health-value');

        const hunger = Math.round(animal.hunger);
        const energy = Math.round(animal.energy);
        const happiness = Math.round(animal.happiness);
        const health = Math.round(animal.health);

        // Update bars with width and color class
        this.updateStatBar(hungerBar, hungerValue, hunger);
        this.updateStatBar(energyBar, energyValue, energy);
        this.updateStatBar(happinessBar, happinessValue, happiness);
        this.updateStatBar(healthBar, healthValue, health);

        // Update happiness breakdown
        this.updateHappinessBreakdown(animal);

        // Update state
        const stateEl = document.getElementById('selected-animal-state');
        if (stateEl) {
            const stateNames: Record<string, string> = {
                idle: 'Resting',
                walking: 'Walking',
                eating: 'Eating',
                sleeping: 'Sleeping',
                resting: 'Resting in shelter',
            };
            stateEl.textContent = stateNames[animal.state] || animal.state;
        }

        // Update pregnancy info
        const pregnancyEl = document.getElementById('selected-animal-pregnancy');
        if (pregnancyEl) {
            if (animal.isPregnant) {
                pregnancyEl.classList.remove('hidden');
                const daysRemaining = animal.breedingConfig?.gestationDays - animal.pregnancyTimer;
                pregnancyEl.textContent = `Pregnant - ${daysRemaining} days remaining`;
            } else {
                pregnancyEl.classList.add('hidden');
            }
        }
    }

    /**
     * Update a stat bar with value and color class based on percentage
     */
    private updateStatBar(bar: HTMLElement | null, valueEl: HTMLElement | null, value: number): void {
        if (bar) {
            bar.style.width = `${value}%`;
            // Remove old color classes
            bar.classList.remove('bar-good', 'bar-medium', 'bar-poor');
            // Add new color class based on value
            if (value >= 60) {
                bar.classList.add('bar-good');
            } else if (value >= 30) {
                bar.classList.add('bar-medium');
            } else {
                bar.classList.add('bar-poor');
            }
        }
        if (valueEl) {
            valueEl.textContent = `${value}%`;
        }
    }

    /**
     * Update happiness breakdown display
     */
    private updateHappinessBreakdown(animal: any): void {
        const factors = animal.happinessFactors;
        if (!factors) return;

        const updateFactor = (id: string, factor: { value: number; reason: string }) => {
            const bar = document.getElementById(`breakdown-${id}-bar`);
            const valueEl = document.getElementById(`breakdown-${id}-value`);
            const reasonEl = document.getElementById(`breakdown-${id}-reason`);

            const value = factor.value;
            const reason = factor.reason;

            if (bar) {
                bar.style.width = `${value}%`;
                // Apply color class based on value
                bar.classList.remove('bar-good', 'bar-medium', 'bar-poor');
                if (value >= 60) {
                    bar.classList.add('bar-good');
                } else if (value >= 30) {
                    bar.classList.add('bar-medium');
                } else {
                    bar.classList.add('bar-poor');
                }
            }
            if (valueEl) {
                valueEl.textContent = `${value}%`;
                // Color code text based on value
                valueEl.classList.remove('good', 'medium', 'poor');
                if (value >= 60) {
                    valueEl.classList.add('good');
                } else if (value >= 30) {
                    valueEl.classList.add('medium');
                } else {
                    valueEl.classList.add('poor');
                }
            }

            // Show/hide reason
            if (reasonEl) {
                if (value < 100 && reason) {
                    reasonEl.textContent = reason;
                    reasonEl.classList.remove('hidden');
                } else {
                    reasonEl.classList.add('hidden');
                }
            }
        };

        updateFactor('hunger', factors.hunger);
        updateFactor('health', factors.health);
        updateFactor('energy', factors.energy);
        updateFactor('terrain', factors.terrain);
        updateFactor('foliage', factors.foliage);
        updateFactor('social', factors.social);
        updateFactor('space', factors.space);

        // Shelter factor - show only if animal needs shelter
        const shelterItem = document.getElementById('breakdown-shelter-item');
        if (shelterItem) {
            if (animal.needsShelter) {
                shelterItem.classList.remove('hidden');
                updateFactor('shelter', factors.shelter);
            } else {
                shelterItem.classList.add('hidden');
            }
        }
    }

    /**
     * Hide selected animal panel
     */
    private hideSelectedAnimalPanel(): void {
        const panel = document.getElementById('selected-animal-panel');
        if (panel) {
            panel.classList.add('hidden');
        }
        this.selectedAnimal = null;

        if (this.animalPanelUpdateInterval) {
            clearInterval(this.animalPanelUpdateInterval);
            this.animalPanelUpdateInterval = null;
        }
    }

    /**
     * Show selected guest info panel
     */
    private showSelectedGuestPanel(guest: any): void {
        this.selectedGuest = guest;

        // Hide other panels
        this.hideSelectedAnimalPanel();
        this.hideSelectedStaffPanel();
        this.hideSelectedShelterPanel();

        const panel = document.getElementById('selected-guest-panel');
        if (!panel) return;

        // Update static info
        const iconEl = document.getElementById('selected-guest-icon');
        if (iconEl) iconEl.textContent = guest.getIcon?.() || '🧑';

        // Update dynamic stats
        this.updateSelectedGuestPanel();

        // Start update interval for live stats
        if (this.guestPanelUpdateInterval) {
            clearInterval(this.guestPanelUpdateInterval);
        }
        this.guestPanelUpdateInterval = window.setInterval(() => {
            this.updateSelectedGuestPanel();
        }, 500);

        panel.classList.remove('hidden');

        // Bind close button
        const closeBtn = document.getElementById('selected-guest-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.hideSelectedGuestPanel();
        }
    }

    /**
     * Update selected guest panel stats
     */
    private updateSelectedGuestPanel(): void {
        if (!this.selectedGuest) return;

        const guest = this.selectedGuest;

        // Update state
        const stateEl = document.getElementById('selected-guest-state');
        if (stateEl) {
            const stateNames: Record<string, string> = {
                entering: 'Entering',
                wandering: 'Exploring',
                viewing: 'Viewing Exhibit',
                leaving: 'Leaving',
                left: 'Left',
            };
            stateEl.textContent = stateNames[guest.state] || guest.state;
        }

        // Update exhibits viewed
        const exhibitsEl = document.getElementById('selected-guest-exhibits');
        if (exhibitsEl) {
            exhibitsEl.textContent = guest.exhibitsViewed?.size?.toString() || '0';
        }

        // Update visit time
        const timeEl = document.getElementById('selected-guest-time');
        if (timeEl) {
            const minutes = Math.floor((guest.visitDuration || 0) / 60);
            const seconds = Math.floor((guest.visitDuration || 0) % 60);
            timeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        // Update favorite animals
        const favoritesEl = document.getElementById('selected-guest-favorites');
        if (favoritesEl && guest.favoriteAnimals) {
            const favorites = guest.favoriteAnimals.map((a: any) => `${a.icon} ${a.name}`).join(', ');
            favoritesEl.textContent = favorites || 'None';
        }

        // Update stat bars
        const updateBar = (id: string, valueId: string, value: number) => {
            const bar = document.getElementById(id);
            const valueEl = document.getElementById(valueId);
            if (bar) {
                bar.style.width = `${value}%`;
                // Color based on value
                if (value >= 70) bar.style.backgroundColor = '#2ecc71';
                else if (value >= 40) bar.style.backgroundColor = '#f39c12';
                else bar.style.backgroundColor = '#e74c3c';
            }
            if (valueEl) valueEl.textContent = `${Math.round(value)}%`;
        };

        updateBar('selected-guest-happiness-bar', 'selected-guest-happiness-value', guest.happiness || 0);
        updateBar('selected-guest-hunger-bar', 'selected-guest-hunger-value', guest.hunger || 0);
        updateBar('selected-guest-thirst-bar', 'selected-guest-thirst-value', guest.thirst || 0);
        updateBar('selected-guest-energy-bar', 'selected-guest-energy-value', guest.energy || 0);

        // Update happiness breakdown
        const factors = guest.happinessFactors || {};
        for (const [key, factor] of Object.entries(factors) as [string, any][]) {
            const reasonEl = document.getElementById(`guest-breakdown-${key}-reason`);
            const barEl = document.getElementById(`guest-breakdown-${key}-bar`);
            const valueEl = document.getElementById(`guest-breakdown-${key}-value`);

            if (reasonEl) reasonEl.textContent = factor.reason || '';
            if (barEl) {
                barEl.style.width = `${factor.value}%`;
                if (factor.value >= 70) barEl.style.backgroundColor = '#2ecc71';
                else if (factor.value >= 40) barEl.style.backgroundColor = '#f39c12';
                else barEl.style.backgroundColor = '#e74c3c';
            }
            if (valueEl) valueEl.textContent = `${Math.round(factor.value)}%`;
        }
    }

    /**
     * Hide selected guest panel
     */
    private hideSelectedGuestPanel(): void {
        const panel = document.getElementById('selected-guest-panel');
        if (panel) {
            panel.classList.add('hidden');
        }
        this.selectedGuest = null;

        if (this.guestPanelUpdateInterval) {
            clearInterval(this.guestPanelUpdateInterval);
            this.guestPanelUpdateInterval = null;
        }
    }

    /**
     * Show selected staff info panel
     */
    private showSelectedStaffPanel(staff: any): void {
        this.selectedStaff = staff;

        // Hide other panels
        this.hideSelectedAnimalPanel();
        this.hideSelectedGuestPanel();

        const panel = document.getElementById('selected-staff-panel');
        if (!panel) return;

        // Update static info
        const iconEl = document.getElementById('selected-staff-icon');
        const nameInput = document.getElementById('selected-staff-name') as HTMLInputElement;
        const typeEl = document.getElementById('selected-staff-type');

        if (iconEl) iconEl.textContent = staff.getIcon?.() || '👷';
        if (nameInput) nameInput.value = staff.name;
        if (typeEl) {
            const typeNames: Record<string, string> = {
                zookeeper: 'Zookeeper',
                maintenance: 'Maintenance Worker',
            };
            typeEl.textContent = typeNames[staff.staffType] || staff.staffType;
        }

        // Update dynamic stats
        this.updateSelectedStaffPanel();

        // Start update interval for live stats
        if (this.staffPanelUpdateInterval) {
            clearInterval(this.staffPanelUpdateInterval);
        }
        this.staffPanelUpdateInterval = window.setInterval(() => {
            this.updateSelectedStaffPanel();
        }, 500);

        panel.classList.remove('hidden');
    }

    /**
     * Update selected staff panel stats
     */
    private updateSelectedStaffPanel(): void {
        if (!this.selectedStaff) return;

        const staff = this.selectedStaff;

        // Update state
        const stateEl = document.getElementById('selected-staff-state');
        if (stateEl) {
            const stateNames: Record<string, string> = {
                idle: 'Idle',
                walking: 'Walking',
                working: 'Working',
                wandering: 'Wandering',
            };
            stateEl.textContent = stateNames[staff.state] || staff.state;
        }

        // Update current task
        const taskEl = document.getElementById('selected-staff-task');
        if (taskEl) {
            const taskDesc = staff.getTaskDescription?.();
            if (taskDesc) {
                taskEl.textContent = taskDesc;
                taskEl.classList.remove('hidden');
            } else {
                taskEl.classList.add('hidden');
            }
        }

        // Update assigned exhibits list
        const assignedList = document.getElementById('staff-assigned-exhibits');
        if (assignedList) {
            const assigned = staff.assignedExhibits || [];
            if (assigned.length > 0) {
                assignedList.innerHTML = assigned.map((exhibit: any) => {
                    const animals = this.game.getAnimalsInExhibit?.(exhibit) || [];
                    return `
                        <div class="exhibit-assign-item" data-exhibit-id="${exhibit.id}">
                            <div>
                                <div class="exhibit-name">${exhibit.name}</div>
                                <div class="exhibit-animals">${animals.length} animal${animals.length !== 1 ? 's' : ''}</div>
                            </div>
                            <button class="unassign-btn" data-exhibit-id="${exhibit.id}">Unassign</button>
                        </div>
                    `;
                }).join('');

                // Bind unassign button events
                const unassignBtns = assignedList.querySelectorAll('.unassign-btn');
                unassignBtns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const exhibitId = parseInt((btn as HTMLElement).dataset.exhibitId || '0');
                        const exhibit = this.game.exhibits.find((ex: any) => ex.id === exhibitId);
                        if (exhibit && this.selectedStaff) {
                            this.selectedStaff.unassignExhibit(exhibit);
                            this.updateSelectedStaffPanel();
                        }
                    });
                });
            } else {
                assignedList.innerHTML = '';
            }
        }

        // Update available exhibits list
        const availableList = document.getElementById('staff-available-exhibits');
        if (availableList) {
            const assigned = staff.assignedExhibits || [];
            const assignedIds = new Set(assigned.map((e: any) => e.id));
            const available = (this.game.exhibits || []).filter((ex: any) => !assignedIds.has(ex.id));

            if (available.length > 0) {
                availableList.innerHTML = available.map((exhibit: any) => {
                    const animals = this.game.getAnimalsInExhibit?.(exhibit) || [];
                    return `
                        <div class="exhibit-assign-item" data-exhibit-id="${exhibit.id}">
                            <div>
                                <div class="exhibit-name">${exhibit.name}</div>
                                <div class="exhibit-animals">${animals.length} animal${animals.length !== 1 ? 's' : ''}</div>
                            </div>
                            <button class="assign-btn" data-exhibit-id="${exhibit.id}">Assign</button>
                        </div>
                    `;
                }).join('');

                // Bind assign button events
                const assignBtns = availableList.querySelectorAll('.assign-btn');
                assignBtns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const exhibitId = parseInt((btn as HTMLElement).dataset.exhibitId || '0');
                        const exhibit = this.game.exhibits.find((ex: any) => ex.id === exhibitId);
                        if (exhibit && this.selectedStaff) {
                            this.selectedStaff.assignExhibit(exhibit);
                            this.updateSelectedStaffPanel();
                        }
                    });
                });
            } else {
                availableList.innerHTML = '';
            }
        }
    }

    /**
     * Hide selected staff panel
     */
    private hideSelectedStaffPanel(): void {
        const panel = document.getElementById('selected-staff-panel');
        if (panel) {
            panel.classList.add('hidden');
        }
        this.selectedStaff = null;

        if (this.staffPanelUpdateInterval) {
            clearInterval(this.staffPanelUpdateInterval);
            this.staffPanelUpdateInterval = null;
        }
    }

    /**
     * Show selected shelter panel
     */
    private showSelectedShelterPanel(shelter: any): void {
        this.selectedShelter = shelter;

        const panel = document.getElementById('selected-shelter-panel');
        if (!panel) return;

        // Update initial content
        this.updateShelterPanel();

        // Show panel
        panel.classList.remove('hidden');

        // Start update interval
        if (this.shelterPanelUpdateInterval) {
            clearInterval(this.shelterPanelUpdateInterval);
        }
        this.shelterPanelUpdateInterval = window.setInterval(() => {
            this.updateShelterPanel();
        }, 500);
    }

    /**
     * Update shelter panel content
     */
    private updateShelterPanel(): void {
        if (!this.selectedShelter) return;

        const shelter = this.selectedShelter;

        // Get shelter size icon
        let icon = '🏠';
        if (shelter.size === 'regular') icon = '🏘️';
        else if (shelter.size === 'large') icon = '🏛️';

        // Update header
        const iconEl = document.getElementById('selected-shelter-icon');
        if (iconEl) iconEl.textContent = icon;

        const nameEl = document.getElementById('selected-shelter-name');
        if (nameEl) nameEl.textContent = shelter.getDisplayName?.() || `${shelter.size} Shelter`;

        // Update stats
        const capacity = shelter.getCapacity?.() || 0;
        const animalsInside = shelter.getAnimalsInside?.() || [];

        const capacityEl = document.getElementById('selected-shelter-capacity');
        if (capacityEl) capacityEl.textContent = `${animalsInside.length} / ${capacity}`;

        const occupancyEl = document.getElementById('selected-shelter-occupancy');
        if (occupancyEl) occupancyEl.textContent = `${animalsInside.length} animal${animalsInside.length !== 1 ? 's' : ''}`;

        // Update animals list
        const animalsListEl = document.getElementById('selected-shelter-animals');
        if (animalsListEl) {
            if (animalsInside.length === 0) {
                animalsListEl.innerHTML = '<span class="no-animals">No animals inside</span>';
            } else {
                animalsListEl.innerHTML = animalsInside.map((animal: any) => `
                    <div class="shelter-animal-item">
                        <span class="animal-icon">${animal.getIcon?.() || '🐾'}</span>
                        <span class="animal-name">${animal.name || animal.speciesName}</span>
                    </div>
                `).join('');
            }
        }
    }

    /**
     * Hide selected shelter panel
     */
    private hideSelectedShelterPanel(): void {
        const panel = document.getElementById('selected-shelter-panel');
        if (panel) {
            panel.classList.add('hidden');
        }
        this.selectedShelter = null;

        if (this.shelterPanelUpdateInterval) {
            clearInterval(this.shelterPanelUpdateInterval);
            this.shelterPanelUpdateInterval = null;
        }
    }

    /**
     * Check if tile coordinates are near the entrance gate
     */
    private isNearEntranceGate(tileX: number, tileY: number): boolean {
        const entrance = this.game.world.getEntrancePosition();
        // Entrance gate spans 3 tiles wide centered on entrance.x
        const dx = Math.abs(tileX - entrance.x);
        const dy = Math.abs(tileY - entrance.y);
        return dx <= 1 && dy <= 1;
    }

    /**
     * Show entrance panel with zoo stats
     */
    private showEntrancePanel(): void {
        // Hide other panels
        this.hideSelectedAnimalPanel();
        this.hideSelectedStaffPanel();
        this.hideSelectedShelterPanel();
        this.hideSelectedGuestPanel();
        this.hideExhibitPanel();

        const panel = document.getElementById('entrance-panel');
        if (!panel) return;

        this.entrancePanelVisible = true;

        // Update panel content
        this.updateEntrancePanelContent();

        // Show panel
        panel.classList.remove('hidden');

        // Bind events
        this.bindEntrancePanelEvents();

        // Set up update interval
        if (this.entrancePanelUpdateInterval) {
            clearInterval(this.entrancePanelUpdateInterval);
        }
        this.entrancePanelUpdateInterval = window.setInterval(() => {
            this.updateEntrancePanelContent();
        }, 500);
    }

    /**
     * Update entrance panel content with current stats
     */
    private updateEntrancePanelContent(): void {
        const game = this.game;

        // Update stats
        const totalVisitorsEl = document.getElementById('entrance-total-visitors');
        const currentGuestsEl = document.getElementById('entrance-current-guests');
        const totalAnimalsEl = document.getElementById('entrance-total-animals');
        const totalExhibitsEl = document.getElementById('entrance-total-exhibits');
        const entranceFeeEl = document.getElementById('entrance-fee-input') as HTMLInputElement;
        const zooNameEl = document.getElementById('entrance-zoo-name') as HTMLInputElement;

        if (totalVisitorsEl) totalVisitorsEl.textContent = game.totalVisitors.toLocaleString();
        if (currentGuestsEl) currentGuestsEl.textContent = game.guests.length.toString();
        if (totalAnimalsEl) totalAnimalsEl.textContent = game.animals.length.toString();
        if (totalExhibitsEl) totalExhibitsEl.textContent = game.exhibits.length.toString();
        if (entranceFeeEl && document.activeElement !== entranceFeeEl) {
            entranceFeeEl.value = game.entranceFee.toString();
        }
        if (zooNameEl && document.activeElement !== zooNameEl) {
            zooNameEl.value = game.zooName;
        }

        // Calculate and display average guest happiness
        const avgHappinessEl = document.getElementById('entrance-avg-happiness');
        const avgHappinessBar = document.getElementById('entrance-avg-happiness-bar');
        if (avgHappinessEl || avgHappinessBar) {
            const activeGuests = game.guests.filter((g: any) => g.state !== 'left');
            let avgHappiness = 0;
            if (activeGuests.length > 0) {
                const totalHappiness = activeGuests.reduce((sum: number, g: any) => sum + (g.happiness || 0), 0);
                avgHappiness = totalHappiness / activeGuests.length;
            }
            if (avgHappinessEl) avgHappinessEl.textContent = `${Math.round(avgHappiness)}%`;
            if (avgHappinessBar) {
                avgHappinessBar.style.width = `${avgHappiness}%`;
                if (avgHappiness >= 70) avgHappinessBar.style.backgroundColor = '#2ecc71';
                else if (avgHappiness >= 40) avgHappinessBar.style.backgroundColor = '#f39c12';
                else avgHappinessBar.style.backgroundColor = '#e74c3c';
            }
        }

        // Update zoo rating (simple formula based on exhibits and animals)
        this.updateZooRating();

        // Update top bar zoo name
        const topBarName = document.getElementById('zoo-name');
        if (topBarName) {
            topBarName.textContent = game.zooName;
        }
    }

    /**
     * Update zoo rating display
     */
    private updateZooRating(): void {
        const ratingContainer = document.getElementById('entrance-zoo-rating');
        if (!ratingContainer) return;

        // Calculate rating (1-5 stars) based on exhibits, animals, and guests
        const exhibitScore = Math.min(this.game.exhibits.length * 0.5, 1.5);
        const animalScore = Math.min(this.game.animals.length * 0.1, 1.5);
        const guestScore = Math.min(this.game.totalVisitors * 0.01, 1);
        const happinessScore = this.getAverageAnimalHappiness() * 1;

        const totalScore = Math.min(exhibitScore + animalScore + guestScore + happinessScore, 5);
        const stars = Math.round(totalScore);

        // Update star display
        const starElements = ratingContainer.querySelectorAll('.star');
        starElements.forEach((star, index) => {
            if (index < stars) {
                star.classList.remove('empty');
            } else {
                star.classList.add('empty');
            }
        });
    }

    /**
     * Get average happiness of all animals
     */
    private getAverageAnimalHappiness(): number {
        if (this.game.animals.length === 0) return 0;
        const totalHappiness = this.game.animals.reduce((sum, animal) => {
            return sum + (animal.happiness || 0);
        }, 0);
        return totalHappiness / this.game.animals.length;
    }

    /**
     * Bind entrance panel events
     */
    private bindEntrancePanelEvents(): void {
        // Close button
        const closeBtn = document.getElementById('entrance-panel-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.hideEntrancePanel();
        }

        // Zoo name input
        const zooNameInput = document.getElementById('entrance-zoo-name') as HTMLInputElement;
        if (zooNameInput) {
            zooNameInput.onchange = () => {
                this.game.zooName = zooNameInput.value || 'My Zoo';
                // Update top bar
                const topBarName = document.getElementById('zoo-name');
                if (topBarName) {
                    topBarName.textContent = this.game.zooName;
                }
            };
        }

        // Entrance fee input
        const feeInput = document.getElementById('entrance-fee-input') as HTMLInputElement;
        if (feeInput) {
            feeInput.onchange = () => {
                const fee = parseInt(feeInput.value) || 0;
                this.game.entranceFee = Math.max(0, Math.min(100, fee));
                feeInput.value = this.game.entranceFee.toString();
            };
        }
    }

    /**
     * Hide entrance panel
     */
    private hideEntrancePanel(): void {
        const panel = document.getElementById('entrance-panel');
        if (panel) {
            panel.classList.add('hidden');
        }
        this.entrancePanelVisible = false;

        if (this.entrancePanelUpdateInterval) {
            clearInterval(this.entrancePanelUpdateInterval);
            this.entrancePanelUpdateInterval = null;
        }
    }

    /**
     * Find animal near click position with larger hitbox
     */
    private findAnimalNearClick(screenX: number, screenY: number): any {
        const camera = this.game.camera;
        let closestAnimal: any = null;
        let closestDist = 50; // Max click distance in pixels

        for (const animal of this.game.animals) {
            // Get animal's world position (with sub-tile precision)
            const worldPos = animal.getWorldPos();
            const animalScreen = camera.tileToScreen(worldPos.x, worldPos.y);

            // Convert screen click to world container coords
            const worldX = (screenX - camera.viewportWidth / 2) / camera.zoom + camera.x;
            const worldY = (screenY - camera.viewportHeight / 2) / camera.zoom + camera.y;

            // Calculate distance (animal sprites are centered horizontally, bottom-aligned)
            const dx = animalScreen.x - worldX;
            const dy = (animalScreen.y - 15) - worldY; // Offset for sprite height

            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < closestDist) {
                closestDist = dist;
                closestAnimal = animal;
            }
        }

        return closestAnimal;
    }

    /**
     * Find staff member near click position with larger hitbox
     */
    private findStaffNearClick(screenX: number, screenY: number): any {
        const camera = this.game.camera;
        let closestStaff: any = null;
        let closestDist = 50; // Max click distance in pixels

        for (const staff of this.game.staff) {
            // Get staff's world position (with sub-tile precision)
            const worldPos = staff.getWorldPos();
            const staffScreen = camera.tileToScreen(worldPos.x, worldPos.y);

            // Convert screen click to world container coords
            const worldX = (screenX - camera.viewportWidth / 2) / camera.zoom + camera.x;
            const worldY = (screenY - camera.viewportHeight / 2) / camera.zoom + camera.y;

            // Calculate distance (staff sprites are centered horizontally, bottom-aligned)
            const dx = staffScreen.x - worldX;
            const dy = (staffScreen.y - 15) - worldY; // Offset for sprite height

            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < closestDist) {
                closestDist = dist;
                closestStaff = staff;
            }
        }

        return closestStaff;
    }

    /**
     * Find guest near click position with larger hitbox
     */
    private findGuestNearClick(screenX: number, screenY: number): any {
        const camera = this.game.camera;
        let closestGuest: any = null;
        let closestDist = 50; // Max click distance in pixels

        for (const guest of this.game.guests) {
            // Skip guests that have left
            if (guest.state === 'left') continue;

            // Get guest's world position (with sub-tile precision)
            const worldPos = guest.getWorldPos();
            const guestScreen = camera.tileToScreen(worldPos.x, worldPos.y);

            // Convert screen click to world container coords
            const worldX = (screenX - camera.viewportWidth / 2) / camera.zoom + camera.x;
            const worldY = (screenY - camera.viewportHeight / 2) / camera.zoom + camera.y;

            // Calculate distance (guest sprites are centered horizontally, bottom-aligned)
            const dx = guestScreen.x - worldX;
            const dy = (guestScreen.y - 15) - worldY; // Offset for sprite height

            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < closestDist) {
                closestDist = dist;
                closestGuest = guest;
            }
        }

        return closestGuest;
    }

    /**
     * Handle mouse down
     */
    private onMouseDown(e: MouseEvent): void {
        this.isMouseDown = true;
        this.mouseButton = e.button;
        this._lastMouseX = e.offsetX;
        this._lastMouseY = e.offsetY;

        if (e.button === 1 || e.button === 2) {
            // Middle or right click: start panning
            this.game.camera.startPan(e.offsetX, e.offsetY);
        } else if (e.button === 0) {
            // Left click: tool action or start drag
            this._dragStartTile = this.hoveredTile;
            this.handleClick();
        }
    }

    /**
     * Handle mouse move
     */
    private onMouseMove(e: MouseEvent): void {
        this.hoveredScreenPos = { x: e.offsetX, y: e.offsetY };
        this.hoveredTile = this.game.camera.getTileAt(e.offsetX, e.offsetY);

        // Track hovered edge for fence tool, gate relocation mode, or demolish tool
        if (this.game.currentTool === 'fence' || this.game.currentTool === 'demolish' || this.isGateRelocateMode) {
            this.hoveredEdge = this.game.camera.getTileEdgeAt(e.offsetX, e.offsetY);
        } else {
            this.hoveredEdge = null;
        }

        if (this.isMouseDown) {
            if (this.mouseButton === 1 || this.mouseButton === 2) {
                // Panning
                this.game.camera.updatePan(e.offsetX, e.offsetY);
            } else if (this.mouseButton === 0) {
                // Dragging (for terrain painting, fence drawing, etc.)
                this.isDragging = true;
                this.handleDrag();
            }
        }
    }

    /**
     * Handle mouse up
     */
    private onMouseUp(e: MouseEvent): void {
        if (this.mouseButton === 1 || this.mouseButton === 2) {
            this.game.camera.endPan();
        }

        // Handle fence drag end
        if (this.isFenceDragging && this.fenceDragStart && this.hoveredEdge) {
            this.placeFenceLShape(this.fenceDragStart, this.hoveredEdge);
        }

        // Handle path drag end
        if (this.isPathDragging && this.pathDragStart && this.hoveredTile) {
            this.placePathLShape(this.pathDragStart, this.hoveredTile);
        }

        // Handle demolish drag end
        if (this.isDemolishDragging && this.demolishDragStart && this.hoveredTile) {
            this.executeDemolishRectangle(this.demolishDragStart, this.hoveredTile);
        }

        if (this.isDragging) {
            this.handleDragEnd();
        }

        this.isMouseDown = false;
        this.isDragging = false;
        this._dragStartTile = null;
        this.isFenceDragging = false;
        this.fenceDragStart = null;
        this.isPathDragging = false;
        this.pathDragStart = null;
        this.isDemolishDragging = false;
        this.demolishDragStart = null;
    }

    /**
     * Handle mouse leave
     */
    private onMouseLeave(): void {
        this.hoveredTile = null;
        this.hoveredScreenPos = null;
        this.hoveredEdge = null;
    }

    /**
     * Handle mouse wheel (zoom)
     */
    private onWheel(e: WheelEvent): void {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        this.game.camera.zoomAt(e.offsetX, e.offsetY, delta);
    }

    /**
     * Get canvas-relative coordinates from a touch
     */
    private getTouchCanvasPos(touch: Touch): { x: number; y: number } {
        const rect = this.game.app.canvas.getBoundingClientRect();
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top,
        };
    }

    /**
     * Handle touch start
     */
    private onTouchStart(e: TouchEvent): void {
        e.preventDefault();

        if (e.touches.length === 1) {
            const pos = this.getTouchCanvasPos(e.touches[0]);
            this.touchStartPos = pos;
            this.touchStartTime = Date.now();
            this.hoveredScreenPos = pos;
            this.hoveredTile = this.game.camera.getTileAt(pos.x, pos.y);
            this.hoveredEdge = this.game.camera.getTileEdgeAt(pos.x, pos.y);

            if (this.touchMode) {
                const tool = this.game.currentTool;
                const isPlacementTool = ['terrain', 'path', 'fence', 'animal', 'staff', 'foliage', 'shelter', 'building'].includes(tool);
                const hasItem = !!this.game.currentItem;

                // For fence/path with start point set, single finger selects end point (no pan)
                if (tool === 'fence' && this.touchFenceStart && !this.touchPlacementReady) {
                    // Don't pan - we're selecting second fence point
                    this.isTouchPanning = false;
                    // Immediately start tracking as fence drag
                    this.fenceDragStart = this.touchFenceStart;
                    this.isFenceDragging = true;
                } else if (tool === 'path' && this.touchPathStart && !this.touchPlacementReady) {
                    // Don't pan - we're selecting second path point
                    this.isTouchPanning = false;
                    // Immediately start tracking as path drag
                    this.pathDragStart = this.touchPathStart;
                    this.isPathDragging = true;
                } else if (tool === 'select' || !isPlacementTool || !hasItem || this.touchPlacementReady) {
                    // Select tool OR no placement tool OR no item - single finger pans
                    this.game.camera.startPan(pos.x, pos.y);
                    this.isTouchPanning = false; // Will be set to true if we actually move
                } else {
                    // Placement tool with item selected - don't pan, let user drag to position
                    this.isTouchPanning = false;
                }
            } else {
                // In non-touch mode, single tap performs action immediately
                this.handleClick();
            }
        } else if (e.touches.length === 2) {
            // Two-finger: pinch zoom and/or pan - mark as two-finger gesture
            this.wasTwoFingerGesture = true;

            const pos1 = this.getTouchCanvasPos(e.touches[0]);
            const pos2 = this.getTouchCanvasPos(e.touches[1]);
            const cx = (pos1.x + pos2.x) / 2;
            const cy = (pos1.y + pos2.y) / 2;

            this.initialPinchDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
            this.initialZoom = this.game.camera.zoom;
            this.game.camera.startPan(cx, cy);
            this.isTouchPanning = true;
        }
    }

    /**
     * Handle touch move
     */
    private onTouchMove(e: TouchEvent): void {
        e.preventDefault();

        if (e.touches.length === 1) {
            const pos = this.getTouchCanvasPos(e.touches[0]);
            this.hoveredScreenPos = pos;
            this.hoveredTile = this.game.camera.getTileAt(pos.x, pos.y);
            this.hoveredEdge = this.game.camera.getTileEdgeAt(pos.x, pos.y);

            if (this.touchMode && this.touchStartPos) {
                const tool = this.game.currentTool;
                const dx = pos.x - this.touchStartPos.x;
                const dy = pos.y - this.touchStartPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const isPlacementTool = ['terrain', 'path', 'fence', 'animal', 'staff', 'foliage', 'shelter', 'building'].includes(tool);
                const hasItem = !!this.game.currentItem;

                // For fence/path with start point, update end point as we move
                if (tool === 'fence' && this.touchFenceStart && !this.touchPlacementReady) {
                    // Always update end point when dragging for fence
                    this.touchFenceEnd = this.hoveredEdge;
                } else if (tool === 'path' && this.touchPathStart && !this.touchPlacementReady) {
                    // Always update end point when dragging for path
                    this.touchPathEnd = this.hoveredTile;
                } else if (tool === 'select' || !isPlacementTool || !hasItem || this.touchPlacementReady) {
                    // Select tool OR no placement tool OR no item - normal panning
                    if (distance > 10) {
                        this.isTouchPanning = true;
                        this.game.camera.updatePan(pos.x, pos.y);
                    }
                } else {
                    // Placement tool with item - don't pan, just update hovered position for preview
                    // (hoveredTile already updated above)
                }
            }
        } else if (e.touches.length === 2) {
            const pos1 = this.getTouchCanvasPos(e.touches[0]);
            const pos2 = this.getTouchCanvasPos(e.touches[1]);
            const cx = (pos1.x + pos2.x) / 2;
            const cy = (pos1.y + pos2.y) / 2;

            // Handle pan
            this.game.camera.updatePan(cx, cy);

            // Handle pinch zoom
            const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
            if (this.initialPinchDistance > 0) {
                const scale = currentDistance / this.initialPinchDistance;
                const newZoom = Math.min(3, Math.max(0.5, this.initialZoom * scale));
                this.game.camera.setZoom(newZoom);
            }
        }
    }

    /**
     * Handle touch end
     */
    private onTouchEnd(e: TouchEvent): void {
        if (e.touches.length === 0) {
            this.game.camera.endPan();

            // Skip placement logic if this was a two-finger gesture (zoom/pan only)
            const skipPlacement = this.wasTwoFingerGesture;
            this.wasTwoFingerGesture = false;

            // In touch mode, handle touch end based on current state
            if (this.touchMode && this.touchStartPos && !skipPlacement) {
                const tapDuration = Date.now() - this.touchStartTime;
                const tool = this.game.currentTool;

                // Handle fence tool two-step placement
                if (tool === 'fence' && this.game.currentItem) {
                    // If placement is ready, ignore all touches (only confirm/cancel buttons work)
                    if (this.touchPlacementReady) {
                        // Do nothing - locked until confirm or cancel
                    } else if (!this.touchFenceStart) {
                        // First touch release: set start point wherever finger is
                        if (this.hoveredEdge) {
                            this.touchFenceStart = { ...this.hoveredEdge };
                            this.showTouchConfirmBar('Tap or drag to end point');
                        }
                    } else {
                        // Second touch release: set end point and lock for confirmation
                        if (this.hoveredEdge) {
                            this.touchFenceEnd = { ...this.hoveredEdge };
                            this.touchPlacementReady = true;
                            this.showTouchConfirmBar('Confirm fence placement?');
                        }
                    }
                }
                // Handle path tool two-step placement
                else if (tool === 'path' && this.game.currentItem) {
                    // If placement is ready, ignore all touches (only confirm/cancel buttons work)
                    if (this.touchPlacementReady) {
                        // Do nothing - locked until confirm or cancel
                    } else if (!this.touchPathStart) {
                        // First touch release: set start point wherever finger is
                        if (this.hoveredTile) {
                            this.touchPathStart = { ...this.hoveredTile };
                            this.showTouchConfirmBar('Tap or drag to end point');
                        }
                    } else {
                        // Second touch release: set end point and lock for confirmation
                        if (this.hoveredTile) {
                            this.touchPathEnd = { ...this.hoveredTile };
                            this.touchPlacementReady = true;
                            this.showTouchConfirmBar('Confirm path placement?');
                        }
                    }
                }
                // Handle other placement tools - place on release (no two-step needed with drag-to-position)
                else {
                    const isPlacementTool = ['terrain', 'animal', 'staff', 'foliage', 'shelter', 'building'].includes(tool);

                    if (isPlacementTool && this.game.currentItem && this.hoveredTile) {
                        // Place immediately on release
                        this.handleClick();
                    } else if (!this.isTouchPanning && tapDuration < 300) {
                        // For select tool or quick taps - handle click
                        this.handleClick();
                    }
                }
            }

            // Reset touch state (but keep fence/path start/end for pending placement)
            this.touchStartPos = null;
            this.isTouchPanning = false;
            this.initialPinchDistance = 0;

            // Clear drag preview states (these are only for live dragging)
            this.fenceDragStart = null;
            this.isFenceDragging = false;
            this.pathDragStart = null;
            this.isPathDragging = false;

            // Don't clear hoveredTile/Edge in touch mode if we have pending placement
            const hasPendingPlacement = this.selectedTile || this.touchFenceStart || this.touchPathStart;
            if (!this.touchMode || !hasPendingPlacement) {
                this.hoveredTile = null;
                this.hoveredScreenPos = null;
                this.hoveredEdge = null;
            }
        } else if (e.touches.length === 1) {
            // Went from 2 fingers to 1, reset pinch
            this.initialPinchDistance = 0;
            const pos = this.getTouchCanvasPos(e.touches[0]);
            this.game.camera.startPan(pos.x, pos.y);
        }
    }

    /**
     * Show the touch confirm bar with a message
     */
    private showTouchConfirmBar(message: string): void {
        const confirmBar = document.getElementById('touch-confirm-bar');
        const confirmText = document.getElementById('touch-confirm-text');
        if (confirmBar) {
            confirmBar.classList.remove('hidden');
        }
        if (confirmText) {
            confirmText.textContent = message;
        }
    }

    /**
     * Handle keyboard input
     */
    private onKeyDown(e: KeyboardEvent): void {
        // Don't handle if typing in an input
        if (e.target instanceof HTMLInputElement) return;

        // Ctrl+Z for undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            this.undo();
            return;
        }

        switch (e.key) {
            case 'Escape':
                if (this.isGateRelocateMode) {
                    this.exitGateRelocateMode();
                } else {
                    this.selectTool('select');
                }
                break;
            case ' ':
                e.preventDefault();
                this.game.cycleSpeed();
                break;
            case '[':
                this.decreaseBrushSize();
                break;
            case ']':
                this.increaseBrushSize();
                break;
            case 'r':
            case 'R':
                this.rotatePlacement();
                break;
            case '1':
                this.selectTool('select');
                break;
            case '2':
                this.selectTool('terrain');
                break;
            case '3':
                this.selectTool('path');
                break;
            case '4':
                this.selectTool('fence');
                break;
            case '5':
                this.selectTool('animal');
                break;
        }
    }

    /**
     * Handle single click action
     */
    private handleClick(): void {
        if (!this.hoveredTile) return;

        const { x, y } = this.hoveredTile;
        const tool = this.game.currentTool;
        const item = this.game.currentItem;

        // Handle gate relocation mode
        if (this.isGateRelocateMode && this.hoveredEdge) {
            this.relocateGate(this.hoveredEdge.tileX, this.hoveredEdge.tileY, this.hoveredEdge.edge);
            return;
        }

        // Handle select tool - check for entity clicks
        if (tool === 'select') {
            // Check for staff near the click position (larger hitbox)
            const clickedStaff = this.findStaffNearClick(
                this.hoveredScreenPos?.x || 0,
                this.hoveredScreenPos?.y || 0
            );
            if (clickedStaff) {
                this.showSelectedStaffPanel(clickedStaff);
                return;
            }

            // Check for animals near the click position (larger hitbox)
            const clickedAnimal = this.findAnimalNearClick(
                this.hoveredScreenPos?.x || 0,
                this.hoveredScreenPos?.y || 0
            );
            if (clickedAnimal) {
                this.hideSelectedStaffPanel();
                this.hideSelectedShelterPanel();
                this.hideSelectedGuestPanel();
                this.showSelectedAnimalPanel(clickedAnimal);
                return;
            }

            // Check for guests near the click position (only if visible)
            if (this.game.showGuests) {
                const clickedGuest = this.findGuestNearClick(
                    this.hoveredScreenPos?.x || 0,
                    this.hoveredScreenPos?.y || 0
                );
                if (clickedGuest) {
                    this.hideSelectedStaffPanel();
                    this.hideSelectedShelterPanel();
                    this.hideSelectedAnimalPanel();
                    this.showSelectedGuestPanel(clickedGuest);
                    return;
                }
            }

            // Check for shelter clicks (only if buildings visible)
            if (this.game.showBuildings) {
                const clickedShelter = this.game.getShelterAtTile(x, y);
                if (clickedShelter) {
                    this.hideSelectedStaffPanel();
                    this.hideSelectedAnimalPanel();
                    this.hideSelectedGuestPanel();
                    this.showSelectedShelterPanel(clickedShelter);
                    return;
                }
            }

            // Check for gate clicks
            // First try the exact edge clicked
            const edge = this.game.camera.getTileEdgeAt(
                this.hoveredScreenPos?.x || 0,
                this.hoveredScreenPos?.y || 0
            );

            if (edge) {
                const exhibit = this.game.getExhibitByGate(edge.tileX, edge.tileY, edge.edge);
                if (exhibit) {
                    this.showExhibitPanel(exhibit);
                    return;
                }
            }

            // If no exact edge match, check all edges of the clicked tile for gates
            // This makes gates easier to click
            const edges: Array<'north' | 'south' | 'east' | 'west'> = ['north', 'south', 'east', 'west'];
            for (const edgeName of edges) {
                const exhibit = this.game.getExhibitByGate(x, y, edgeName);
                if (exhibit) {
                    this.showExhibitPanel(exhibit);
                    return;
                }
            }

            // Check for entrance gate click
            if (this.isNearEntranceGate(x, y)) {
                this.showEntrancePanel();
                return;
            }

            // Clicking elsewhere with select tool hides panels
            this.hideEntrancePanel();
        }

        switch (tool) {
            case 'terrain':
                if (item) {
                    this.placeTerrain(x, y, item);
                }
                break;
            case 'path':
                // Start path drag
                if (item && this.hoveredTile) {
                    this.pathDragStart = { ...this.hoveredTile };
                    this.isPathDragging = true;
                }
                break;
            case 'demolish':
                // Start demolish drag
                if (this.hoveredTile) {
                    this.demolishDragStart = { ...this.hoveredTile };
                    this.isDemolishDragging = true;
                }
                break;
            case 'fence':
                // Start fence drag
                if (item && this.hoveredEdge) {
                    this.fenceDragStart = { ...this.hoveredEdge };
                    this.isFenceDragging = true;
                }
                break;
            case 'animal':
                if (item) {
                    this.placeAnimal(x, y, item);
                }
                break;
            case 'staff':
                if (item) {
                    this.placeStaff(x, y, item);
                }
                break;
            case 'foliage':
                if (item) {
                    this.placeFoliage(x, y, item);
                }
                break;
            case 'shelter':
                if (item) {
                    this.placeShelter(x, y, item);
                }
                break;
            case 'building':
                if (item) {
                    this.placeBuilding(x, y, item);
                }
                break;
        }
    }

    /**
     * Handle drag action (for painting terrain, etc.)
     */
    private handleDrag(): void {
        if (!this.hoveredTile) return;

        const tool = this.game.currentTool;
        const item = this.game.currentItem;

        // Only terrain uses continuous drag painting
        // Path uses L-shape drag (handled on mouse up)
        if (tool === 'terrain' && item) {
            this.placeTerrain(this.hoveredTile.x, this.hoveredTile.y, item);
        }
    }

    /**
     * Handle drag end
     */
    private handleDragEnd(): void {
        // TODO: Handle fence placement on drag end
    }

    /**
     * Rotate placeable by 90 degrees clockwise (R key)
     */
    private rotatePlacement(): void {
        this.rotatePlacementRight();
    }

    /**
     * Rotate placeable left (counter-clockwise)
     */
    private rotatePlacementLeft(): void {
        const placeableTools = ['shelter', 'amenity', 'commercial', 'building'];
        if (!placeableTools.includes(this.game.currentTool)) return;
        this.placementRotation = (this.placementRotation + 3) % 4; // +3 is same as -1 mod 4
        this.updateRotationUI();
    }

    /**
     * Rotate placeable right (clockwise)
     */
    private rotatePlacementRight(): void {
        const placeableTools = ['shelter', 'amenity', 'commercial', 'building'];
        if (!placeableTools.includes(this.game.currentTool)) return;
        this.placementRotation = (this.placementRotation + 1) % 4;
        this.updateRotationUI();
    }

    /**
     * Update the rotation UI display
     */
    private updateRotationUI(): void {
        const rotationLabels = ['0°', '90°', '180°', '270°'];
        const rotationValue = document.getElementById('rotation-value');
        if (rotationValue) {
            rotationValue.textContent = rotationLabels[this.placementRotation];
        }
    }

    /**
     * Increase brush size (odd numbers only)
     */
    private increaseBrushSize(): void {
        if (this.brushSize < this.maxBrushSize) {
            this.brushSize += 2;
            this.updateBrushSizeUI();
        }
    }

    /**
     * Decrease brush size (odd numbers only)
     */
    private decreaseBrushSize(): void {
        if (this.brushSize > this.minBrushSize) {
            this.brushSize -= 2;
            this.updateBrushSizeUI();
        }
    }

    /**
     * Update brush size UI display
     */
    private updateBrushSizeUI(): void {
        const display = document.getElementById('brush-size-value');
        if (display) {
            display.textContent = `${this.brushSize}x${this.brushSize}`;
        }

        // Update button states
        const decreaseBtn = document.getElementById('brush-size-decrease');
        const increaseBtn = document.getElementById('brush-size-increase');
        if (decreaseBtn) {
            (decreaseBtn as HTMLButtonElement).disabled = this.brushSize <= this.minBrushSize;
        }
        if (increaseBtn) {
            (increaseBtn as HTMLButtonElement).disabled = this.brushSize >= this.maxBrushSize;
        }
    }

    /**
     * Place terrain at position
     */
    private placeTerrain(centerX: number, centerY: number, terrainType: string): void {
        const costs: Record<string, number> = {
            grass: 10, dirt: 5, sand: 15, water: 50, savanna: 20, prairie: 18
        };

        const costPerTile = costs[terrainType] || 10;
        const radius = Math.floor(this.brushSize / 2);

        const placedTiles: Array<{ x: number; y: number; previousTerrain: string }> = [];
        let totalCost = 0;

        // Paint tiles in a square around the center
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = centerX + dx;
                const y = centerY + dy;

                const tile = this.game.world.getTile(x, y);
                if (!tile) continue;

                const previousTerrain = tile.terrain || 'grass';

                // Skip if same terrain
                if (previousTerrain === terrainType) continue;

                // For water, check if tile is occupied
                if (terrainType === 'water' && this.isTileOccupied(x, y)) {
                    continue;
                }

                if (this.game.spendMoney(costPerTile)) {
                    this.game.world.setTerrain(x, y, terrainType as any);
                    placedTiles.push({ x, y, previousTerrain });
                    totalCost += costPerTile;
                }
            }
        }

        // Record undo action for all placed tiles
        if (placedTiles.length > 0) {
            this.addUndoAction({
                type: 'terrain',
                data: { tiles: placedTiles, terrainType, totalCost }
            });
            // Pathfinding world needs update
            this.game.pathfinding.updateWorld(this.game.world);
        }
    }

    /**
     * Check if a tile is occupied (has entities/structures that block water placement)
     */
    private isTileOccupied(x: number, y: number): boolean {
        const tile = this.game.world.getTile(x, y);
        if (!tile) return true;

        // Check for path
        if (tile.path) return true;

        // Check for land foliage
        const foliage = this.game.getFoliageAtTile(x, y);
        if (foliage.length > 0) return true;

        // Check for buildings/shelters
        if (this.game.getPlaceableAtTile(x, y)) return true;

        // Check for animals
        const hasAnimal = this.game.animals.some(a => a.tileX === x && a.tileY === y);
        if (hasAnimal) return true;

        // Check for guests
        const hasGuest = this.game.guests.some(g => g.tileX === x && g.tileY === y);
        if (hasGuest) return true;

        // Check for staff
        const hasStaff = this.game.staff.some(s => s.tileX === x && s.tileY === y);
        if (hasStaff) return true;

        return false;
    }

    /**
     * Place path at position
     */
    private placePath(x: number, y: number, pathType: string): void {
        const costs: Record<string, number> = {
            dirt: 15, stone: 25, brick: 35, cobble: 30
        };

        const cost = costs[pathType] || 15;
        const tile = this.game.world.getTile(x, y);
        if (!tile) return;

        // Can't place paths on water
        if (tile.terrain === 'water') return;

        const previousPath = tile.path || null;

        // Don't place if it's the same path
        if (previousPath === pathType) return;

        if (this.game.spendMoney(cost)) {
            this.game.world.setPath(x, y, pathType as any);
            this.addUndoAction({
                type: 'path',
                data: { x, y, pathType, previousPath, cost }
            });
            this.game.pathfinding.updateWorld(this.game.world);
        }
    }

    /**
     * Demolish at position
     */
    private demolish(x: number, y: number): void {
        const tile = this.game.world.getTile(x, y);
        if (!tile) return;

        // Check if we're clicking on a fence edge
        if (this.hoveredEdge) {
            const edge = this.hoveredEdge.edge;
            const fenceType = tile.fences[edge as keyof typeof tile.fences];

            if (fenceType) {
                // There's a fence here - check impact
                const impact = this.game.checkFenceRemovalImpact(x, y, edge);

                if (impact.type === 'none') {
                    // No exhibit impact, just delete the fence
                    this.deleteFence(x, y, edge);
                } else if (impact.type === 'delete') {
                    // Would delete an exhibit - show confirmation
                    this.showFenceDeleteModal(
                        'Delete Exhibit?',
                        `Do you really want to delete "${impact.exhibits[0].name}"?`,
                        () => {
                            this.deleteFence(x, y, edge);
                            this.game.deleteExhibitWithGateConversion(impact.exhibits[0]);
                        }
                    );
                } else if (impact.type === 'merge') {
                    // Would merge two exhibits - show confirmation
                    const [exhibit1, exhibit2] = impact.exhibits;
                    this.showFenceDeleteModal(
                        'Merge Exhibits?',
                        `Do you really want to merge "${exhibit1.name}" and "${exhibit2.name}"?`,
                        () => {
                            this.deleteFence(x, y, edge);
                            this.game.mergeExhibits(exhibit1, exhibit2, { tileX: x, tileY: y, edge });
                        }
                    );
                }
                return;
            }
        }

        // Remove path
        if (tile.path) {
            this.game.world.setPath(x, y, null);
            this.game.addMoney(10);
            this.game.pathfinding.updateWorld(this.game.world);
            return;
        }

        // Remove foliage at this tile
        const foliageAtTile = this.game.getFoliageAtTile(x, y);
        if (foliageAtTile.length > 0) {
            // Remove the first foliage item (can click multiple times to remove all)
            this.game.removeFoliage(foliageAtTile[0]);
            this.game.addMoney(5);
            return;
        }

        // Remove building/shelter at this tile
        const placeable = this.game.getPlaceableAtTile(x, y);
        if (placeable) {
            // Get refund (half of cost)
            const refund = Math.floor(placeable.config.cost / 2);
            if (placeable.placeableType.includes('_small') || placeable.placeableType.includes('_regular') || placeable.placeableType.includes('_large')) {
                // It's a shelter
                this.game.removeShelter(placeable as any);
            } else {
                // It's a building
                this.game.removeBuilding(placeable as any);
            }
            this.game.addMoney(refund);
        }
    }

    /**
     * Delete a fence edge
     */
    private deleteFence(tileX: number, tileY: number, edge: EdgeDirection): void {
        this.game.world.setFence(tileX, tileY, edge, null);
        this.game.removeFenceCondition(tileX, tileY, edge);
        this.game.pathfinding.updateWorld(this.game.world);
        // Refund some money for the fence
        this.game.addMoney(25);
    }

    /**
     * Show fence delete confirmation modal
     */
    private showFenceDeleteModal(title: string, message: string, onConfirm: () => void): void {
        const modal = document.getElementById('fence-delete-modal');
        const titleEl = document.getElementById('fence-delete-title');
        const messageEl = document.getElementById('fence-delete-message');
        const confirmBtn = document.getElementById('fence-delete-confirm-btn');
        const cancelBtn = document.getElementById('fence-delete-cancel-btn');
        const backdrop = modal?.querySelector('.modal-backdrop');

        if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) return;

        // Update content
        titleEl.textContent = title;
        messageEl.textContent = message;

        // Update confirm button text based on action
        confirmBtn.textContent = title.includes('Merge') ? 'Merge' : 'Delete';

        // Show modal
        modal.classList.remove('hidden');

        // Handle confirm
        const handleConfirm = () => {
            onConfirm();
            this.hideFenceDeleteModal();
            cleanup();
        };

        // Handle cancel
        const handleCancel = () => {
            this.hideFenceDeleteModal();
            cleanup();
        };

        // Handle escape key
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleCancel();
            } else if (e.key === 'Enter') {
                handleConfirm();
            }
        };

        // Cleanup event listeners
        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            backdrop?.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleKeydown);
        };

        // Add event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        backdrop?.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleKeydown);
    }

    /**
     * Hide fence delete confirmation modal
     */
    private hideFenceDeleteModal(): void {
        const modal = document.getElementById('fence-delete-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Execute demolish for a rectangle selection
     */
    private executeDemolishRectangle(start: GridPos, end: GridPos): void {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        // Single tile click - use regular demolish with edge detection
        if (minX === maxX && minY === maxY) {
            this.demolish(start.x, start.y);
            return;
        }

        // Rectangle selection - demolish paths, terrain, and internal fences
        let deletedPaths = 0;
        let deletedTerrain = 0;
        let deletedFences = 0;
        const affectedExhibits = new Set<any>();

        // First pass: collect what will be deleted and check for exhibit impacts
        const fencesToDelete: Array<{ x: number; y: number; edge: EdgeDirection }> = [];

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const tile = this.game.world.getTile(x, y);
                if (!tile) continue;

                // Check fences - only delete fences where both sides are in the rectangle
                for (const edge of ['north', 'south', 'east', 'west'] as EdgeDirection[]) {
                    const fenceType = tile.fences[edge as keyof typeof tile.fences];
                    if (!fenceType) continue;

                    // Get the adjacent tile for this edge
                    let adjX = x, adjY = y;
                    if (edge === 'north') adjY = y - 1;
                    else if (edge === 'south') adjY = y + 1;
                    else if (edge === 'east') adjX = x + 1;
                    else if (edge === 'west') adjX = x - 1;

                    // Only delete if adjacent tile is also in rectangle (internal fence)
                    const isInternal = adjX >= minX && adjX <= maxX && adjY >= minY && adjY <= maxY;
                    if (isInternal) {
                        // Check for exhibit impact
                        const impact = this.game.checkFenceRemovalImpact(x, y, edge);
                        if (impact.type !== 'none') {
                            impact.exhibits.forEach(e => affectedExhibits.add(e));
                        } else {
                            fencesToDelete.push({ x, y, edge });
                        }
                    }
                }
            }
        }

        // If any exhibits would be affected, show confirmation
        if (affectedExhibits.size > 0) {
            const exhibitNames = Array.from(affectedExhibits).map((e: any) => e.name).join(', ');
            this.showFenceDeleteModal(
                'Delete Exhibits?',
                `This will affect exhibits: ${exhibitNames}. Continue?`,
                () => {
                    // Delete everything including exhibit fences
                    this.performRectangleDemolish(minX, maxX, minY, maxY, true);
                }
            );
            return;
        }

        // No exhibit impact - proceed with deletion
        this.performRectangleDemolish(minX, maxX, minY, maxY, false);
    }

    /**
     * Actually perform the rectangle demolish
     */
    private performRectangleDemolish(minX: number, maxX: number, minY: number, maxY: number, includeExhibitFences: boolean): void {
        let totalRefund = 0;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const tile = this.game.world.getTile(x, y);
                if (!tile) continue;

                // Delete internal fences
                for (const edge of ['north', 'south', 'east', 'west'] as EdgeDirection[]) {
                    const fenceType = tile.fences[edge as keyof typeof tile.fences];
                    if (!fenceType) continue;

                    // Get the adjacent tile for this edge
                    let adjX = x, adjY = y;
                    if (edge === 'north') adjY = y - 1;
                    else if (edge === 'south') adjY = y + 1;
                    else if (edge === 'east') adjX = x + 1;
                    else if (edge === 'west') adjX = x - 1;

                    // Only delete if adjacent tile is also in rectangle
                    const isInternal = adjX >= minX && adjX <= maxX && adjY >= minY && adjY <= maxY;
                    if (isInternal) {
                        const impact = this.game.checkFenceRemovalImpact(x, y, edge);
                        if (impact.type === 'none' || includeExhibitFences) {
                            // Delete exhibits if needed
                            if (includeExhibitFences && impact.type === 'delete') {
                                this.game.deleteExhibitWithGateConversion(impact.exhibits[0]);
                            } else if (includeExhibitFences && impact.type === 'merge') {
                                this.game.mergeExhibits(impact.exhibits[0], impact.exhibits[1], { tileX: x, tileY: y, edge });
                            }
                            this.game.world.setFence(x, y, edge, null);
                            this.game.removeFenceCondition(x, y, edge);
                            totalRefund += 25;
                        }
                    }
                }

                // Delete path
                if (tile.path) {
                    this.game.world.setPath(x, y, null);
                    totalRefund += 10;
                }

                // Delete foliage at this tile
                const foliageAtTile = this.game.getFoliageAtTile(x, y);
                for (const foliage of foliageAtTile) {
                    this.game.removeFoliage(foliage);
                    totalRefund += 5;
                }

                // Delete building/shelter at this tile (only delete once per placeable)
                const placeable = this.game.getPlaceableAtTile(x, y);
                if (placeable && placeable.tileX === x && placeable.tileY === y) {
                    // Only delete if this is the origin tile to avoid double-deletion
                    const refund = Math.floor(placeable.config.cost / 2);
                    if (placeable.placeableType.includes('_small') || placeable.placeableType.includes('_regular') || placeable.placeableType.includes('_large')) {
                        this.game.removeShelter(placeable as any);
                    } else {
                        this.game.removeBuilding(placeable as any);
                    }
                    totalRefund += refund;
                }
            }
        }

        if (totalRefund > 0) {
            this.game.addMoney(totalRefund);
        }
        this.game.pathfinding.updateWorld(this.game.world);
    }

    /**
     * Get tiles in demolish rectangle for preview
     */
    public getDemolishRectangle(): { minX: number; maxX: number; minY: number; maxY: number } | null {
        if (!this.isDemolishDragging || !this.demolishDragStart || !this.hoveredTile) {
            return null;
        }
        return {
            minX: Math.min(this.demolishDragStart.x, this.hoveredTile.x),
            maxX: Math.max(this.demolishDragStart.x, this.hoveredTile.x),
            minY: Math.min(this.demolishDragStart.y, this.hoveredTile.y),
            maxY: Math.max(this.demolishDragStart.y, this.hoveredTile.y),
        };
    }

    /**
     * Calculate the L-shape path of edges between two edge positions
     * The clicked edge determines the first leg's direction
     *
     * Visual connectivity in isometric view:
     * - North/South edges connect along Y axis (same X, varying Y)
     * - East/West edges connect along X axis (same Y, varying X)
     */
    public calculateLShapeEdges(start: TileEdge, end: TileEdge): TileEdge[] {
        const edges: TileEdge[] = [];

        const startX = start.tileX;
        const startY = start.tileY;
        const startEdge = start.edge;
        const endX = end.tileX;
        const endY = end.tileY;

        console.log(`L-shape: start=(${startX},${startY},${startEdge}) end=(${endX},${endY},${end.edge})`);

        // Same tile = just the clicked edge
        if (startX === endX && startY === endY) {
            console.log('Same tile, placing single edge');
            return [{ tileX: startX, tileY: startY, edge: startEdge }];
        }

        // Determine which axis to traverse first based on clicked edge
        // North/South edges connect along Y, so clicking them starts a Y-axis leg
        // East/West edges connect along X, so clicking them starts an X-axis leg
        const firstLegAlongY = (startEdge === 'north' || startEdge === 'south');

        if (firstLegAlongY) {
            // First leg: along Y axis (same X, varying Y)
            // Use north/south edges (they connect visually along Y)
            const minY = Math.min(startY, endY);
            const maxY = Math.max(startY, endY);

            for (let y = minY; y <= maxY; y++) {
                edges.push({ tileX: startX, tileY: y, edge: startEdge });
            }

            // Second leg: along X axis (same Y, varying X) if needed
            if (startX !== endX) {
                const minX = Math.min(startX, endX);
                const maxX = Math.max(startX, endX);

                // Determine turn direction for consistent fence side
                const firstLegPositive = endY > startY;
                const secondLegPositive = endX > startX;
                const turnLeft = firstLegPositive === secondLegPositive;

                // Choose edge to keep fence on same side of the L-path
                let secondEdge: EdgeDirection;
                if (startEdge === 'north') {
                    secondEdge = turnLeft ? 'west' : 'east';
                } else {
                    secondEdge = turnLeft ? 'east' : 'west';
                }

                for (let x = minX; x <= maxX; x++) {
                    if (x === startX) continue; // Skip corner (already has first leg edge)
                    edges.push({ tileX: x, tileY: endY, edge: secondEdge });
                }
                // Add corner's perpendicular edge for L connection
                edges.push({ tileX: startX, tileY: endY, edge: secondEdge });
            }
        } else {
            // First leg: along X axis (same Y, varying X)
            // Use east/west edges (they connect visually along X)
            const minX = Math.min(startX, endX);
            const maxX = Math.max(startX, endX);

            for (let x = minX; x <= maxX; x++) {
                edges.push({ tileX: x, tileY: startY, edge: startEdge });
            }

            // Second leg: along Y axis (same X, varying Y) if needed
            if (startY !== endY) {
                const minY = Math.min(startY, endY);
                const maxY = Math.max(startY, endY);

                // Determine turn direction
                const firstLegPositive = endX > startX;
                const secondLegPositive = endY > startY;
                const turnLeft = firstLegPositive !== secondLegPositive;

                // Choose edge to keep fence on same side of the L-path
                let secondEdge: EdgeDirection;
                if (startEdge === 'east') {
                    secondEdge = turnLeft ? 'north' : 'south';
                } else {
                    secondEdge = turnLeft ? 'south' : 'north';
                }

                for (let y = minY; y <= maxY; y++) {
                    if (y === startY) continue; // Skip corner
                    edges.push({ tileX: endX, tileY: y, edge: secondEdge });
                }
                // Add corner's perpendicular edge for L connection
                edges.push({ tileX: endX, tileY: startY, edge: secondEdge });
            }
        }

        console.log('Edges to place:', edges.map(e => `(${e.tileX},${e.tileY},${e.edge})`).join(', '));
        return edges;
    }

    /**
     * Place fences in an L-shape from start to end edge
     */
    private placeFenceLShape(start: TileEdge, end: TileEdge): void {
        const fenceType = this.game.currentItem;
        if (!fenceType) return;

        const costs: Record<string, number> = {
            wood: 20, iron: 40, concrete: 60
        };
        const cost = costs[fenceType] || 20;

        const edges = this.calculateLShapeEdges(start, end);
        const placedEdges: TileEdge[] = [];
        let totalCost = 0;

        for (const edge of edges) {
            // Skip if fence already exists
            const existingFence = this.game.world.getFence(edge.tileX, edge.tileY, edge.edge);
            if (existingFence) continue;

            if (this.game.spendMoney(cost)) {
                this.game.world.setFence(edge.tileX, edge.tileY, edge.edge, fenceType as FenceType);
                this.game.initializeFenceCondition(edge.tileX, edge.tileY, edge.edge);
                placedEdges.push(edge);
                totalCost += cost;
            }
        }

        // Record undo action for all placed fences
        if (placedEdges.length > 0) {
            this.addUndoAction({
                type: 'fence',
                data: { edges: placedEdges, fenceType, totalCost }
            });

            // The last placed edge should become the gate
            const lastEdge = placedEdges[placedEdges.length - 1];

            // Check for exhibit from each placed edge (any one could complete an enclosure)
            for (const edge of placedEdges) {
                const exhibit = this.game.checkForNewExhibit(edge.tileX, edge.tileY, edge.edge, lastEdge);
                if (exhibit) {
                    // Found an enclosure, stop checking
                    break;
                }
            }
        }

        this.game.pathfinding.updateWorld(this.game.world);
    }

    /**
     * Calculate the L-shape path of tiles between two positions
     * First leg: SW to NE orientation (along Y axis - same X, varying Y)
     * Second leg: NW to SE orientation (along X axis - same Y, varying X)
     */
    public calculateLShapeTiles(start: GridPos, end: GridPos): GridPos[] {
        const tiles: GridPos[] = [];

        const startX = start.x;
        const startY = start.y;
        const endX = end.x;
        const endY = end.y;

        // Same tile = just the one tile
        if (startX === endX && startY === endY) {
            return [{ x: startX, y: startY }];
        }

        // First leg: along Y axis (SW to NE orientation in isometric)
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);
        for (let y = minY; y <= maxY; y++) {
            tiles.push({ x: startX, y });
        }

        // Second leg: along X axis (NW to SE orientation) if needed
        if (startX !== endX) {
            const minX = Math.min(startX, endX);
            const maxX = Math.max(startX, endX);
            for (let x = minX; x <= maxX; x++) {
                if (x === startX) continue; // Skip corner (already added)
                tiles.push({ x, y: endY });
            }
        }

        return tiles;
    }

    /**
     * Place paths in an L-shape from start to end tile
     */
    private placePathLShape(start: GridPos, end: GridPos): void {
        const pathType = this.game.currentItem;
        if (!pathType) return;

        const costs: Record<string, number> = {
            dirt: 15, stone: 25, brick: 35, cobble: 30
        };
        const cost = costs[pathType] || 15;

        const tiles = this.calculateLShapeTiles(start, end);
        const placedTiles: Array<{ x: number; y: number; previousPath: string | null }> = [];
        let totalCost = 0;

        for (const tile of tiles) {
            const existingTile = this.game.world.getTile(tile.x, tile.y);
            if (!existingTile) continue;

            // Can't place paths on water
            if (existingTile.terrain === 'water') continue;

            const previousPath = existingTile.path || null;

            // Skip if same path already exists
            if (previousPath === pathType) continue;

            if (this.game.spendMoney(cost)) {
                this.game.world.setPath(tile.x, tile.y, pathType as PathType);
                placedTiles.push({ x: tile.x, y: tile.y, previousPath });
                totalCost += cost;
            }
        }

        // Record undo action for all placed paths
        if (placedTiles.length > 0) {
            this.addUndoAction({
                type: 'path',
                data: { tiles: placedTiles, pathType, totalCost }
            });
        }

        this.game.pathfinding.updateWorld(this.game.world);
    }

    /**
     * Place animal at position
     */
    private placeAnimal(x: number, y: number, species: string): void {
        const costs: Record<string, number> = {
            lion: 2500, bison: 1800
        };

        const cost = costs[species] || 500;
        const tile = this.game.world.getTile(x, y);

        // Can't place on water
        if (!tile || tile.terrain === 'water') return;

        if (this.game.spendMoney(cost)) {
            const animal = this.game.addAnimal(species as AnimalSpecies, x, y, this.selectedGender);
            if (animal) {
                console.log(`Placed ${this.selectedGender} ${species} at (${x}, ${y})`);
                this.addUndoAction({
                    type: 'animal',
                    data: { id: animal.id, species, x, y, cost, gender: this.selectedGender }
                });
            }
        }
    }

    /**
     * Place staff at position
     */
    private placeStaff(x: number, y: number, staffType: string): void {
        const costs: Record<string, number> = {
            zookeeper: 500,
            maintenance: 400,
        };

        const cost = costs[staffType] || 200;
        const tile = this.game.world.getTile(x, y);

        // Can't place on water
        if (!tile || tile.terrain === 'water') return;

        if (this.game.spendMoney(cost)) {
            const staff = this.game.addStaff(staffType, x, y);
            if (staff) {
                console.log(`Hired ${staffType} at (${x}, ${y})`);
                this.addUndoAction({
                    type: 'staff',
                    data: { id: staff.id, staffType, x, y, cost }
                });
            }
        }
    }

    /**
     * Place foliage at position
     */
    private placeFoliage(x: number, y: number, foliageType: string): void {
        const costs: Record<string, number> = {
            acacia: 150, tall_grass: 25, prairie_grass: 20, shrub: 75, wildflowers: 30
        };

        const cost = costs[foliageType] || 25;

        if (this.game.spendMoney(cost)) {
            const foliage = this.game.addFoliage(x, y, foliageType as FoliageType);
            if (foliage) {
                console.log(`Placed ${foliageType} at (${x}, ${y})`);
                this.addUndoAction({
                    type: 'foliage',
                    data: { id: foliage.id, x, y, foliageType, cost }
                });
            } else {
                // Refund if placement failed (wrong terrain)
                this.game.addMoney(cost);
            }
        }
    }

    /**
     * Place shelter at position
     * Item format: "shelterType_size" e.g., "concrete_small"
     */
    private placeShelter(x: number, y: number, item: string): void {
        const [shelterType, size] = item.split('_') as [string, ShelterSize];

        const costs: Record<string, number> = {
            'concrete_small': 500,
            'concrete_regular': 900,
            'concrete_large': 1400,
        };

        const cost = costs[item] || 500;

        if (this.game.spendMoney(cost)) {
            const shelter = this.game.addShelter(x, y, shelterType as any, size, this.placementRotation);
            if (shelter) {
                console.log(`Placed ${item} shelter at (${x}, ${y}) rotation: ${this.placementRotation * 90}°`);
                this.addUndoAction({
                    type: 'shelter',
                    data: { id: shelter.id, x, y, shelterType, size, rotation: this.placementRotation, cost }
                });
            } else {
                // Refund if placement failed
                this.game.addMoney(cost);
            }
        }
    }

    /**
     * Place building at position
     */
    private placeBuilding(x: number, y: number, item: string): void {
        const costs: Record<string, number> = {
            'burger_stand': 1500,
        };

        const cost = costs[item] || 1500;

        if (this.game.spendMoney(cost)) {
            const building = this.game.addBuilding(x, y, item, this.placementRotation);
            if (building) {
                console.log(`Placed ${item} at (${x}, ${y}) rotation: ${this.placementRotation * 90}°`);
                this.addUndoAction({
                    type: 'building',
                    data: { id: building.id, x, y, buildingType: item, rotation: this.placementRotation, cost }
                });
            } else {
                // Refund if placement failed
                this.game.addMoney(cost);
            }
        }
    }

    /**
     * Add an action to the undo history
     */
    private addUndoAction(action: UndoAction): void {
        this.undoHistory.push(action);

        // Limit history size
        if (this.undoHistory.length > this.maxUndoHistory) {
            this.undoHistory.shift();
        }

        this.updateUndoButton();
    }

    /**
     * Perform undo
     */
    private undo(): void {
        if (this.undoHistory.length === 0) return;

        const action = this.undoHistory.pop();
        if (!action) return;

        switch (action.type) {
            case 'terrain':
                // Handle both single tile and multi-tile terrain undo
                if (action.data.tiles) {
                    // Multi-tile undo (brush size > 1)
                    for (const tile of action.data.tiles) {
                        this.game.world.setTerrain(tile.x, tile.y, tile.previousTerrain);
                    }
                    this.game.addMoney(action.data.totalCost);
                } else {
                    // Single tile undo (legacy format)
                    this.game.world.setTerrain(action.data.x, action.data.y, action.data.previousTerrain);
                    this.game.addMoney(action.data.cost);
                }
                this.game.pathfinding.updateWorld(this.game.world);
                break;

            case 'path':
                // Handle both single tile and multi-tile (L-shape) path undo
                if (action.data.tiles) {
                    // Multi-tile undo
                    for (const tile of action.data.tiles) {
                        this.game.world.setPath(tile.x, tile.y, tile.previousPath);
                    }
                    this.game.addMoney(action.data.totalCost);
                } else {
                    // Single tile undo (legacy format)
                    this.game.world.setPath(action.data.x, action.data.y, action.data.previousPath);
                    this.game.addMoney(action.data.cost);
                }
                this.game.pathfinding.updateWorld(this.game.world);
                break;

            case 'fence':
                // Remove all placed fences
                for (const edge of action.data.edges) {
                    this.game.world.setFence(edge.tileX, edge.tileY, edge.edge, null);
                    this.game.removeFenceCondition(edge.tileX, edge.tileY, edge.edge);
                }
                this.game.addMoney(action.data.totalCost);
                this.game.pathfinding.updateWorld(this.game.world);
                break;

            case 'animal':
                // Remove the animal
                this.game.removeAnimal(action.data.id);
                this.game.addMoney(action.data.cost);
                break;

            case 'foliage':
                // Remove the foliage
                this.game.removeFoliage(action.data.id);
                this.game.addMoney(action.data.cost);
                break;

            case 'staff':
                // Remove the staff
                this.game.removeStaff(action.data.id);
                this.game.addMoney(action.data.cost);
                break;

            case 'shelter':
                // Remove the shelter
                this.game.removeShelter(action.data.id);
                this.game.addMoney(action.data.cost);
                break;

            case 'building':
                // Remove the building
                this.game.removeBuilding(action.data.id);
                this.game.addMoney(action.data.cost);
                break;
        }

        this.updateUndoButton();
    }

    /**
     * Update the undo button state
     */
    private updateUndoButton(): void {
        const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
        if (undoBtn) {
            undoBtn.disabled = this.undoHistory.length === 0;
        }
    }

    // =============================================
    // Touch Mode Methods
    // =============================================

    /**
     * Enable or disable touch mode
     */
    setTouchMode(enabled: boolean): void {
        this.touchMode = enabled;

        // Toggle body class for CSS styling
        if (enabled) {
            document.body.classList.add('touch-mode');
        } else {
            document.body.classList.remove('touch-mode');
        }

        // Show/hide touch controls
        const touchControls = document.getElementById('touch-controls');
        if (touchControls) {
            if (enabled) {
                touchControls.classList.remove('hidden');
            } else {
                touchControls.classList.add('hidden');
            }
        }

        // Clear any selected tile when disabling
        if (!enabled) {
            this.cancelTouchPlacement();
        }

        console.log(`Touch mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Select a tile for two-step placement in touch mode
     */
    selectTileForPlacement(tile: GridPos): void {
        this.selectedTile = { x: tile.x, y: tile.y };

        // Show confirm bar for placement tools (fence and path place immediately, no confirm needed)
        const tool = this.game.currentTool;
        const needsConfirm = ['terrain', 'animal', 'staff', 'foliage', 'shelter', 'building'].includes(tool);

        const confirmBar = document.getElementById('touch-confirm-bar');
        const confirmText = document.getElementById('touch-confirm-text');

        if (confirmBar && needsConfirm && this.game.currentItem) {
            confirmBar.classList.remove('hidden');
            if (confirmText) {
                confirmText.textContent = `Place ${this.game.currentItem}?`;
            }
        }
    }

    /**
     * Confirm the touch placement
     */
    confirmTouchPlacement(): void {
        const tool = this.game.currentTool;

        // Handle fence placement
        if (tool === 'fence' && this.touchFenceStart && this.touchFenceEnd) {
            const fenceType = this.game.currentItem as FenceType;
            if (fenceType) {
                const costs: Record<string, number> = {
                    wood: 20, iron: 40, concrete: 60
                };
                const cost = costs[fenceType] || 20;

                const edges = this.calculateLShapeEdges(this.touchFenceStart, this.touchFenceEnd);
                const placedEdges: TileEdge[] = [];

                for (const edge of edges) {
                    // Skip if fence already exists
                    const existingFence = this.game.world.getFence(edge.tileX, edge.tileY, edge.edge);
                    if (existingFence) continue;

                    if (this.game.spendMoney(cost)) {
                        this.game.world.setFence(edge.tileX, edge.tileY, edge.edge, fenceType);
                        this.game.initializeFenceCondition(edge.tileX, edge.tileY, edge.edge);
                        placedEdges.push(edge);
                    }
                }

                // Check for exhibit creation (same logic as placeFences)
                if (placedEdges.length > 0) {
                    const lastEdge = placedEdges[placedEdges.length - 1];
                    for (const edge of placedEdges) {
                        const exhibit = this.game.checkForNewExhibit(edge.tileX, edge.tileY, edge.edge, lastEdge);
                        if (exhibit) {
                            break;
                        }
                    }
                    this.game.pathfinding.updateWorld(this.game.world);
                }
            }
        }
        // Handle path placement
        else if (tool === 'path' && this.touchPathStart && this.touchPathEnd) {
            const pathType = this.game.currentItem as PathType;
            if (pathType) {
                const tiles = this.calculateLShapeTiles(this.touchPathStart, this.touchPathEnd);
                for (const tile of tiles) {
                    this.game.world.setPath(tile.x, tile.y, pathType);
                }
            }
        }
        // Handle other tile placements
        else if (this.selectedTile) {
            // Temporarily set hovered tile to selected tile and trigger placement
            const prevHovered = this.hoveredTile;
            this.hoveredTile = this.selectedTile;
            this.handleClick();
            this.hoveredTile = prevHovered;
        }

        this.cancelTouchPlacement();
    }

    /**
     * Cancel the touch placement
     */
    cancelTouchPlacement(): void {
        // Clear all touch placement state
        this.selectedTile = null;
        this.touchFenceStart = null;
        this.touchFenceEnd = null;
        this.touchPathStart = null;
        this.touchPathEnd = null;
        this.touchPlacementReady = false;

        // Clear drag preview state
        this.fenceDragStart = null;
        this.isFenceDragging = false;
        this.pathDragStart = null;
        this.isPathDragging = false;

        // Clear hover states to prevent stray highlights
        this.hoveredEdge = null;
        this.hoveredTile = null;
        this.hoveredScreenPos = null;

        // Hide confirm bar
        const confirmBar = document.getElementById('touch-confirm-bar');
        if (confirmBar) {
            confirmBar.classList.add('hidden');
        }
    }

    /**
     * Update touch confirm bar visibility based on current tool
     */
    private updateTouchConfirmBar(): void {
        if (!this.touchMode) return;

        const tool = this.game.currentTool;
        const hasItem = !!this.game.currentItem;
        const hasSelectedTile = !!this.selectedTile;

        // Only show for placement tools when item selected and tile selected (fence and path place immediately)
        const needsConfirm = ['terrain', 'animal', 'staff', 'foliage', 'shelter', 'building'].includes(tool);

        const confirmBar = document.getElementById('touch-confirm-bar');
        if (confirmBar) {
            if (needsConfirm && hasItem && hasSelectedTile) {
                confirmBar.classList.remove('hidden');
            } else {
                confirmBar.classList.add('hidden');
            }
        }
    }

    /**
     * Calculate distance between two touch points
     */
    private getTouchDistance(touch1: Touch, touch2: Touch): number {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
