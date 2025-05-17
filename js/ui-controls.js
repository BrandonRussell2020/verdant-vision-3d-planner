// js/ui-controls.js

// --- DOM Element References (ensure these are initialized in app.js or passed if needed) ---
// It's generally better to get these from app.js to avoid null issues if DOM isn't ready
// For example:
// let customHouseControlsContainer; (initialized in app.js and passed or queried via a method)

// --- Initialization & Event Listeners ---
export function setupEventListeners(handlers) {
    // General UI
    document.getElementById('toggleViewBtn').addEventListener('click', handlers.onToggleView);
    document.getElementById('zoomInBtn').addEventListener('click', () => handlers.onZoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => handlers.onZoomOut());
    document.getElementById('saveDesignBtn').addEventListener('click', handlers.onSaveDesign);
    document.getElementById('loadDesignBtn').addEventListener('click', handlers.onLoadDesign);
    document.getElementById('exportPngBtn').addEventListener('click', handlers.onExportPNG);
    document.getElementById('exportGltfBtn').addEventListener('click', handlers.onExportGLTF);
    document.getElementById('arPreviewBtn').addEventListener('click', handlers.onArPreview);
    document.getElementById('seasonSelector').addEventListener('change', handlers.onSeasonChange);
    document.getElementById('timeOfDaySlider').addEventListener('input', handlers.onTimeChange);
    document.getElementById('orientNorthBtn').addEventListener('click', handlers.onOrientNorth);


    document.querySelectorAll('.element').forEach(button => {
        button.addEventListener('click', (e) => {
            handlers.onAddElement(e.currentTarget.dataset.type);
        });
    });
    document.getElementById('addPlantBtn').addEventListener('click', handlers.onAddPlant);
    document.getElementById('addTreeBtn').addEventListener('click', handlers.onAddTree);
    document.getElementById('deleteElementBtn').addEventListener('click', handlers.onDeleteSelectedElement);
    
    const rotationInput = document.getElementById('elementRotationInput');
    if (rotationInput) {
        rotationInput.addEventListener('change', (e) => handlers.onElementRotationChange(e.target.value));
        rotationInput.addEventListener('input', (e) => handlers.onElementRotationChange(e.target.value, true)); // Live update
    }
    
    // Deselect on Escape key or click outside interactive areas
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (appContextRef && appContextRef.isDrawing && appContextRef.isDrawing()) {
                 // If drawing, Escape should cancel drawing (handled in app.js via specific cancel buttons for now)
            } else {
                handlers.onDeselectAll();
            }
        }
    });
     // More robust deselection might be needed, e.g., click on main canvas area not on an element.
     // This is partially handled by p5/three click handlers calling onElementSelect(null).

    // Lot Configuration UI
    document.getElementById('updateLotRectBtn').addEventListener('click', handlers.onUpdateLotRect);
    document.getElementById('drawLotShapeBtn').addEventListener('click', handlers.onDrawLotShape);
    document.getElementById('finishDrawingLotBtn').addEventListener('click', handlers.onFinishDrawingLot);
    document.getElementById('cancelDrawingLotBtn').addEventListener('click', handlers.onCancelDrawingLot);

    // Home Builder UI
    document.getElementById('activateHomeBuilderBtn').addEventListener('click', handlers.onActivateHomeBuilder);
    document.getElementById('finishHomeBuilderBtn').addEventListener('click', handlers.onFinishHomeBuilder);
    document.getElementById('cancelHomeBuilderBtn').addEventListener('click', handlers.onCancelHomeBuilder);

    // Custom House Controls
    document.getElementById('updateCustomHouseBtn').addEventListener('click', handlers.onUpdateCustomHouse);
    document.getElementById('customHouseHeightInput').addEventListener('change', handlers.onUpdateCustomHouse);
    document.getElementById('customHouseRoofTypeSelect').addEventListener('change', handlers.onUpdateCustomHouse);

}

// --- Modal Controls ---
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('flex');
}

export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('flex');
    if (modalId === 'welcomeModal') localStorage.setItem('visitedVerdantVision', 'true');
}

// --- View Toggling ---
export function toggleView(currentView, p5Container, threeContainer, toggleBtn) {
    if (currentView === '2D') {
        p5Container.classList.add('hidden');
        threeContainer.classList.remove('hidden');
        toggleBtn.innerHTML = '<i class="fas fa-ruler-combined mr-1"></i>3D View';
        return '3D';
    } else {
        threeContainer.classList.add('hidden');
        p5Container.classList.remove('hidden');
        toggleBtn.innerHTML = '<i class="fas fa-cube mr-1"></i>2D View';
        return '2D';
    }
}

// --- Element Information Panel ---
export function showElementInfo(element, plantLibrary, customHouseData) {
    const infoContent = document.getElementById('elementInfoContent');
    const deleteBtn = document.getElementById('deleteElementBtn');
    const rotationControls = document.getElementById('rotationControlContainer');
    const rotationInput = document.getElementById('elementRotationInput');
    const customHouseControls = document.getElementById('customHouseControlsContainer');


    if (element) {
        let detailsHtml = `<strong class="text-gray-800">${element.name || element.type}</strong><br>`;
        detailsHtml += `ID: ${element.id}<br>`;
        detailsHtml += `Type: ${element.type}<br>`;
        detailsHtml += `Position (ft): X: ${element.x.toFixed(1)}, Y: ${element.y.toFixed(1)}<br>`;
        if (element.width && element.depth) {
            detailsHtml += `Size (ft): W: ${element.width.toFixed(1)}, D: ${element.depth.toFixed(1)}`;
            if (element.height) detailsHtml += `, H: ${element.height.toFixed(1)}`;
            detailsHtml += `<br>`;
        }
        if (element.rotation !== undefined) {
            detailsHtml += `Rotation: ${element.rotation}°<br>`;
        }

        if (element.isPlant && element.data && plantLibrary) {
            const plantInfo = plantLibrary.find(p => p.id === element.data.id);
            if (plantInfo) {
                detailsHtml += `Variety: ${plantInfo.name}<br>`;
                if (plantInfo.description) detailsHtml += `Desc: ${plantInfo.description}<br>`;
            }
        } else if (element.isTree && element.data) {
             detailsHtml += `Species: ${element.data.displayName || element.data.species}<br>`;
             detailsHtml += `Season: ${element.data.currentSeason || 'N/A'}<br>`;
        } else if (element.type === 'custom_house' && customHouseData) {
            detailsHtml += `Roof: ${customHouseData.roofType}<br>`;
            showCustomHouseControls(customHouseData.height, customHouseData.roofType);
        } else {
            hideCustomHouseControls();
        }


        infoContent.innerHTML = detailsHtml;
        deleteBtn.classList.remove('hidden');
        
        if (appContextRef && appContextRef.ROTATABLE_ELEMENT_TYPES && appContextRef.ROTATABLE_ELEMENT_TYPES.includes(element.type)) {
            rotationInput.value = Math.round(element.rotation || 0);
            rotationControls.classList.remove('hidden');
        } else {
            rotationControls.classList.add('hidden');
        }

    } else {
        infoContent.innerHTML = "Select an element to see its details.";
        deleteBtn.classList.add('hidden');
        rotationControls.classList.add('hidden');
        hideCustomHouseControls();
    }
    document.getElementById('infoPanel').classList.remove('hidden');
}


// --- Plant & Tree Selectors ---
export function populatePlantSelector(plantLibrary, selectorElement) {
    if (!plantLibrary || !selectorElement) return;
    plantLibrary.forEach(plant => {
        const option = document.createElement('option');
        option.value = plant.id;
        option.textContent = plant.name;
        selectorElement.appendChild(option);
    });
}
// Tree selector is populated in app.js using treeManifest

// --- Time of Day UI ---
export function updateTimeOfDayLabel(hour, labelElement) {
    if (!labelElement) return;
    const amPm = hour < 12 || hour === 24 ? 'AM' : 'PM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    labelElement.textContent = `${displayHour}:00 ${amPm}`;
}


// --- Lot and Home Builder UI Updates ---
export function updateLotConfigUI(width, depth, isDrawingLot) {
    const lotWidthInput = document.getElementById('lotWidthInput');
    const lotDepthInput = document.getElementById('lotDepthInput');
    const updateLotRectBtn = document.getElementById('updateLotRectBtn');
    const drawLotShapeBtn = document.getElementById('drawLotShapeBtn');
    const finishDrawingLotBtn = document.getElementById('finishDrawingLotBtn');
    const cancelDrawingLotBtn = document.getElementById('cancelDrawingLotBtn');

    if (isDrawingLot) {
        lotWidthInput.disabled = true;
        lotDepthInput.disabled = true;
        updateLotRectBtn.classList.add('hidden');
        drawLotShapeBtn.classList.add('hidden');
        finishDrawingLotBtn.classList.remove('hidden');
        cancelDrawingLotBtn.classList.remove('hidden');
    } else {
        lotWidthInput.disabled = false;
        lotDepthInput.disabled = false;
        if (width) lotWidthInput.value = parseFloat(width).toFixed(1);
        if (depth) lotDepthInput.value = parseFloat(depth).toFixed(1);
        updateLotRectBtn.classList.remove('hidden');
        drawLotShapeBtn.classList.remove('hidden');
        finishDrawingLotBtn.classList.add('hidden');
        cancelDrawingLotBtn.classList.add('hidden');
    }
}

export function updateHomeBuilderUI(isDrawingHouse) {
    const activateHomeBuilderBtn = document.getElementById('activateHomeBuilderBtn');
    const finishHomeBuilderBtn = document.getElementById('finishHomeBuilderBtn');
    const cancelHomeBuilderBtn = document.getElementById('cancelHomeBuilderBtn');

    if (isDrawingHouse) {
        activateHomeBuilderBtn.classList.add('hidden');
        finishHomeBuilderBtn.classList.remove('hidden');
        cancelHomeBuilderBtn.classList.remove('hidden');
    } else {
        activateHomeBuilderBtn.classList.remove('hidden');
        finishHomeBuilderBtn.classList.add('hidden');
        cancelHomeBuilderBtn.classList.add('hidden');
    }
}


export function showDrawingInstructions(element, mode) {
    if (!element) return;
    let text = "Click to place points. Right-click or press 'Escape' to cancel. Press 'Enter' or click 'Finish' button to complete.";
    if (mode === 'lot_polygon') text = "Drawing Lot: " + text;
    else if (mode === 'home_builder_polygon') text = "Drawing House: " + text;
    element.textContent = text;
    element.classList.remove('hidden');
}

export function hideDrawingInstructions(element) {
    if (element) element.classList.add('hidden');
}

export function showCustomHouseControls(height, roofType) {
    const container = document.getElementById('customHouseControlsContainer');
    const heightInput = document.getElementById('customHouseHeightInput');
    const roofSelect = document.getElementById('customHouseRoofTypeSelect');
    if (container && heightInput && roofSelect) {
        heightInput.value = height;
        roofSelect.value = roofType;
        container.classList.remove('hidden');
    }
}

export function hideCustomHouseControls() {
    const container = document.getElementById('customHouseControlsContainer');
    if (container) {
        container.classList.add('hidden');
    }
}


// --- Context for App.js (Optional, if ui-controls needs to access app state directly) ---
let appContextRef = null; 
export function setAppContextForUiControls(context) {
    appContextRef = context;
}