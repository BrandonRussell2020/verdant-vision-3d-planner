// js/app.js
// Main application logic for Verdant Vision 3D Planner

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

import { 
    initThreeScene, renderThreeScene, addElementToThree, getThreeCanvas, 
    updateShadows, updateSeasonalAssetsInThree, exportGLTFScene, 
    setAppContextForThree, removeElementFromThree, updateElementRotationInThree,
    resetCameraToNorthView, updateGroundPlane, addCustomHouseToThree,
    updateCustomHouseInThree, removeCustomHouseFromThree
} from './three-scene.js';
import { 
    initP5Sketch, getP5Canvas, p5handleZoom, p5handlePan, redrawP5, 
    setAppContextForP5, setDrawingModeP5, getCurrentLotPolygonP5,
    isLotShapeValidP5, clearDrawingP5, getCurrentHousePolygonP5,
    isHouseShapeValidP5, getLotConfigP5, setLotConfigP5
} from './p5-sketch.js';
import { 
    populatePlantSelector, setupEventListeners, showElementInfo, toggleView, 
    showModal, hideModal, updateTimeOfDayLabel, showDrawingInstructions,
    hideDrawingInstructions, updateLotConfigUI, updateHomeBuilderUI,
    showCustomHouseControls, hideCustomHouseControls
} from './ui-controls.js';
import { plantLibrary } from './features/data/plant-library.js';
import { treeManifest }from './features/data/tree-models-manifest.js';
import { calculateSunPosition } from './features/sunlight.js';

// --- Configuration Constants ---
const DEFAULT_LOT_WIDTH_FT = 173.2;
const DEFAULT_LOT_DEPTH_FT = 173.2;
const DEFAULT_VISIBLE_AREA_FT = 80; // For initial 2D view scaling
const DEFAULT_CANVAS_SIZE_PX = 800; // Assumed default if not measurable
const PIXELS_PER_FOOT_2D_INITIAL = (DEFAULT_CANVAS_SIZE_PX / DEFAULT_VISIBLE_AREA_FT);

const HOUSE_FOOTPRINT = { width: 40, depth: 50, height: 15 }; // For default house
const SHED_FOOTPRINT = { width: 10, depth: 10, height: 8 };
const ROTATABLE_ELEMENT_TYPES = ['house', 'shed', 'raised_bed', 'compost_bin', 'bench', 'patio', 'fire_pit', 'rain_barrel', 'custom_house'];


// --- Global Application State ---
let currentView = '2D'; // '2D' or '3D'
let elements = []; // Array of all placed design elements
let nextElementId = 0;
let currentP5Scale = 1.0;
let p5PanOffset = { x: 0, y: 0 }; 
let selectedElement = null;
let currentSeason = 'summer';
let currentSunPosition = null;
let p5Instance = null;

// Lot and Home Builder State
let lotConfig = {
    width: DEFAULT_LOT_WIDTH_FT,
    depth: DEFAULT_LOT_DEPTH_FT,
    isCustomShape: false,
    customShapePoints: [] // Array of {x, y} points in feet
};
let currentDrawingMode = null; // null, 'lot_polygon', 'home_builder_polygon'

let customHouse = null; // { id: 'custom_house', type: 'custom_house', name: 'Custom House', x: 0, y: 0, width: 0, depth: 0, rotation:0, outline: [], height: 15, roofType: 'flat', threeInstance: null }

// --- DOM Element References ---
const loadingScreen = document.getElementById('loading-screen');
const toggleViewBtn = document.getElementById('toggleViewBtn');
const p5CanvasContainer = document.getElementById('p5CanvasContainer');
const threeCanvasContainer = document.getElementById('threeCanvasContainer');
const canvasErrorFallback = document.getElementById('canvasErrorFallback');
const seasonSelector = document.getElementById('seasonSelector');
const timeOfDaySlider = document.getElementById('timeOfDaySlider');
const welcomeModal = document.getElementById('welcomeModal');
const closeWelcomeModalButton = document.getElementById('closeWelcomeModalButton');
const closeWelcomeModalCross = document.getElementById('closeWelcomeModalCross');
const loadDesignInput = document.getElementById('loadDesignInput');
const treeSpeciesSelector = document.getElementById('treeSpeciesSelector');

// Lot and Home Builder UI
const lotWidthInput = document.getElementById('lotWidthInput');
const lotDepthInput = document.getElementById('lotDepthInput');
const updateLotRectBtn = document.getElementById('updateLotRectBtn');
const drawLotShapeBtn = document.getElementById('drawLotShapeBtn');
const finishDrawingLotBtn = document.getElementById('finishDrawingLotBtn');
const cancelDrawingLotBtn = document.getElementById('cancelDrawingLotBtn');
const drawingInstructions = document.getElementById('drawingInstructions');

const activateHomeBuilderBtn = document.getElementById('activateHomeBuilderBtn');
const finishHomeBuilderBtn = document.getElementById('finishHomeBuilderBtn');
const cancelHomeBuilderBtn = document.getElementById('cancelHomeBuilderBtn');

const customHouseControlsContainer = document.getElementById('customHouseControlsContainer');
const customHouseHeightInput = document.getElementById('customHouseHeightInput');
const customHouseRoofTypeSelect = document.getElementById('customHouseRoofTypeSelect');
const updateCustomHouseBtn = document.getElementById('updateCustomHouseBtn');


// --- Context object for other modules ---
const appContext = {
    elements: () => elements,
    customHouse: () => customHouse,
    selectedElement: () => selectedElement,
    getLotConfig: () => lotConfig, // Provide access to current lotConfig
    handleElementMove,
    handleElementSelect,
    p5Instance: () => p5Instance,
    redrawP5: () => { if (p5Instance) redrawP5(p5Instance); },
    treeManifest: () => treeManifest,
    ROTATABLE_ELEMENT_TYPES: ROTATABLE_ELEMENT_TYPES,
    currentView: () => currentView,
    isDrawing: () => currentDrawingMode !== null,
    getLotVertices: () => lotConfig.isCustomShape ? lotConfig.customShapePoints : null,
    validateAndPlaceElement,
};

// --- Initialization Function ---
async function main() {
    try {
        console.log("Verdant Vision 3D: Initializing application...");
        setAppContextForThree(appContext);
        setAppContextForP5(appContext);

        if (typeof p5 === 'undefined') throw new Error("p5.js library not loaded.");
        if (typeof THREE === 'undefined') throw new Error("Three.js library not loaded.");
        if (typeof SunCalc === 'undefined') console.warn("SunCalc.js library not loaded.");

        updateLotConfigUI(lotConfig.width, lotConfig.depth, false);

        if (treeManifest && treeSpeciesSelector) {
            treeSpeciesSelector.innerHTML = '';
            const defaultTreeOption = document.createElement('option');
            defaultTreeOption.value = ""; defaultTreeOption.textContent = "-- Select Tree --";
            treeSpeciesSelector.appendChild(defaultTreeOption);
            for (const key in treeManifest) {
                const option = document.createElement('option');
                option.value = key; option.textContent = treeManifest[key].displayName;
                treeSpeciesSelector.appendChild(option);
            }
        } else { console.warn("Tree manifest or selector not found."); }

        p5Instance = new p5(sketch => {
            initP5Sketch(sketch, {
                lotConfigRef: () => lotConfig, // Pass by reference
                elementsRef: () => elements,
                customHouseRef: () => customHouse,
                onElementSelect: handleElementSelect,
                onElementMove: handleElementMove,
                getScale: () => currentP5Scale,
                getPanOffset: () => p5PanOffset,
                onPolygonVertexAdd: handlePolygonVertexAdd,
                onDrawingModeChange: (isActive, mode) => {
                    if (isActive) showDrawingInstructions(drawingInstructions, mode);
                    else hideDrawingInstructions(drawingInstructions);
                }
            });
        }, p5CanvasContainer);

        initThreeScene(threeCanvasContainer, {
            lotConfigRef: () => lotConfig, // Pass by reference
            onElementSelect: handleElementSelect, // For selecting elements in 3D
            elementsRef: () => elements, // For GLTF export
            customHouseRef: () => customHouse, // For GLTF export
            getGLTFExporter: () => GLTFExporter, OrbitControls, GLTFLoader,
        });
        updateGroundPlane(); // Initial ground plane based on default lotConfig

        populatePlantSelector(plantLibrary, document.getElementById('plantSelector'));

        setupEventListeners({
            onToggleView: () => {
                currentView = toggleView(currentView, p5CanvasContainer, threeCanvasContainer, toggleViewBtn);
                if (currentView === '2D') {
                    if (p5Instance) redrawP5(p5Instance);
                } else {
                    renderThreeScene();
                }
                 if (currentDrawingMode) { // Ensure drawing mode is exited on view toggle
                    cancelDrawing();
                }
            },
            onAddElement: handleAddElement,
            onAddPlant: () => handleAddSpecificElement('plant'),
            onAddTree: () => handleAddSpecificElement('tree'),
            onSaveDesign: saveDesign, onLoadDesign: triggerLoadDesign,
            onExportPNG: exportPNG, onExportGLTF: () => exportGLTFScene(),
            onArPreview: () => { alert("AR Preview feature is under development."); },
            onSeasonChange: handleSeasonChange, onTimeChange: handleTimeOfDayChange,
            onZoomIn: () => { currentP5Scale = p5handleZoom(true, currentP5Scale); if (p5Instance) redrawP5(p5Instance); },
            onZoomOut: () => { currentP5Scale = p5handleZoom(false, currentP5Scale); if (p5Instance) redrawP5(p5Instance); },
            onPan: (dxFt, dyFt) => { p5PanOffset = p5handlePan(dxFt, dyFt, p5PanOffset); if (p5Instance) redrawP5(p5Instance); },
            onDeleteSelectedElement: handleDeleteSelectedElement,
            onDeselectAll: () => handleElementSelect(null, 'escape_key'),
            onElementRotationChange: handleElementRotation,
            onOrientNorth: orientViewNorth,
            // Lot and Home Builder UI events
            onUpdateLotRect: handleUpdateLotRect,
            onDrawLotShape: () => startDrawingMode('lot_polygon'),
            onFinishDrawingLot: () => finishDrawingMode('lot_polygon'),
            onCancelDrawingLot: () => cancelDrawingMode('lot_polygon'),
            onActivateHomeBuilder: () => startDrawingMode('home_builder_polygon'),
            onFinishHomeBuilder: () => finishDrawingMode('home_builder_polygon'),
            onCancelHomeBuilder: () => cancelDrawingMode('home_builder_polygon'),
            onUpdateCustomHouse: handleUpdateCustomHouse
        });

        if (timeOfDaySlider) updateSunlight(new Date(), parseInt(timeOfDaySlider.value));
        requestAnimationFrame(animate);

        if (loadingScreen) loadingScreen.style.display = 'none';
        if (welcomeModal && !localStorage.getItem('visitedVerdantVision')) {
            showModal(welcomeModal.id);
        }
        if (closeWelcomeModalButton) closeWelcomeModalButton.onclick = () => {
            hideModal(welcomeModal.id);
            localStorage.setItem('visitedVerdantVision', 'true');
        };
        if (closeWelcomeModalCross) closeWelcomeModalCross.onclick = () => {
            hideModal(welcomeModal.id);
            localStorage.setItem('visitedVerdantVision', 'true');
        };
        console.log("Application initialized successfully.");
    } catch (error) {
        console.error("Error during application initialization:", error);
        if (loadingScreen) loadingScreen.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Initialization Error: ${error.message}.`;
        if (canvasErrorFallback) canvasErrorFallback.classList.remove('hidden');
    }
}

// --- Drawing Mode Management ---
function startDrawingMode(mode) {
    if (currentDrawingMode) { // If already in a drawing mode, cancel it first
        cancelDrawing();
    }
    currentDrawingMode = mode;
    if (p5Instance) setDrawingModeP5(true, mode);
    showDrawingInstructions(drawingInstructions, mode);
    if (mode === 'lot_polygon') {
        updateLotConfigUI(lotConfig.width, lotConfig.depth, true);
    } else if (mode === 'home_builder_polygon') {
        updateHomeBuilderUI(true);
    }
    if (currentView !== '2D') { // Switch to 2D view if not already
        toggleViewBtn.click();
    }
}

function finishDrawingMode(mode) {
    if (!p5Instance) return;
    if (mode === 'lot_polygon') {
        const polygon = getCurrentLotPolygonP5();
        if (polygon && polygon.length >= 3 && isLotShapeValidP5(polygon)) {
            lotConfig.isCustomShape = true;
            lotConfig.customShapePoints = [...polygon]; // Store a copy
            lotConfig.width = 0; // Indicate custom shape, actual bounds will be derived
            lotConfig.depth = 0;
            console.log("Custom lot shape defined:", lotConfig.customShapePoints);
            updateGroundPlane(); // Update 3D ground
            if (p5Instance) setLotConfigP5(lotConfig); // Update p5 lot config
        } else {
            alert("Invalid lot shape. Please ensure the shape is closed and not self-intersecting, with at least 3 points.");
            return; // Don't exit drawing mode if invalid
        }
    } else if (mode === 'home_builder_polygon') {
        const polygon = getCurrentHousePolygonP5();
        if (polygon && polygon.length >= 3 && isHouseShapeValidP5(polygon)) {
            // If a custom house already exists, remove it first
            if (customHouse && customHouse.threeInstance) {
                 if(typeof removeCustomHouseFromThree === 'function') removeCustomHouseFromThree(customHouse.threeInstance);
            }
            // Calculate center and dimensions for the new custom house
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            polygon.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
            const houseWidth = maxX - minX;
            const houseDepth = maxY - minY;
            const houseCenterX = minX + houseWidth / 2;
            const houseCenterY = minY + houseDepth / 2;

            customHouse = {
                id: 'custom_house_' + nextElementId++, // Unique ID
                type: 'custom_house',
                name: 'Custom House',
                x: houseCenterX - houseWidth / 2, // Store top-left for consistency with other elements if needed
                y: houseCenterY - houseDepth / 2,
                width: houseWidth,
                depth: houseDepth,
                rotation: 0,
                outline: polygon.map(p => ({ x: p.x - houseCenterX, y: p.y - houseCenterY })), // Store outline relative to center
                height: parseFloat(customHouseHeightInput.value) || 15,
                roofType: customHouseRoofTypeSelect.value || 'flat',
                threeInstance: null, // Will be set by three-scene.js
            };
            console.log("Custom house defined:", customHouse);
            addCustomHouseToThree(customHouse);
            handleElementSelect(customHouse.id, 'programmatic_add'); // Select the new house
            showCustomHouseControls(customHouse.height, customHouse.roofType);
        } else {
            alert("Invalid house shape. Please ensure the shape is closed and not self-intersecting, with at least 3 points.");
            return; // Don't exit drawing mode if invalid
        }
    }
    cancelDrawing(); // Exits drawing mode common logic
}

function cancelDrawing() { // Renamed for clarity
    if (p5Instance) {
        setDrawingModeP5(false, null);
        clearDrawingP5(); // Clear any partial drawings from p5
    }
    hideDrawingInstructions(drawingInstructions);
    if (currentDrawingMode === 'lot_polygon') {
        updateLotConfigUI(lotConfig.width, lotConfig.depth, false);
    } else if (currentDrawingMode === 'home_builder_polygon') {
        updateHomeBuilderUI(false);
    }
    currentDrawingMode = null;
    if (p5Instance) redrawP5(p5Instance);
}
function cancelDrawingMode(mode){ // Wrapper for specific cancel buttons
    cancelDrawing();
}


function handlePolygonVertexAdd(point, mode) {
    // This function could provide feedback as points are added, if needed.
    // For now, it's mainly a placeholder for potential future use.
    // console.log(`Vertex added for ${mode}:`, point);
}

function handleUpdateLotRect() {
    const newWidth = parseFloat(lotWidthInput.value);
    const newDepth = parseFloat(lotDepthInput.value);

    if (isNaN(newWidth) || isNaN(newDepth) || newWidth <= 0 || newDepth <= 0) {
        alert("Please enter valid positive numbers for lot width and depth.");
        return;
    }
    lotConfig.width = newWidth;
    lotConfig.depth = newDepth;
    lotConfig.isCustomShape = false;
    lotConfig.customShapePoints = [];

    console.log("Rectangular lot updated:", lotConfig);
    updateGroundPlane(); // Update 3D ground
    if (p5Instance) {
        setLotConfigP5(lotConfig); // Update p5 lot config
        redrawP5(p5Instance);
    }
}

function handleUpdateCustomHouse() {
    if (!customHouse || selectedElement?.type !== 'custom_house') {
        alert("No custom house selected or it's not a custom house.");
        return;
    }
    const newHeight = parseFloat(customHouseHeightInput.value);
    const newRoofType = customHouseRoofTypeSelect.value;

    if (isNaN(newHeight) || newHeight <= 0) {
        alert("Please enter a valid positive number for house height.");
        return;
    }
    customHouse.height = newHeight;
    customHouse.roofType = newRoofType;
    
    updateCustomHouseInThree(customHouse);
    if (p5Instance) redrawP5(p5Instance); // May need specific redraw logic for house in p5 if it shows height/roof
    showElementInfo(customHouse, plantLibrary); // Refresh info panel
}


// --- View Orientation ---
function orientViewNorth() {
    if (currentView === '2D') {
        p5PanOffset = { x: 0, y: 0 };
        currentP5Scale = 1.0; 
        if (p5Instance) redrawP5(p5Instance);
    } else if (currentView === '3D') {
        if (typeof resetCameraToNorthView === 'function') {
            resetCameraToNorthView();
        } else {
            console.warn("resetCameraToNorthView function not found in three-scene.js");
        }
    }
}

// --- Element Manipulation ---
function handleAddSpecificElement(elementType) {
    let data = {}; let nameForElement = elementType;
    if (elementType === 'plant') {
        const plantId = document.getElementById('plantSelector').value;
        if (!plantId) { alert("Please select a plant."); return; }
        const plantDetails = plantLibrary.find(p => p.id === plantId);
        if (!plantDetails) { alert("Plant details not found."); return; }
        data = { ...plantDetails, modelFile: "tomato_plant.glb" }; 
        nameForElement = plantDetails.name || elementType;
    } else if (elementType === 'tree') {
        const speciesKey = document.getElementById('treeSpeciesSelector').value;
        if (!speciesKey) { alert("Please select a tree species."); return; }
        const speciesInfo = treeManifest[speciesKey] || { displayName: "Unknown Tree", defaultHeightFt: 30, defaultCanopyFt: 20 };
        const height = parseFloat(document.getElementById('treeHeight').value) || speciesInfo.defaultHeightFt;
        const canopy = parseFloat(document.getElementById('treeCanopy').value) || speciesInfo.defaultCanopyFt;
        data = { species: speciesKey, displayName: speciesInfo.displayName, height, canopy, currentSeason };
        nameForElement = speciesInfo.displayName;
    }
    handleAddElement(elementType, data, nameForElement);
}

function handleAddElement(type, specificData = {}, elementNameFromSpecific) {
    if (currentDrawingMode) {
        alert(`Please finish or cancel ${currentDrawingMode.replace('_polygon', '')} drawing first.`);
        return;
    }
    try {
        const p5LotConfig = p5Instance ? getLotConfigP5() : lotConfig;
        const currentLotWidth = p5LotConfig.isCustomShape ? (Math.max(...p5LotConfig.customShapePoints.map(p => p.x)) - Math.min(...p5LotConfig.customShapePoints.map(p => p.x))) : p5LotConfig.width;
        const currentLotDepth = p5LotConfig.isCustomShape ? (Math.max(...p5LotConfig.customShapePoints.map(p => p.y)) - Math.min(...p5LotConfig.customShapePoints.map(p => p.y))) : p5LotConfig.depth;

        const viewCenterXFt = (currentLotWidth / 2) - p5PanOffset.x;
        const viewCenterYFt = (currentLotDepth / 2) - p5PanOffset.y;

        const newElement = {
            id: nextElementId++, type: type,
            name: elementNameFromSpecific || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            x: viewCenterXFt, y: viewCenterYFt, z: 0, rotation: 0,
            data: specificData,
        };
        switch(type) {
            case 'house': newElement.width = HOUSE_FOOTPRINT.width; newElement.depth = HOUSE_FOOTPRINT.depth; newElement.height = HOUSE_FOOTPRINT.height; break;
            case 'shed': newElement.width = SHED_FOOTPRINT.width; newElement.depth = SHED_FOOTPRINT.depth; newElement.height = SHED_FOOTPRINT.height; break;
            case 'raised_bed': newElement.width = 8; newElement.depth = 4; newElement.height = 1.5; break;
            case 'inground_row': newElement.width = 20; newElement.depth = 4; newElement.height = 0.25; break;
            case 'compost_bin': newElement.width = 4; newElement.depth = 4; newElement.height = 3; break;
            case 'plant':
                newElement.width = (specificData.spacing || 6) / 12; newElement.depth = (specificData.spacing || 6) / 12; newElement.height = (specificData.matureHeight || 6) / 12;
                newElement.isPlant = true; break;
            case 'tree':
                newElement.width = specificData.canopy || 20; newElement.depth = specificData.canopy || 20; newElement.height = specificData.height || 30;
                newElement.isTree = true; break;
            case 'fence_segment': newElement.width = 10; newElement.depth = 0.5; newElement.height = 6; break;
            case 'patio': newElement.width = 10; newElement.depth = 10; newElement.height = 0.25; break;
            case 'path': newElement.width = 10; newElement.depth = 3; newElement.height = 0.15; break;
            case 'sprinkler': newElement.width = 0.5; newElement.depth = 0.5; newElement.height = 0.5; break;
            case 'rain_barrel': newElement.width = 2.5; newElement.depth = 2.5; newElement.height = 3.5; break;
            case 'bench': newElement.width = 5; newElement.depth = 2; newElement.height = 2.5; break;
            case 'fire_pit': newElement.width = 3.5; newElement.depth = 3.5; newElement.height = 1.5; break;
            case 'lawn_area': newElement.width = 20; newElement.depth = 20; newElement.height = 0.05; break;
            default: newElement.width = 5; newElement.depth = 5; newElement.height = 1;
        }
        newElement.x -= newElement.width / 2; newElement.y -= newElement.depth / 2;
        
        if (!validateAndPlaceElement(newElement)) {
             alert("Element cannot be placed outside the lot boundary.");
             return;
        }

        elements.push(newElement);
        addElementToThree(newElement, currentSeason); // Add to 3D scene
        handleElementSelect(newElement.id, 'programmatic_add');
        if (p5Instance) redrawP5(p5Instance);
    } catch (error) { console.error(`Error adding element type ${type}:`, error); alert(`Failed to add ${type}.`); }
}

function validateAndPlaceElement(element) {
    const p5LotConfig = p5Instance ? getLotConfigP5() : lotConfig;
    if (p5LotConfig.isCustomShape) {
        // Basic bounding box check for custom shapes first
        const lotBoundingBox = p5LotConfig.customShapePoints.reduce((acc, p) => ({
            minX: Math.min(acc.minX, p.x), minY: Math.min(acc.minY, p.y),
            maxX: Math.max(acc.maxX, p.x), maxY: Math.max(acc.maxY, p.y)
        }), {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});

        if (element.x < lotBoundingBox.minX || element.x + element.width > lotBoundingBox.maxX ||
            element.y < lotBoundingBox.minY || element.y + element.depth > lotBoundingBox.maxY) {
            // For complex validation against polygon, p5.js side would be better.
            // For now, allow if within bounding box, p5 sketch can show better visual cues.
            // This is a simplified check. More robust point-in-polygon needed for accuracy with element rotation.
            // For simplicity, we check the element's center point against the custom polygon in p5-sketch.js during drag.
        }
    } else {
        // Rectangular lot boundary check
        element.x = Math.max(0, Math.min(element.x, p5LotConfig.width - element.width));
        element.y = Math.max(0, Math.min(element.y, p5LotConfig.depth - element.depth));
    }
    return true; // Assuming placement is valid by default if not immediately out of bounds
}


function handleElementSelect(elementId, sourceView = 'unknown') {
    if (currentDrawingMode && elementId !== null) { // Don't allow selection when drawing
        return;
    }
    if (elementId === null) {
        selectedElement = null;
    } else if (typeof elementId === 'string' && elementId.startsWith('custom_house')) {
        selectedElement = customHouse;
    } else {
        selectedElement = elements.find(el => el.id === elementId);
    }
    
    showElementInfo(selectedElement, plantLibrary, customHouse); // Pass customHouse for info panel updates

    if (selectedElement && selectedElement.type === 'custom_house') {
        showCustomHouseControls(selectedElement.height, selectedElement.roofType);
    } else {
        hideCustomHouseControls();
    }
    if (p5Instance) redrawP5(p5Instance);
}


function handleElementMove(elementId, newXFt, newYFt) {
    let elementToMove;
    if (typeof elementId === 'string' && elementId.startsWith('custom_house')) {
        elementToMove = customHouse;
    } else {
        elementToMove = elements.find(el => el.id === elementId);
    }
    
    if (elementToMove) {
        elementToMove.x = newXFt; elementToMove.y = newYFt; 
        
        if(elementToMove.threeInstance) {
            const p5LotConfig = p5Instance ? getLotConfigP5() : lotConfig;
            const lotCenterX = p5LotConfig.isCustomShape ? 
                                (Math.min(...p5LotConfig.customShapePoints.map(p => p.x)) + Math.max(...p5LotConfig.customShapePoints.map(p => p.x))) / 2 
                                : p5LotConfig.width / 2;
            const lotCenterZ = p5LotConfig.isCustomShape ?
                                (Math.min(...p5LotConfig.customShapePoints.map(p => p.y)) + Math.max(...p5LotConfig.customShapePoints.map(p => p.y))) / 2
                                : p5LotConfig.depth / 2;

            const threeX = elementToMove.x + elementToMove.width / 2 - lotCenterX;
            const threeZ = elementToMove.y + elementToMove.depth / 2 - lotCenterZ;
            let threeY = 0; // Default Y

            if (elementToMove.type === 'custom_house') {
                threeY = 0; // Custom house base at ground
            } else if (elementToMove.type === 'house' || elementToMove.type === 'shed' || elementToMove.isTree || elementToMove.isPlant) {
                threeY = 0; 
            } else {
                threeY = elementToMove.height / 2; 
            }
            elementToMove.threeInstance.position.set(threeX, threeY, threeZ);
            if (currentView === '3D') renderThreeScene();
        }
        showElementInfo(elementToMove, plantLibrary, customHouse);
    }
}

function handleElementRotation(newRotationDegrees, isLiveUpdate = false) {
    if (!selectedElement || !ROTATABLE_ELEMENT_TYPES.includes(selectedElement.type)) {
        return;
    }
    let normalizedRotation = parseFloat(newRotationDegrees) % 360;
    if (normalizedRotation < 0) normalizedRotation += 360;
    selectedElement.rotation = normalizedRotation;

    if (selectedElement.threeInstance && typeof updateElementRotationInThree === 'function') {
        updateElementRotationInThree(selectedElement.threeInstance, selectedElement.rotation);
    }
    
    if (p5Instance) redrawP5(p5Instance);
    if (currentView === '3D' && isLiveUpdate) renderThreeScene();
    if (!isLiveUpdate) {
        showElementInfo(selectedElement, plantLibrary, customHouse);
    }
}

function handleDeleteSelectedElement() {
    if (!selectedElement) { return; }
    
    const elementName = selectedElement.name || selectedElement.type;
    if (!confirm(`Are you sure you want to delete "${elementName}"?`)) return;

    if (selectedElement.type === 'custom_house') {
        if (selectedElement.threeInstance && typeof removeCustomHouseFromThree === 'function') {
            removeCustomHouseFromThree(selectedElement.threeInstance);
        }
        customHouse = null;
        hideCustomHouseControls();
    } else {
        const elementIdToDelete = selectedElement.id;
        if (typeof removeElementFromThree === 'function' && selectedElement.threeInstance) {
            removeElementFromThree(selectedElement.threeInstance);
        } else if (selectedElement.threeInstance?.parent) {
            selectedElement.threeInstance.removeFromParent(); // Basic removal
        }
        elements = elements.filter(el => el.id !== elementIdToDelete);
    }
    
    selectedElement = null;
    showElementInfo(null, plantLibrary, null); // Clear info panel
    if (p5Instance) redrawP5(p5Instance);
    if (currentView === '3D') renderThreeScene();
}

function handleSeasonChange(event) {
    currentSeason = event.target.value;
    updateSeasonalAssetsInThree(elements, currentSeason); // Update regular elements
    if (customHouse && customHouse.threeInstance) {
        // If custom houses have seasonal variations in future, update here
    }
    elements.forEach(el => {
        if (el.isTree || el.isPlant) {
            if (!el.data) el.data = {}; el.data.currentSeason = currentSeason;
        }
    });
    if(selectedElement) showElementInfo(selectedElement, plantLibrary, customHouse);
    if (p5Instance) redrawP5(p5Instance);
}

function updateSunlight(date, hour) {
    const lat = 39.8900; const lon = -85.9300; // McCordsville, IN coordinates
    const currentDate = new Date(date); currentDate.setHours(hour, 0, 0, 0);
    try {
        if (typeof SunCalc !== 'undefined') {
            currentSunPosition = calculateSunPosition(currentDate, lat, lon);
            if (currentSunPosition) updateShadows(currentSunPosition);
        } else { // Fallback if SunCalc fails
            updateShadows({ altitude: Math.PI / 4, azimuth: Math.PI * 1.5 }); // Default sun position
        }
    } catch (error) { console.error("Error updating sunlight:", error); }
}

function handleTimeOfDayChange(event) {
    const hour = parseInt(event.target.value);
    updateTimeOfDayLabel(hour, document.getElementById('timeOfDayValue'));
    updateSunlight(new Date(), hour);
}

// --- Save/Load ---
function saveDesign() {
    try {
        if (elements.length === 0 && !customHouse && !lotConfig.isCustomShape) { alert("Nothing to save!"); return; }
        const designData = {
            version: "1.3.0", // Incremented version for new features
            createdAt: new Date().toISOString(),
            lotConfiguration: lotConfig, // Save lot config
            customHouseData: customHouse ? { // Save custom house data if exists
                ...customHouse,
                outline: customHouse.outline, // Ensure outline (relative points) is saved
                threeInstance: undefined // Don't save live THREE instance
            } : null,
            elements: elements.map(el => ({
                id: el.id, type: el.type, name: el.name, x: el.x, y: el.y, z: el.z,
                width: el.width, depth: el.depth, height: el.height, rotation: el.rotation || 0, data: el.data,
                threeInstance: undefined // Don't save live THREE instance
            })),
            viewSettings: {
                p5Scale: currentP5Scale, p5PanOffset: p5PanOffset, currentSeason: currentSeason,
                timeOfDay: timeOfDaySlider ? parseInt(timeOfDaySlider.value) : 12
            }
        };
        const jsonData = JSON.stringify(designData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; 
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `VerdantVision_Design_${dateStr}.json`;
        a.download = filename; a.href = url;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (a.parentElement) document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100); 
        alert("Design saved successfully! Please check your browser's Downloads folder.");
    } catch (error) { console.error("Error saving design:", error); alert("Failed to save design."); }
}

function triggerLoadDesign() { if (loadDesignInput) loadDesignInput.click(); }

if (loadDesignInput) {
    loadDesignInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const designData = JSON.parse(e.target.result);
                    if ((!designData.elements && !designData.customHouseData && !designData.lotConfiguration) || !designData.version) {
                        throw new Error("Invalid design file format.");
                    }
                    
                    // Clear existing scene
                    elements.forEach(el => {
                        if (typeof removeElementFromThree === 'function' && el.threeInstance) removeElementFromThree(el.threeInstance);
                        else if (el.threeInstance?.parent) el.threeInstance.removeFromParent();
                    });
                    if (customHouse && customHouse.threeInstance && typeof removeCustomHouseFromThree === 'function') {
                         removeCustomHouseFromThree(customHouse.threeInstance);
                    }
                    elements = []; nextElementId = 0; selectedElement = null; customHouse = null;

                    // Load Lot Configuration
                    if (designData.lotConfiguration) {
                        lotConfig = { ...designData.lotConfiguration };
                        updateLotConfigUI(lotConfig.width, lotConfig.depth, lotConfig.isCustomShape);
                        updateGroundPlane();
                        if (p5Instance) setLotConfigP5(lotConfig);
                    } else { // Fallback to default if not in save file
                        lotConfig = { width: DEFAULT_LOT_WIDTH_FT, depth: DEFAULT_LOT_DEPTH_FT, isCustomShape: false, customShapePoints: [] };
                        updateGroundPlane();
                        if (p5Instance) setLotConfigP5(lotConfig);
                    }

                    // Load Custom House
                    if (designData.customHouseData) {
                        customHouse = { ...designData.customHouseData };
                        // Ensure ID is unique if loading multiple times or alongside new elements
                        if (customHouse.id === undefined || typeof customHouse.id !== 'string' || !customHouse.id.startsWith('custom_house_')) {
                            customHouse.id = 'custom_house_' + nextElementId++;
                        } else {
                             const idNum = parseInt(customHouse.id.split('_').pop());
                             if (!isNaN(idNum) && idNum >= nextElementId) nextElementId = idNum + 1;
                        }
                        addCustomHouseToThree(customHouse);
                    }

                    // Load other elements
                    if (designData.elements) {
                        designData.elements.forEach(elData => {
                            const newEl = { ...elData, rotation: elData.rotation || 0 };
                            if (newEl.id >= nextElementId) nextElementId = newEl.id + 1;
                            elements.push(newEl);
                            addElementToThree(newEl, designData.viewSettings?.currentSeason || currentSeason);
                        });
                    }

                    if (designData.viewSettings) {
                        currentP5Scale = designData.viewSettings.p5Scale || 1.0;
                        p5PanOffset = designData.viewSettings.p5PanOffset || {x:0, y:0};
                        currentSeason = designData.viewSettings.currentSeason || 'summer';
                        if (seasonSelector) seasonSelector.value = currentSeason;
                        const timeOfDay = designData.viewSettings.timeOfDay || 12;
                        if (timeOfDaySlider) timeOfDaySlider.value = timeOfDay;
                        updateTimeOfDayLabel(timeOfDay, document.getElementById('timeOfDayValue'));
                        updateSunlight(new Date(), timeOfDay);
                        updateSeasonalAssetsInThree(elements, currentSeason);
                         if (customHouse && customHouse.threeInstance) { /* update custom house season if needed */ }
                    }
                    alert("Design loaded successfully!");
                    if (p5Instance) redrawP5(p5Instance); 
                    renderThreeScene(); 
                    showElementInfo(null, plantLibrary, null);
                    hideCustomHouseControls();

                } catch (error) { console.error("Error loading design:", error); alert(`Failed to load design: ${error.message}`);
                } finally { if (event.target) event.target.value = null; } // Reset file input
            };
            reader.readAsText(file);
        }
    });
}


// --- Export ---
function exportPNG() {
    if (currentDrawingMode) {
        alert("Please finish or cancel drawing mode before exporting.");
        return;
    }
    try {
        let canvasToExport, filename = "VerdantVision_View_";
        if (currentView === '2D' && getP5Canvas()) {
            if (p5Instance) redrawP5(p5Instance); // Ensure it's up-to-date
            canvasToExport = getP5Canvas();
            filename += "2D.png";
        } else if (currentView === '3D' && getThreeCanvas()) {
            renderThreeScene(); // Ensure it's up-to-date
            canvasToExport = getThreeCanvas();
            filename += "3D.png";
        } else {
            alert("No active canvas to export.");
            return;
        }
        if (!canvasToExport) { alert("Canvas element not found."); return; }
        const dataURL = canvasToExport.toDataURL('image/png');
        const a = document.createElement('a'); a.href = dataURL; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    } catch (error) { console.error("Error exporting PNG:", error); alert("Failed to export PNG."); }
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    try { 
        if (currentView === '3D') {
            renderThreeScene(); 
        }
        // p5Instance handles its own redraws on demand, not in RAF to save battery
    }
    catch (error) { console.error("Error in animation loop:", error); }
}

// --- Global Error Handling ---
window.addEventListener('error', function(event) {
    console.error('Global error caught:', { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, errorObject: event.error });
});
window.addEventListener('unhandledrejection', function(event) { console.error('Unhandled promise rejection:', event.reason); });


// --- DOMContentLoaded ---
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
else main();

// Expose some state for debugging or advanced interaction if needed
window.verdantApp = { 
    elements, selectedElement, customHouse, currentSeason, p5Instance, lotConfig,
    forceRedraw2D: () => { if(p5Instance) redrawP5(p5Instance); }, 
    forceRedraw3D: renderThreeScene, appContext 
};

export { 
    lotConfig, elements, currentSeason, currentSunPosition, selectedElement, customHouse,
    HOUSE_FOOTPRINT, SHED_FOOTPRINT, p5Instance, appContext, ROTATABLE_ELEMENT_TYPES 
};