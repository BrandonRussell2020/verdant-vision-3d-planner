// js/ui-controls.js
// Handles UI interactions, populating selectors, modals, and general event listeners.

// --- DOM Element References ---
const plantSelectorElement = document.getElementById('plantSelector');
const treeSpeciesSelectorElement = document.getElementById('treeSpeciesSelector');
const addPlantBtn = document.getElementById('addPlantBtn');
const addTreeBtn = document.getElementById('addTreeBtn');

const toggleViewBtnElement = document.getElementById('toggleViewBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');

const saveDesignBtn = document.getElementById('saveDesignBtn');
const loadDesignBtn = document.getElementById('loadDesignBtn');
const exportPngBtn = document.getElementById('exportPngBtn');
const exportGltfBtn = document.getElementById('exportGltfBtn');
const arPreviewBtn = document.getElementById('arPreviewBtn');

const seasonSelectorElement = document.getElementById('seasonSelector');
const timeOfDaySliderElement = document.getElementById('timeOfDaySlider');
const timeOfDayValueElement = document.getElementById('timeOfDayValue');

const infoPanelElement = document.getElementById('infoPanel');
const elementInfoContentElement = document.getElementById('elementInfoContent');
const deleteElementBtn = document.getElementById('deleteElementBtn');
const rotationControlContainer = document.getElementById('rotationControlContainer');
const elementRotationInput = document.getElementById('elementRotationInput');
const orientNorthBtn = document.getElementById('orientNorthBtn');

// --- Modal Handling ---
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        console.warn(`Modal with ID "${modalId}" not found.`); // Keep as warning
    }
}

export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    } else {
        console.warn(`Modal with ID "${modalId}" not found.`); // Keep as warning
    }
}

// --- Populating Selectors ---
export function populatePlantSelector(plantLibrary, selectorEl = plantSelectorElement) {
    if (!selectorEl || !plantLibrary) {
        // console.warn("Plant selector or library not provided."); // Can be noisy if called before DOM ready
        return;
    }
    while (selectorEl.options.length > 1) {
        selectorEl.remove(1);
    }
    plantLibrary.forEach(plant => {
        const option = document.createElement('option');
        option.value = plant.id;
        option.textContent = plant.name;
        selectorEl.appendChild(option);
    });
}

export function populateTreeSelector(treeManifest, selectorEl = treeSpeciesSelectorElement) {
    if (!selectorEl || !treeManifest) {
        // console.warn("Tree selector or manifest not provided."); // Can be noisy
        return;
    }
     while (selectorEl.options.length > 0) {
        selectorEl.remove(0);
    }
    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.textContent = "-- Select Tree --";
    selectorEl.appendChild(defaultOption);
    for (const key in treeManifest) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = treeManifest[key].displayName;
        selectorEl.appendChild(option);
    }
}


// --- Event Listener Setup ---
export function setupEventListeners(callbacks) {
    if (toggleViewBtnElement) toggleViewBtnElement.addEventListener('click', callbacks.onToggleView);

    const genericElementButtons = document.querySelectorAll('button.element');
    genericElementButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const targetButton = event.currentTarget; 
            const elementType = targetButton.dataset.type;
            if (elementType && callbacks.onAddElement) {
                callbacks.onAddElement(elementType);
            }
        });
    });

    if (addPlantBtn && callbacks.onAddPlant) addPlantBtn.addEventListener('click', callbacks.onAddPlant);
    if (addTreeBtn && callbacks.onAddTree) addTreeBtn.addEventListener('click', callbacks.onAddTree);

    if (zoomInBtn && callbacks.onZoomIn) zoomInBtn.addEventListener('click', callbacks.onZoomIn);
    if (zoomOutBtn && callbacks.onZoomOut) zoomOutBtn.addEventListener('click', callbacks.onZoomOut);
    
    if (saveDesignBtn && callbacks.onSaveDesign) saveDesignBtn.addEventListener('click', callbacks.onSaveDesign);
    if (loadDesignBtn && callbacks.onLoadDesign) loadDesignBtn.addEventListener('click', callbacks.onLoadDesign);

    if (exportPngBtn && callbacks.onExportPNG) exportPngBtn.addEventListener('click', callbacks.onExportPNG);
    if (exportGltfBtn && callbacks.onExportGLTF) exportGltfBtn.addEventListener('click', callbacks.onExportGLTF);
    if (arPreviewBtn && callbacks.onArPreview) arPreviewBtn.addEventListener('click', callbacks.onArPreview);

    if (seasonSelectorElement && callbacks.onSeasonChange) seasonSelectorElement.addEventListener('change', callbacks.onSeasonChange);
    if (timeOfDaySliderElement && callbacks.onTimeChange) timeOfDaySliderElement.addEventListener('input', callbacks.onTimeChange);
    if (deleteElementBtn && callbacks.onDeleteSelectedElement) deleteElementBtn.addEventListener('click', callbacks.onDeleteSelectedElement);

    if (elementRotationInput && callbacks.onElementRotationChange) {
        elementRotationInput.addEventListener('change', (event) => { 
            callbacks.onElementRotationChange(parseFloat(event.target.value));
        });
         elementRotationInput.addEventListener('input', (event) => { 
            callbacks.onElementRotationChange(parseFloat(event.target.value), true); 
        });
    }

    if (orientNorthBtn && callbacks.onOrientNorth) {
        orientNorthBtn.addEventListener('click', callbacks.onOrientNorth);
    }

    document.addEventListener('keydown', (event) => {
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

        if (isInputFocused && event.key !== 'Escape') return;

        const panStep = 5;
        switch (event.key) {
            case 'ArrowLeft': if (callbacks.onPan) { callbacks.onPan(-panStep, 0); event.preventDefault(); } break;
            case 'ArrowRight': if (callbacks.onPan) { callbacks.onPan(panStep, 0); event.preventDefault(); } break;
            case 'ArrowUp': if (callbacks.onPan) { callbacks.onPan(0, -panStep); event.preventDefault(); } break;
            case 'ArrowDown': if (callbacks.onPan) { callbacks.onPan(0, panStep); event.preventDefault(); } break;
            case '+': case '=': if (callbacks.onZoomIn) { callbacks.onZoomIn(); event.preventDefault(); } break;
            case '-': case '_': if (callbacks.onZoomOut) { callbacks.onZoomOut(); event.preventDefault(); } break;
            case 'Delete': case 'Backspace': 
                if (callbacks.onDeleteSelectedElement && !isInputFocused) {
                    callbacks.onDeleteSelectedElement();
                    event.preventDefault(); 
                }
                break;
            case 'Escape': if (callbacks.onDeselectAll) callbacks.onDeselectAll(); break;
        }
    });
}

// --- Displaying Element Information ---
const ROTATABLE_ELEMENT_TYPES_UI = ['house', 'shed', 'raised_bed', 'compost_bin', 'bench', 'patio', 'fire_pit', 'rain_barrel']; 

export function showElementInfo(element, plantList = []) {
    if (!infoPanelElement || !elementInfoContentElement || !deleteElementBtn || !rotationControlContainer || !elementRotationInput) {
        // console.warn("One or more Info panel UI elements not found for showElementInfo."); // Can be noisy
        return;
    }

    if (element) {
        infoPanelElement.classList.remove('hidden');
        infoPanelElement.classList.add('md:block');
        deleteElementBtn.classList.remove('hidden');

        let html = `<h4 class="font-bold text-gray-800">${element.name || element.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (ID: ${element.id})</h4>`;
        html += `<p class="text-xs text-gray-500">Type: ${element.type.replace(/_/g, ' ')}</p>`;
        html += `<p>Position: X: ${element.x.toFixed(1)}ft, Y: ${element.y.toFixed(1)}ft</p>`;
        html += `<p>Size: W: ${element.width.toFixed(1)}ft, D: ${element.depth.toFixed(1)}ft, H: ${element.height.toFixed(1)}ft</p>`;

        if (ROTATABLE_ELEMENT_TYPES_UI.includes(element.type)) {
            rotationControlContainer.classList.remove('hidden');
            elementRotationInput.value = element.rotation || 0;
        } else {
            rotationControlContainer.classList.add('hidden');
        }

        if (element.isPlant && element.data) {
            const plantDetails = plantList.find(p => p.id === element.data.id) || element.data;
            html += `<p>Plant: ${plantDetails.name || 'N/A'}</p>`;
            if (plantDetails.sun) html += `<p><i class="fas fa-sun mr-1 text-yellow-500"></i>Sun: ${plantDetails.sun}</p>`;
            if (plantDetails.soil) html += `<p><i class="fas fa-spa mr-1 text-yellow-700"></i>Soil: ${plantDetails.soil}</p>`;
            if (plantDetails.watering) html += `<p><i class="fas fa-tint mr-1 text-blue-500"></i>Watering: ${plantDetails.watering}</p>`;
            if (plantDetails.notes) html += `<p class="mt-1 text-xs italic text-gray-500">Note: ${plantDetails.notes}</p>`;
        } else if (element.isTree && element.data) {
            html += `<p>Species: ${element.data.displayName || element.data.species?.replace(/_/g, ' ') || 'N/A'}</p>`;
            html += `<p>Set Height: ${element.data.height?.toFixed(1)}ft, Canopy: ${element.data.canopy?.toFixed(1)}ft</p>`;
            if (element.data.currentSeason) html += `<p>Season Display: ${element.data.currentSeason.replace(/\b\w/g, l => l.toUpperCase())}</p>`;
        }
        
        elementInfoContentElement.innerHTML = html;
    } else {
        elementInfoContentElement.innerHTML = 'Select an element to see its details, or click an empty area to deselect.';
        deleteElementBtn.classList.add('hidden');
        rotationControlContainer.classList.add('hidden');
    }
}

// --- View Toggling ---
export function toggleView(currentView, p5Container, threeContainer, toggleButton) {
    let newView = currentView;
    if (currentView === '2D') {
        if (p5Container) p5Container.classList.add('hidden');
        if (threeContainer) threeContainer.classList.remove('hidden');
        if (toggleButton) toggleButton.innerHTML = '<i class="fas fa-ruler-combined mr-1"></i>3D View';
        newView = '3D';
    } else {
        if (threeContainer) threeContainer.classList.add('hidden');
        if (p5Container) p5Container.classList.remove('hidden');
        if (toggleButton) toggleButton.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>2D View';
        newView = '2D';
    }
    // console.log("View toggled to:", newView); // Debug
    window.dispatchEvent(new Event('resize'));
    return newView;
}

// --- Time of Day Label Update ---
export function updateTimeOfDayLabel(hour, labelElement = timeOfDayValueElement) {
    if (!labelElement) return;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    labelElement.textContent = `${displayHour}:00 ${ampm}`;
}
