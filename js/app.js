// js/app.js
// Main application logic for Verdant Vision 3D Planner

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

import { 
    initThreeScene, renderThreeScene, addElementToThree, getThreeCanvas, 
    updateShadows, updateSeasonalAssetsInThree, exportGLTFScene, 
    setAppContextForThree, removeElementFromThree, updateElementRotationInThree,
    resetCameraToNorthView
} from './three-scene.js';
import { 
    initP5Sketch, getP5Canvas, p5handleZoom, p5handlePan, redrawP5, 
    setAppContextForP5 
} from './p5-sketch.js';
import { 
    populatePlantSelector, setupEventListeners, showElementInfo, toggleView, 
    showModal, hideModal, updateTimeOfDayLabel 
} from './ui-controls.js';
import { plantLibrary } from './features/data/plant-library.js';
import { treeManifest } from './features/data/tree-models-manifest.js'; // Ensure this is imported
import { calculateSunPosition } from './features/sunlight.js';

// --- Configuration Constants ---
const LOT_WIDTH_FT = 173.2;
const LOT_DEPTH_FT = 173.2;
const DEFAULT_VISIBLE_AREA_FT = 80;
const DEFAULT_CANVAS_SIZE_PX = 800;
const PIXELS_PER_FOOT_2D_INITIAL = (DEFAULT_CANVAS_SIZE_PX / DEFAULT_VISIBLE_AREA_FT);

const HOUSE_FOOTPRINT = { width: 40, depth: 50, height: 15 };
const SHED_FOOTPRINT = { width: 10, depth: 10, height: 8 };
const ROTATABLE_ELEMENT_TYPES = ['house', 'shed', 'raised_bed', 'compost_bin', 'bench', 'patio', 'fire_pit', 'rain_barrel'];


// --- Global Application State ---
let currentView = '2D';
let elements = [];
let nextElementId = 0;
let currentP5Scale = 1.0;
let p5PanOffset = { x: 0, y: 0 }; 
let selectedElement = null;
let currentSeason = 'summer';
let currentSunPosition = null;
let p5Instance = null;

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

// --- Context object for other modules ---
const appContext = {
    elements: () => elements,
    selectedElement: () => selectedElement,
    LOT_WIDTH_FT,
    LOT_DEPTH_FT,
    handleElementMove,
    p5Instance: () => p5Instance,
    redrawP5: () => { if (p5Instance) redrawP5(p5Instance); },
    treeManifest: () => treeManifest, // *** Make treeManifest available ***
    ROTATABLE_ELEMENT_TYPES: ROTATABLE_ELEMENT_TYPES
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
                lotWidthFt: LOT_WIDTH_FT, lotDepthFt: LOT_DEPTH_FT,
                initialPixelsPerFoot: PIXELS_PER_FOOT_2D_INITIAL, defaultVisibleAreaFt: DEFAULT_VISIBLE_AREA_FT,
                elementsRef: () => elements, onElementSelect: handleElementSelect, onElementMove: handleElementMove,
                getScale: () => currentP5Scale, getPanOffset: () => p5PanOffset,
            });
        }, p5CanvasContainer);

        initThreeScene(threeCanvasContainer, {
            lotWidth: LOT_WIDTH_FT, lotDepth: LOT_DEPTH_FT,
            onElementSelect: handleElementSelect, elementsRef: () => elements,
            getGLTFExporter: () => GLTFExporter, OrbitControls, GLTFLoader,
        });

        populatePlantSelector(plantLibrary, document.getElementById('plantSelector'));

        setupEventListeners({
            onToggleView: () => {
                currentView = toggleView(currentView, p5CanvasContainer, threeCanvasContainer, toggleViewBtn);
                if (currentView === '2D' && p5Instance) redrawP5(p5Instance);
                else if (currentView === '3D') renderThreeScene();
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
            onOrientNorth: orientViewNorth
        });

        if (timeOfDaySlider) updateSunlight(new Date(), parseInt(timeOfDaySlider.value));
        requestAnimationFrame(animate);

        if (loadingScreen) loadingScreen.style.display = 'none';
        if (welcomeModal && !localStorage.getItem('visitedVerdantVision')) {
            showModal(welcomeModal.id);
        }
        if (closeWelcomeModalButton) closeWelcomeModalButton.onclick = () => hideModal(welcomeModal.id);
        if (closeWelcomeModalCross) closeWelcomeModalCross.onclick = () => hideModal(welcomeModal.id);
        console.log("Application initialized successfully.");
    } catch (error) {
        console.error("Error during application initialization:", error);
        if (loadingScreen) loadingScreen.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Initialization Error: ${error.message}.`;
        if (canvasErrorFallback) canvasErrorFallback.classList.remove('hidden');
    }
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
        data = { ...plantDetails, modelFile: "tomato_plant.glb" }; // Add modelFile hint
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
    try {
        const viewCenterXFt = (LOT_WIDTH_FT / 2) - p5PanOffset.x;
        const viewCenterYFt = (LOT_DEPTH_FT / 2) - p5PanOffset.y;
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
        newElement.x = Math.max(0, Math.min(newElement.x, LOT_WIDTH_FT - newElement.width));
        newElement.y = Math.max(0, Math.min(newElement.y, LOT_DEPTH_FT - newElement.depth));
        elements.push(newElement);
        addElementToThree(newElement, currentSeason);
        handleElementSelect(newElement.id, 'programmatic_add');
        if (p5Instance) redrawP5(p5Instance);
    } catch (error) { console.error(`Error adding element type ${type}:`, error); alert(`Failed to add ${type}.`); }
}

function handleElementSelect(elementId, sourceView = 'unknown') {
    selectedElement = elementId === null ? null : elements.find(el => el.id === elementId);
    showElementInfo(selectedElement, plantLibrary);
    if (p5Instance) redrawP5(p5Instance);
}

function handleElementMove(elementId, newXFt, newYFt) {
    const element = elements.find(el => el.id === elementId);
    if (element) {
        element.x = newXFt; element.y = newYFt; 
        if(element.threeInstance) {
            const threeX = element.x + element.width / 2 - LOT_WIDTH_FT / 2;
            const threeZ = element.y + element.depth / 2 - LOT_DEPTH_FT / 2;
            let threeY;
            if (element.type === 'house' || element.type === 'shed' || element.isTree || element.isPlant) { // Plants with models also at base
                threeY = 0; 
            } else {
                threeY = element.height / 2; 
            }
            element.threeInstance.position.set(threeX, threeY, threeZ);
            if (currentView === '3D') renderThreeScene();
        }
        showElementInfo(element, plantLibrary);
    }
}

function handleElementRotation(newRotationDegrees, isLiveUpdate = false) {
    if (!selectedElement || !ROTATABLE_ELEMENT_TYPES.includes(selectedElement.type)) {
        return;
    }
    let normalizedRotation = parseFloat(newRotationDegrees) % 360;
    if (normalizedRotation < 0) normalizedRotation += 360;
    selectedElement.rotation = normalizedRotation;
    if (typeof updateElementRotationInThree === 'function' && selectedElement.threeInstance) {
        updateElementRotationInThree(selectedElement.threeInstance, selectedElement.rotation);
    }
    if (p5Instance) redrawP5(p5Instance);
    if (currentView === '3D' && isLiveUpdate) renderThreeScene();
    if (!isLiveUpdate) {
        showElementInfo(selectedElement, plantLibrary);
    }
}

function handleDeleteSelectedElement() {
    if (!selectedElement) { return; }
    const elementIdToDelete = selectedElement.id;
    const elementName = selectedElement.name || selectedElement.type;
    if (!confirm(`Are you sure you want to delete "${elementName}"?`)) return;
    if (typeof removeElementFromThree === 'function' && selectedElement.threeInstance) {
        removeElementFromThree(selectedElement.threeInstance);
    } else {
        console.warn("removeElementFromThree function not found or 3D instance missing.");
        if (selectedElement.threeInstance?.parent) selectedElement.threeInstance.removeFromParent();
    }
    elements = elements.filter(el => el.id !== elementIdToDelete);
    selectedElement = null;
    showElementInfo(null, plantLibrary);
    if (p5Instance) redrawP5(p5Instance);
    if (currentView === '3D') renderThreeScene();
}

function handleSeasonChange(event) {
    currentSeason = event.target.value;
    updateSeasonalAssetsInThree(elements, currentSeason);
    elements.forEach(el => {
        if (el.isTree || el.isPlant) {
            if (!el.data) el.data = {}; el.data.currentSeason = currentSeason;
        }
    });
    if(selectedElement) showElementInfo(selectedElement, plantLibrary);
    if (p5Instance) redrawP5(p5Instance);
}

function updateSunlight(date, hour) {
    const lat = 39.8900; const lon = -85.9300;
    const currentDate = new Date(date); currentDate.setHours(hour, 0, 0, 0);
    try {
        if (typeof SunCalc !== 'undefined') {
            currentSunPosition = calculateSunPosition(currentDate, lat, lon);
            if (currentSunPosition) updateShadows(currentSunPosition);
        } else { updateShadows({ altitude: Math.PI / 4, azimuth: Math.PI * 1.5 }); }
    } catch (error) { console.error("Error updating sunlight:", error); }
}

function handleTimeOfDayChange(event) {
    const hour = parseInt(event.target.value);
    updateTimeOfDayLabel(hour, document.getElementById('timeOfDayValue'));
    updateSunlight(new Date(), hour);
}

function saveDesign() {
    try {
        if (elements.length === 0) { alert("Nothing to save!"); return; }
        const designData = {
            version: "1.2.0", createdAt: new Date().toISOString(),
            elements: elements.map(el => ({
                id: el.id, type: el.type, name: el.name, x: el.x, y: el.y, z: el.z,
                width: el.width, depth: el.depth, height: el.height, rotation: el.rotation || 0, data: el.data
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
                    if (!designData.elements || !designData.version) throw new Error("Invalid design file format.");
                    elements.forEach(el => {
                        if (typeof removeElementFromThree === 'function' && el.threeInstance) removeElementFromThree(el.threeInstance);
                        else if (el.threeInstance?.parent) el.threeInstance.removeFromParent();
                    });
                    elements = []; nextElementId = 0; selectedElement = null;
                    designData.elements.forEach(elData => {
                        const newEl = { ...elData, rotation: elData.rotation || 0 };
                        if (newEl.id >= nextElementId) nextElementId = newEl.id + 1;
                        elements.push(newEl);
                        addElementToThree(newEl, designData.viewSettings?.currentSeason || currentSeason);
                    });
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
                    }
                    alert("Design loaded successfully!");
                    if (p5Instance) redrawP5(p5Instance); renderThreeScene(); showElementInfo(null, plantLibrary);
                } catch (error) { console.error("Error loading design:", error); alert(`Failed to load design: ${error.message}`);
                } finally { if (event.target) event.target.value = null; }
            };
            reader.readAsText(file);
        }
    });
}

function exportPNG() {
    try {
        let canvasToExport, filename = "VerdantVision_View_";
        if (currentView === '2D' && getP5Canvas()) {
            if (p5Instance) redrawP5(p5Instance); canvasToExport = getP5Canvas(); filename += "2D.png";
        } else if (currentView === '3D' && getThreeCanvas()) {
            renderThreeScene(); canvasToExport = getThreeCanvas(); filename += "3D.png";
        } else { alert("No active canvas to export."); return; }
        if (!canvasToExport) { alert("Canvas element not found."); return; }
        const dataURL = canvasToExport.toDataURL('image/png');
        const a = document.createElement('a'); a.href = dataURL; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    } catch (error) { console.error("Error exporting PNG:", error); alert("Failed to export PNG."); }
}

function animate() {
    requestAnimationFrame(animate);
    try { if (currentView === '3D') renderThreeScene(); }
    catch (error) { console.error("Error in animation loop:", error); }
}

window.addEventListener('error', function(event) {
    console.error('Global error caught:', { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, errorObject: event.error });
});
window.addEventListener('unhandledrejection', function(event) { console.error('Unhandled promise rejection:', event.reason); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
else main();

window.verdantApp = { elements, selectedElement, currentSeason, p5Instance, forceRedraw2D: () => { if(p5Instance) redrawP5(p5Instance); }, forceRedraw3D: renderThreeScene, appContext };
export { LOT_WIDTH_FT, LOT_DEPTH_FT, PIXELS_PER_FOOT_2D_INITIAL, elements, currentSeason, currentSunPosition, selectedElement, HOUSE_FOOTPRINT, SHED_FOOTPRINT, p5Instance, appContext, ROTATABLE_ELEMENT_TYPES };
