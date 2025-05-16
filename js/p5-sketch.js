// js/p5-sketch.js
// Handles all p5.js related logic for the 2D planning view.

// --- Module-level Variables ---
let p5Instance; 
let p5Canvas;  

let config = {
    lotWidthFt: 173.2, lotDepthFt: 173.2, initialPixelsPerFoot: 10, defaultVisibleAreaFt: 80,
    elementsRef: () => [], onElementSelect: () => {}, onElementMove: () => {},
    getScale: () => 1.0, getPanOffset: () => ({ x: 0, y: 0 })
};

let currentZoomScaleP5 = 1.0;
let currentPanOffsetP5 = { x: 0, y: 0 }; 

const GRID_SIZE_FT = 1; 

let selectedP5ElementData = null; 
let isDraggingP5 = false;
let dragStartMouseP5 = { x:0, y:0 };    
let dragStartElementPosFt = { x:0, y:0 }; 

let appContextRefP5 = null;
export function setAppContextForP5(context) {
    appContextRefP5 = context;
}

// --- Initialization ---
export function initP5Sketch(sketch, appConfig) {
    p5Instance = sketch;
    Object.assign(config, appConfig); 

    p5Instance.setup = () => {
        const canvasWidth = config.defaultVisibleAreaFt * config.initialPixelsPerFoot;
        const canvasHeight = config.defaultVisibleAreaFt * config.initialPixelsPerFoot;
        p5Canvas = p5Instance.createCanvas(canvasWidth, canvasHeight);
        if (p5Instance.canvas && p5Instance.canvas.parentElement) {
             p5Canvas.parent(p5Instance.canvas.parentElement); 
        } else { console.error("p5 canvas parent container not found."); } // Keep critical error
        p5Instance.pixelDensity(1); 
        p5Instance.noLoop(); 
        p5Instance.rectMode(p5Instance.CENTER);

        if (p5Canvas) {
            p5Canvas.mousePressed(handleP5MousePressed);
            p5Canvas.mouseReleased(handleP5MouseReleased);
            p5Instance.mouseDragged = handleP5MouseDragged; 
            p5Canvas.elt.addEventListener('contextmenu', (e) => e.preventDefault());
        }
        redrawP5(p5Instance); 
    };

    p5Instance.draw = () => {
        if (!p5Instance) return;
        currentZoomScaleP5 = config.getScale();
        currentPanOffsetP5 = config.getPanOffset(); 

        p5Instance.background(235, 245, 230); 
        p5Instance.push(); 
        p5Instance.translate(p5Canvas.width / 2, p5Canvas.height / 2);
        p5Instance.scale(currentZoomScaleP5);
        p5Instance.translate(-currentPanOffsetP5.x * config.initialPixelsPerFoot, -currentPanOffsetP5.y * config.initialPixelsPerFoot);
        p5Instance.translate(-config.lotWidthFt * config.initialPixelsPerFoot / 2, -config.lotDepthFt * config.initialPixelsPerFoot / 2);
        
        drawP5Grid(config.initialPixelsPerFoot);
        drawP5LotBoundary(config.initialPixelsPerFoot);

        const elementsToDraw = config.elementsRef();
        const currentSelectedAppElement = appContextRefP5?.selectedElement ? appContextRefP5.selectedElement() : null;

        elementsToDraw.forEach(el => {
            drawP5Element(el, config.initialPixelsPerFoot, currentSelectedAppElement);
        });
        p5Instance.pop(); 
    };
}

// --- Drawing Functions ---
export function redrawP5(sketch = p5Instance) {
    if (sketch && sketch._setupDone) { 
         sketch.redraw();
    } else if (sketch && !sketch._setupDone) {
        // This warning can be noisy during initial load.
        // console.warn("p5.redraw called before setup completed."); 
    }
}

function drawP5Grid(pxPerFtUnit) {
    p5Instance.stroke(190, 210, 180); 
    p5Instance.strokeWeight(0.5 / currentZoomScaleP5); 
    const totalWidthPx = config.lotWidthFt * pxPerFtUnit;
    const totalHeightPx = config.lotDepthFt * pxPerFtUnit;
    for (let xFt = 0; xFt <= config.lotWidthFt; xFt += GRID_SIZE_FT) {
        const xPx = xFt * pxPerFtUnit; p5Instance.line(xPx, 0, xPx, totalHeightPx);
    }
    for (let yFt = 0; yFt <= config.lotDepthFt; yFt += GRID_SIZE_FT) {
        const yPx = yFt * pxPerFtUnit; p5Instance.line(0, yPx, totalWidthPx, yPx);
    }
}

function drawP5LotBoundary(pxPerFtUnit) {
    p5Instance.noFill(); p5Instance.stroke(70, 100, 60); 
    p5Instance.strokeWeight(2.5 / currentZoomScaleP5);
    p5Instance.rectMode(p5Instance.CORNER); 
    p5Instance.rect(0, 0, config.lotWidthFt * pxPerFtUnit, config.lotDepthFt * pxPerFtUnit);
    p5Instance.rectMode(p5Instance.CENTER); 

    p5Instance.fill(60, 90, 50); p5Instance.noStroke();
    const baseTextSize = 12; const textSize = Math.max(6, baseTextSize / currentZoomScaleP5);
    p5Instance.textSize(textSize); p5Instance.textAlign(p5Instance.LEFT, p5Instance.TOP);
    const textX = (5 / currentZoomScaleP5); const textY = (5 / currentZoomScaleP5);
    p5Instance.text("7424 Cindy Dr, McCordsville, IN (Zone 6a)", textX, textY);
    const visibleWidthFt = (p5Canvas.width / (config.initialPixelsPerFoot * currentZoomScaleP5));
    const visibleHeightFt = (p5Canvas.height / (config.initialPixelsPerFoot * currentZoomScaleP5));
    p5Instance.text(`View: ~${visibleWidthFt.toFixed(0)}'x${visibleHeightFt.toFixed(0)}' (Zoom:${currentZoomScaleP5.toFixed(2)}x)`, textX, textY + textSize * 1.3);
}

function drawP5Element(element, pxPerFtUnit, currentSelectedAppElement) {
    p5Instance.push(); 
    const elCenterX_px = (element.x + element.width / 2) * pxPerFtUnit;
    const elCenterY_px = (element.y + element.depth / 2) * pxPerFtUnit;
    const elW_px = element.width * pxPerFtUnit;
    const elD_px = element.depth * pxPerFtUnit;

    p5Instance.translate(elCenterX_px, elCenterY_px);
    if (element.rotation && appContextRefP5 && appContextRefP5.ROTATABLE_ELEMENT_TYPES && appContextRefP5.ROTATABLE_ELEMENT_TYPES.includes(element.type)) {
        p5Instance.rotate(p5Instance.radians(element.rotation));
    }

    p5Instance.strokeWeight(1 / currentZoomScaleP5); 
    p5Instance.stroke(50, 70, 40); 

    if (currentSelectedAppElement && element.id === currentSelectedAppElement.id) {
        p5Instance.stroke(0, 120, 255, 220); 
        p5Instance.strokeWeight(3 / currentZoomScaleP5);
        p5Instance.fill(0, 120, 255, 40); 
    } else { p5Instance.noFill(); }

    let label = element.type.substring(0,1).toUpperCase();
    let specificColor;

    switch (element.type) {
        case 'house': specificColor = [190, 190, 210, 230]; label = "H"; break;
        case 'shed': specificColor = [160, 130, 110, 230]; label = "S"; break;
        case 'raised_bed': specificColor = [200, 170, 130, 210]; label = "RB"; break;
        case 'inground_row': specificColor = [130, 90, 60, 190]; label = "IR"; break;
        case 'compost_bin': specificColor = [110, 80, 60, 210]; label = "CB"; break;
        case 'tree':
            p5Instance.fill(34, 139, 34, 150); 
            p5Instance.ellipse(0, 0, elW_px, elD_px); 
            p5Instance.fill(120, 80, 40, 200); 
            const trunkScale = Math.max(4, 8 / currentZoomScaleP5);
            p5Instance.ellipse(0, 0, elW_px / trunkScale, elD_px / trunkScale); 
            label = element.data.species ? element.data.species.substring(0,2).toUpperCase() : "Tr";
            specificColor = [0,0,0,0]; 
            break;
        case 'plant':
            const plantBaseColor = element.data?.color || [144, 238, 144];
            specificColor = [...plantBaseColor, 190];
            label = element.data.name ? element.data.name.substring(0,1).toUpperCase() : "P";
            p5Instance.fill(specificColor[0], specificColor[1], specificColor[2], specificColor[3]);
            p5Instance.ellipse(0, 0, elW_px, elD_px); 
            specificColor = [0,0,0,0]; 
            break;
        default: specificColor = [220, 220, 220, 180]; 
    }

    if (specificColor && specificColor[3] > 0 && element.type !== 'tree' && element.type !== 'plant') {
        p5Instance.fill(specificColor[0], specificColor[1], specificColor[2], specificColor[3]);
        p5Instance.rect(0, 0, elW_px, elD_px); 
    } else if (element.type !== 'tree' && element.type !== 'plant') {
        p5Instance.noFill();
        p5Instance.rect(0, 0, elW_px, elD_px);
    }

    if (elW_px * currentZoomScaleP5 > 20 && elD_px * currentZoomScaleP5 > 20) {
        p5Instance.push(); 
        if (element.rotation && appContextRefP5 && appContextRefP5.ROTATABLE_ELEMENT_TYPES && appContextRefP5.ROTATABLE_ELEMENT_TYPES.includes(element.type)) {
            p5Instance.rotate(-p5Instance.radians(element.rotation)); 
        }
        p5Instance.fill(30, 30, 30, 220); 
        p5Instance.noStroke();
        p5Instance.textAlign(p5Instance.CENTER, p5Instance.CENTER);
        const labelTextSize = Math.max(6, Math.min(10, 12 / currentZoomScaleP5 * (currentZoomScaleP5 / 0.4)));
        p5Instance.textSize(labelTextSize);
        p5Instance.text(label, 0, 0); 
        p5Instance.pop();
    }
    p5Instance.pop(); 
}

// --- Canvas Interaction: Mouse Events ---
function p5CanvasToLotCoords(mouseX_canvas, mouseY_canvas) {
    let x_lot = mouseX_canvas; let y_lot = mouseY_canvas;
    x_lot -= p5Canvas.width / 2; y_lot -= p5Canvas.height / 2;
    x_lot /= currentZoomScaleP5; y_lot /= currentZoomScaleP5;
    x_lot += currentPanOffsetP5.x * config.initialPixelsPerFoot;
    y_lot += currentPanOffsetP5.y * config.initialPixelsPerFoot;
    x_lot += config.lotWidthFt * config.initialPixelsPerFoot / 2;
    y_lot += config.lotDepthFt * config.initialPixelsPerFoot / 2;
    x_lot /= config.initialPixelsPerFoot; y_lot /= config.initialPixelsPerFoot;
    return { x: x_lot, y: y_lot };
}

function handleP5MousePressed() {
    if (!p5Instance || !p5Canvas) return;
    if (p5Instance.mouseX < 0 || p5Instance.mouseX > p5Canvas.width || p5Instance.mouseY < 0 || p5Instance.mouseY > p5Canvas.height) return;
    const lotMouseCoords = p5CanvasToLotCoords(p5Instance.mouseX, p5Instance.mouseY);
    const elementsToCheck = config.elementsRef();
    let newlySelectedElement = null;

    for (let i = elementsToCheck.length - 1; i >= 0; i--) {
        const el = elementsToCheck[i];
        if (lotMouseCoords.x >= el.x && lotMouseCoords.x <= el.x + el.width &&
            lotMouseCoords.y >= el.y && lotMouseCoords.y <= el.y + el.depth) {
            newlySelectedElement = el; break;
        }
    }
    if (newlySelectedElement) {
        selectedP5ElementData = newlySelectedElement; isDraggingP5 = true;
        dragStartMouseP5 = { x: p5Instance.mouseX, y: p5Instance.mouseY };
        dragStartElementPosFt = { x: selectedP5ElementData.x, y: selectedP5ElementData.y };
        if (config.onElementSelect) config.onElementSelect(selectedP5ElementData.id, '2D');
    } else {
        selectedP5ElementData = null; isDraggingP5 = false;
        if (config.onElementSelect) config.onElementSelect(null, '2D');
    }
    redrawP5(p5Instance);
}

function handleP5MouseDragged() {
    if (isDraggingP5 && selectedP5ElementData) {
        const currentLotMouseCoords = p5CanvasToLotCoords(p5Instance.mouseX, p5Instance.mouseY);
        const dragStartLotMouseCoords = p5CanvasToLotCoords(dragStartMouseP5.x, dragStartMouseP5.y);
        let deltaX_ft = currentLotMouseCoords.x - dragStartLotMouseCoords.x;
        let deltaY_ft = currentLotMouseCoords.y - dragStartLotMouseCoords.y;
        let newElementX_ft = dragStartElementPosFt.x + deltaX_ft;
        let newElementY_ft = dragStartElementPosFt.y + deltaY_ft;
        newElementX_ft = Math.round(newElementX_ft / GRID_SIZE_FT) * GRID_SIZE_FT;
        newElementY_ft = Math.round(newElementY_ft / GRID_SIZE_FT) * GRID_SIZE_FT;
        newElementX_ft = Math.max(0, Math.min(newElementX_ft, config.lotWidthFt - selectedP5ElementData.width));
        newElementY_ft = Math.max(0, Math.min(newElementY_ft, config.lotDepthFt - selectedP5ElementData.depth));
        if (selectedP5ElementData.x !== newElementX_ft || selectedP5ElementData.y !== newElementY_ft) {
            if (config.onElementMove) {
                config.onElementMove(selectedP5ElementData.id, newElementX_ft, newElementY_ft);
            }
            redrawP5(p5Instance);
        }
    }
}

function handleP5MouseReleased() {
    if (isDraggingP5) { isDraggingP5 = false; redrawP5(p5Instance); }
}

export function getP5Canvas() { return p5Canvas ? p5Canvas.elt : null; }

export function p5handleZoom(zoomIn, currentAppScale) {
    const scaleFactor = 1.18; 
    let newScale = zoomIn ? currentAppScale * scaleFactor : currentAppScale / scaleFactor;
    newScale = Math.max(0.15, Math.min(newScale, 12));
    return newScale;
}

export function p5handlePan(deltaXFt, deltaYFt, currentAppPanOffset) {
    let newPanX = currentAppPanOffset.x + deltaXFt;
    let newPanY = currentAppPanOffset.y + deltaYFt;
    const maxPanMagnitudeX = config.lotWidthFt / 1.8;
    const maxPanMagnitudeY = config.lotDepthFt / 1.8;
    newPanX = Math.max(-maxPanMagnitudeX, Math.min(newPanX, maxPanMagnitudeX));
    newPanY = Math.max(-maxPanMagnitudeY, Math.min(newPanY, maxPanMagnitudeY));
    return { x: newPanX, y: newPanY };
}
