// js/p5-sketch.js
// Handles all p5.js related logic for the 2D planning view.

// --- Module-level Variables ---
let p5Instance; 
let p5Canvas;  

let config = {
    lotConfigRef: () => ({ width: 173.2, depth: 173.2, isCustomShape: false, customShapePoints: [] }), // Default
    elementsRef: () => [],
    customHouseRef: () => null,
    onElementSelect: () => {},
    onElementMove: () => {},
    getScale: () => 1.0,
    getPanOffset: () => ({ x: 0, y: 0 }),
    onPolygonVertexAdd: (point, mode) => {},
    onDrawingModeChange: (isActive, mode) => {}
};

let currentZoomScaleP5 = 1.0;
let currentPanOffsetP5 = { x: 0, y: 0 }; 

const GRID_SIZE_FT = 1; 
const PIXELS_PER_FOOT_P5 = 10; // Base scale for 1ft = 10px in p5 world units

let selectedP5ElementData = null; 
let isDraggingP5 = false;
let dragStartMouseP5 = { x:0, y:0 };    
let dragStartElementPosFt = { x:0, y:0 }; 

// Drawing mode state
let isInDrawingModeP5 = false;
let currentDrawingPolygonTypeP5 = null; // 'lot_polygon' or 'home_builder_polygon'
// let currentPolygonPointsP5 = []; // Points in canvas pixel coordinates for drawing - REMOVED, use currentPolygonPointsFt
let currentPolygonPointsFt = []; // Points in lot feet coordinates for logic
let mousePreviewLineP5 = null; // For drawing line to cursor {x1Ft, y1Ft, x2Ft, y2Ft}
let hoverSnapPointFt = null; // For showing snap point on hover {x, y} in Ft
let isShapeClosedP5 = false;
let isShapeValidPreviewP5 = true; // For visual feedback on polygon validity

let appContextRefP5 = null;
export function setAppContextForP5(context) {
    appContextRefP5 = context;
}

export function getLotConfigP5() {
    return config.lotConfigRef();
}
export function setLotConfigP5(newLotConfig) {
    if (config.lotConfigRef) { // Ensure it's initialized
        const ref = config.lotConfigRef();
        Object.assign(ref, newLotConfig);
    }
}

// --- Initialization ---
export function initP5Sketch(sketch, appConfig) {
    p5Instance = sketch;
    Object.assign(config, appConfig); 

    p5Instance.setup = () => {
        const lotCfg = config.lotConfigRef();
        const initialVisibleAreaFt = 80; // How many feet across the canvas is initially visible
        const canvasWidth = Math.max(600, lotCfg.width * PIXELS_PER_FOOT_P5 / (PIXELS_PER_FOOT_P5 / config.getScale()) || 800);
        const canvasHeight = Math.max(500, lotCfg.depth * PIXELS_PER_FOOT_P5 / (PIXELS_PER_FOOT_P5 / config.getScale()) || 600);

        // Ensure canvas fits within its container
        const container = p5CanvasContainer; // Assuming p5CanvasContainer is globally available or passed in
        const availableWidth = container.clientWidth;
        const availableHeight = container.clientHeight;

        p5Canvas = p5Instance.createCanvas(availableWidth, availableHeight);

        if (p5Instance.canvas && p5Instance.canvas.parentElement) {
             p5Canvas.parent(p5Instance.canvas.parentElement); 
        } else { console.error("p5 canvas parent container not found."); }
        p5Instance.pixelDensity(1); 
        p5Instance.noLoop(); 
        p5Instance.rectMode(p5Instance.CENTER);

        if (p5Canvas) {
            p5Canvas.mousePressed(handleP5MousePressed);
            p5Canvas.mouseReleased(handleP5MouseReleased);
            p5Instance.mouseDragged = handleP5MouseDragged; 
            p5Canvas.elt.addEventListener('contextmenu', (e) => e.preventDefault());
            p5Canvas.elt.addEventListener('mousemove', handleP5MouseMoveForDrawing); // For preview line & hover snap point
        }
        redrawP5(p5Instance); 
    };

    p5Instance.draw = () => {
        if (!p5Instance) return;
        currentZoomScaleP5 = config.getScale();
        currentPanOffsetP5 = config.getPanOffset(); 
        const lotCfg = config.lotConfigRef();

        p5Instance.background(235, 245, 230); 
        p5Instance.push(); 
        
        // Center of the canvas is the view's origin
        p5Instance.translate(p5Canvas.width / 2, p5Canvas.height / 2);
        p5Instance.scale(currentZoomScaleP5);
        
        // Apply pan (pan offset is in feet, convert to pixels)
        p5Instance.translate(-currentPanOffsetP5.x * PIXELS_PER_FOOT_P5, -currentPanOffsetP5.y * PIXELS_PER_FOOT_P5);

        // The "world" origin (0,0 in feet) should be at the center of the lot.
        // If custom shape, calculate lot center dynamically.
        let lotCenterXFt, lotCenterYFt;
        if (lotCfg.isCustomShape && lotCfg.customShapePoints.length > 0) {
            const bounds = getPolygonBoundsFt(lotCfg.customShapePoints);
            lotCenterXFt = bounds.minX + bounds.width / 2;
            lotCenterYFt = bounds.minY + bounds.height / 2;
        } else {
            lotCenterXFt = lotCfg.width / 2;
            lotCenterYFt = lotCfg.depth / 2;
        }
        p5Instance.translate(-lotCenterXFt * PIXELS_PER_FOOT_P5, -lotCenterYFt * PIXELS_PER_FOOT_P5);
        
        drawP5Grid();
        drawP5LotBoundary();

        const elementsToDraw = config.elementsRef();
        const currentSelectedAppElement = appContextRefP5?.selectedElement ? appContextRefP5.selectedElement() : null;
        const currentCustomHouse = config.customHouseRef ? config.customHouseRef() : null;

        elementsToDraw.forEach(el => {
            drawP5Element(el, PIXELS_PER_FOOT_P5, currentSelectedAppElement);
        });

        if (currentCustomHouse) {
            drawP5CustomHouse(currentCustomHouse, PIXELS_PER_FOOT_P5, currentSelectedAppElement);
        }
        
        // Drawing mode visual feedback
        if (isInDrawingModeP5) {
            if (hoverSnapPointFt) {
                p5Instance.push();
                p5Instance.fill(0, 100, 255, 100); // Semi-transparent blue for hover snap point
                p5Instance.noStroke();
                const hoverXPx = hoverSnapPointFt.x * PIXELS_PER_FOOT_P5;
                const hoverYPx = hoverSnapPointFt.y * PIXELS_PER_FOOT_P5;
                const hoverPointSize = 8 / currentZoomScaleP5;
                p5Instance.ellipse(hoverXPx, hoverYPx, hoverPointSize, hoverPointSize);
                p5Instance.pop();
            }
            if (currentPolygonPointsFt.length > 0) {
                drawPolygonPreview(); // Uses currentPolygonPointsFt (world coords in Ft)
                if (mousePreviewLineP5 && !isShapeClosedP5) {
                    p5Instance.stroke(0, 123, 255, 150);
                    p5Instance.strokeWeight(1.5 / currentZoomScaleP5);
                    p5Instance.drawingContext.setLineDash([3, 3]);
                    // mousePreviewLineP5 stores Ft coordinates, convert to p5 world pixels
                    p5Instance.line(
                        mousePreviewLineP5.x1Ft * PIXELS_PER_FOOT_P5, 
                        mousePreviewLineP5.y1Ft * PIXELS_PER_FOOT_P5, 
                        mousePreviewLineP5.x2Ft * PIXELS_PER_FOOT_P5, 
                        mousePreviewLineP5.y2Ft * PIXELS_PER_FOOT_P5
                    );
                    p5Instance.drawingContext.setLineDash([]);
                }
            }
        }
        p5Instance.pop(); 
    };
}


// --- Drawing Functions ---
export function redrawP5(sketch = p5Instance) {
    if (sketch && sketch._setupDone) { 
         sketch.redraw();
    }
}

function drawP5Grid() {
    const lotCfg = config.lotConfigRef();
    let displayWidthFt, displayDepthFt;
    let originXFt = 0, originYFt = 0;

    if (lotCfg.isCustomShape && lotCfg.customShapePoints.length > 0) {
        const bounds = getPolygonBoundsFt(lotCfg.customShapePoints);
        displayWidthFt = bounds.width + GRID_SIZE_FT * 4; // Add some padding
        displayDepthFt = bounds.height + GRID_SIZE_FT * 4;
        originXFt = bounds.minX - GRID_SIZE_FT * 2;
        originYFt = bounds.minY - GRID_SIZE_FT * 2;
    } else {
        displayWidthFt = lotCfg.width;
        displayDepthFt = lotCfg.depth;
    }

    p5Instance.stroke(190, 210, 180); 
    p5Instance.strokeWeight(0.5 / currentZoomScaleP5); 

    for (let xFt = 0; xFt <= displayWidthFt; xFt += GRID_SIZE_FT) {
        const xPx = (originXFt + xFt) * PIXELS_PER_FOOT_P5;
        p5Instance.line(xPx, originYFt * PIXELS_PER_FOOT_P5, xPx, (originYFt + displayDepthFt) * PIXELS_PER_FOOT_P5);
    }
    for (let yFt = 0; yFt <= displayDepthFt; yFt += GRID_SIZE_FT) {
        const yPx = (originYFt + yFt) * PIXELS_PER_FOOT_P5;
        p5Instance.line(originXFt * PIXELS_PER_FOOT_P5, yPx, (originXFt + displayWidthFt) * PIXELS_PER_FOOT_P5, yPx);
    }
}

function drawP5LotBoundary() {
    const lotCfg = config.lotConfigRef();
    p5Instance.noFill(); 
    p5Instance.stroke(70, 100, 60); 
    p5Instance.strokeWeight(2.5 / currentZoomScaleP5);
    
    if (lotCfg.isCustomShape && lotCfg.customShapePoints.length >= 3) {
        p5Instance.beginShape();
        lotCfg.customShapePoints.forEach(p => {
            p5Instance.vertex(p.x * PIXELS_PER_FOOT_P5, p.y * PIXELS_PER_FOOT_P5);
        });
        p5Instance.endShape(p5Instance.CLOSE);
    } else {
        // Fallback to rectangular display if custom shape isn't valid or set
        p5Instance.rectMode(p5Instance.CORNER); 
        p5Instance.rect(0, 0, lotCfg.width * PIXELS_PER_FOOT_P5, lotCfg.depth * PIXELS_PER_FOOT_P5);
        p5Instance.rectMode(p5Instance.CENTER); 
    }

    // Lot info text (consider moving if it clutters custom shapes)
    p5Instance.push();
    p5Instance.resetMatrix(); // Draw in screen space
    p5Instance.fill(60, 90, 50); p5Instance.noStroke();
    const baseTextSize = 10; 
    p5Instance.textSize(baseTextSize); p5Instance.textAlign(p5Instance.LEFT, p5Instance.TOP);
    const textX = 10; const textY = 10;
    p5Instance.text("7424 Cindy Dr, McCordsville, IN (Zone 6a)", textX, textY);
    const visibleWidthFt = (p5Canvas.width / (PIXELS_PER_FOOT_P5 * currentZoomScaleP5));
    const visibleHeightFt = (p5Canvas.height / (PIXELS_PER_FOOT_P5 * currentZoomScaleP5));
    p5Instance.text(`View: ~${visibleWidthFt.toFixed(0)}'x${visibleHeightFt.toFixed(0)}' (Zoom:${currentZoomScaleP5.toFixed(2)}x)`, textX, textY + baseTextSize * 1.3);
    if (lotCfg.isCustomShape) {
         p5Instance.text(`Lot: Custom Shape`, textX, textY + baseTextSize * 2.6);
    } else {
         p5Instance.text(`Lot: ${lotCfg.width.toFixed(1)}' x ${lotCfg.depth.toFixed(1)}'`, textX, textY + baseTextSize * 2.6);
    }
    p5Instance.pop();
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

    if (currentSelectedAppElement && element.id === currentSelectedAppElement.id && element.type !== 'custom_house') {
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

function drawP5CustomHouse(house, pxPerFtUnit, currentSelectedAppElement) {
    if (!house || !house.outline || house.outline.length < 3) return;
    p5Instance.push();

    // House is positioned by its top-left (x,y) in app.js, but outline points are relative to its center.
    // We need to translate to the house's center for drawing and rotation.
    const houseCenterX_px = (house.x + house.width / 2) * pxPerFtUnit;
    const houseCenterY_px = (house.y + house.depth / 2) * pxPerFtUnit;
    
    p5Instance.translate(houseCenterX_px, houseCenterY_px);
    if (house.rotation) {
        p5Instance.rotate(p5Instance.radians(house.rotation));
    }

    p5Instance.strokeWeight(1.5 / currentZoomScaleP5);
    if (currentSelectedAppElement && house.id === currentSelectedAppElement.id) {
        p5Instance.stroke(0, 100, 200, 220); // Slightly different highlight for custom house
        p5Instance.strokeWeight(3.5 / currentZoomScaleP5);
        p5Instance.fill(0, 100, 200, 50);
    } else {
        p5Instance.stroke(150, 150, 170); // Color for custom house outline
        p5Instance.fill(190, 190, 210, 180); // Slightly different fill
    }

    p5Instance.beginShape();
    house.outline.forEach(p => {
        // outline points are already relative to house center in feet
        p5Instance.vertex(p.x * pxPerFtUnit, p.y * pxPerFtUnit);
    });
    p5Instance.endShape(p5Instance.CLOSE);

    // Label for custom house
    if (house.width * pxPerFtUnit * currentZoomScaleP5 > 20 && house.depth * pxPerFtUnit * currentZoomScaleP5 > 20) {
        p5Instance.push();
        if (house.rotation) p5Instance.rotate(-p5Instance.radians(house.rotation)); // Un-rotate for label
        p5Instance.fill(30, 30, 30, 220);
        p5Instance.noStroke();
        p5Instance.textAlign(p5Instance.CENTER, p5Instance.CENTER);
        const labelTextSize = Math.max(6, Math.min(10, 12 / currentZoomScaleP5 * (currentZoomScaleP5 / 0.4)));
        p5Instance.textSize(labelTextSize);
        p5Instance.text("CH", 0, 0); // "CH" for Custom House
        p5Instance.pop();
    }
    p5Instance.pop();
}


// --- Canvas Interaction: Mouse Events ---
// Transforms mouse coordinates from p5 canvas space to lot/world feet coordinates
function p5CanvasToLotCoords(mouseX_canvas, mouseY_canvas) {
    const lotCfg = config.lotConfigRef();
    let lotCenterXFt, lotCenterYFt;
    if (lotCfg.isCustomShape && lotCfg.customShapePoints.length > 0) {
        const bounds = getPolygonBoundsFt(lotCfg.customShapePoints);
        lotCenterXFt = bounds.minX + bounds.width / 2;
        lotCenterYFt = bounds.minY + bounds.height / 2;
    } else {
        lotCenterXFt = lotCfg.width / 2;
        lotCenterYFt = lotCfg.depth / 2;
    }

    // Mouse coords relative to canvas center (view coords in pixels)
    let x_transformed = mouseX_canvas - p5Canvas.width / 2;
    let y_transformed = mouseY_canvas - p5Canvas.height / 2;
    
    // Undo scaling (convert to world-scale pixels, still relative to view center)
    x_transformed /= currentZoomScaleP5;
    y_transformed /= currentZoomScaleP5;
    
    // Undo panning (add pan offset in world-scale pixels)
    // currentPanOffsetP5 is in feet, convert to pixels at current world scale
    x_transformed += currentPanOffsetP5.x * PIXELS_PER_FOOT_P5;
    y_transformed += currentPanOffsetP5.y * PIXELS_PER_FOOT_P5;

    // Undo lot centering (add lot center offset in world-scale pixels)
    // This effectively translates coordinates so that (0,0) in feet corresponds to the world origin used for drawing
    x_transformed += lotCenterXFt * PIXELS_PER_FOOT_P5;
    y_transformed += lotCenterYFt * PIXELS_PER_FOOT_P5;
    
    // Convert final world pixel coordinates to feet
    return { x: x_transformed / PIXELS_PER_FOOT_P5, y: y_transformed / PIXELS_PER_FOOT_P5 };
}


function handleP5MousePressed() {
    if (!p5Instance || !p5Canvas) return;
    if (p5Instance.mouseX < 0 || p5Instance.mouseX > p5Canvas.width || p5Instance.mouseY < 0 || p5Instance.mouseY > p5Canvas.height) return;

    if (isInDrawingModeP5) {
        const lotMouseCoords = p5CanvasToLotCoords(p5Instance.mouseX, p5Instance.mouseY);
        // Snap to grid for drawing
        const snappedXFt = Math.round(lotMouseCoords.x / GRID_SIZE_FT) * GRID_SIZE_FT;
        const snappedYFt = Math.round(lotMouseCoords.y / GRID_SIZE_FT) * GRID_SIZE_FT;

        currentPolygonPointsFt.push({ x: snappedXFt, y: snappedYFt });
        
        isShapeClosedP5 = false; // Reset on new point
        if (currentPolygonPointsFt.length > 1) {
            isShapeValidPreviewP5 = (currentDrawingPolygonTypeP5 === 'lot_polygon') ? 
                                    isLotShapeValidP5(currentPolygonPointsFt) : 
                                    isHouseShapeValidP5(currentPolygonPointsFt);
        }


        if (config.onPolygonVertexAdd) config.onPolygonVertexAdd({ x: snappedXFt, y: snappedYFt }, currentDrawingPolygonTypeP5);
        redrawP5(p5Instance);
        return; // Don't process element selection/dragging while drawing
    }

    const lotMouseCoords = p5CanvasToLotCoords(p5Instance.mouseX, p5Instance.mouseY);
    const elementsToCheck = config.elementsRef();
    const currentCustomHouse = config.customHouseRef ? config.customHouseRef() : null;
    let newlySelectedElement = null;

    // Check custom house first due to potentially complex shape
    if (currentCustomHouse) {
        const house = currentCustomHouse;
        // Transform mouse to house's local coordinate system
        const dx = lotMouseCoords.x - (house.x + house.width / 2); // Mouse relative to house center (feet)
        const dy = lotMouseCoords.y - (house.y + house.depth / 2);
        const angleRad = -p5Instance.radians(house.rotation || 0); // Counter-rotate mouse
        const localMouseX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad); // Now in house local feet
        const localMouseY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

        if (isPointInPolygon({x: localMouseX, y: localMouseY}, house.outline)) {
            newlySelectedElement = house;
        }
    }

    if (!newlySelectedElement) { // If custom house not selected, check other elements
        for (let i = elementsToCheck.length - 1; i >= 0; i--) {
            const el = elementsToCheck[i];
            // Element's x,y is top-left. Calculate center for rotation.
            const elCenterXFt = el.x + el.width/2;
            const elCenterYFt = el.y + el.depth/2;
            
            const mouseRotated = rotatePoint(lotMouseCoords, {x: elCenterXFt, y: elCenterYFt}, -(el.rotation || 0));

            // Check against element's bounding box (defined by its top-left x,y and width/depth)
            if (mouseRotated.x >= el.x && mouseRotated.x <= el.x + el.width &&
                mouseRotated.y >= el.y && mouseRotated.y <= el.y + el.depth) {
                newlySelectedElement = el; break;
            }
        }
    }

    if (newlySelectedElement) {
        selectedP5ElementData = newlySelectedElement; isDraggingP5 = true;
        dragStartMouseP5 = { x: p5Instance.mouseX, y: p5Instance.mouseY }; // Canvas coords
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
        const currentLotMouseCoords = p5CanvasToLotCoords(p5Instance.mouseX, p5Instance.mouseY); // Target new center in lot coords
        const dragStartLotMouseCoords = p5CanvasToLotCoords(dragStartMouseP5.x, dragStartMouseP5.y); // Original center in lot coords

        let deltaX_ft = currentLotMouseCoords.x - dragStartLotMouseCoords.x;
        let deltaY_ft = currentLotMouseCoords.y - dragStartLotMouseCoords.y;
        
        let newElementX_ft = dragStartElementPosFt.x + deltaX_ft;
        let newElementY_ft = dragStartElementPosFt.y + deltaY_ft;

        // Snap to grid
        newElementX_ft = Math.round(newElementX_ft / GRID_SIZE_FT) * GRID_SIZE_FT;
        newElementY_ft = Math.round(newElementY_ft / GRID_SIZE_FT) * GRID_SIZE_FT;
        
        const lotCfg = config.lotConfigRef();
        if (!lotCfg.isCustomShape) { // Simple rectangular boundary
            newElementX_ft = Math.max(0, Math.min(newElementX_ft, lotCfg.width - selectedP5ElementData.width));
            newElementY_ft = Math.max(0, Math.min(newElementY_ft, lotCfg.depth - selectedP5ElementData.depth));
        } else {
            // For custom shapes, more complex boundary check is needed.
            // For now, allow dragging, final placement validation can occur on drop or via appContext.validateAndPlaceElement.
            // Or, check if the element's new center is within the custom lot polygon.
            const elementCenter = { x: newElementX_ft + selectedP5ElementData.width / 2, y: newElementY_ft + selectedP5ElementData.depth / 2 };
            if (!isPointInPolygon(elementCenter, lotCfg.customShapePoints)) {
                // Potentially snap back or provide visual feedback, but can be complex with rotation.
                // For now, we allow it, assuming some elements might partially overlap boundaries for visual reasons.
            }
        }


        if (selectedP5ElementData.x !== newElementX_ft || selectedP5ElementData.y !== newElementY_ft) {
            if (config.onElementMove) {
                config.onElementMove(selectedP5ElementData.id, newElementX_ft, newElementY_ft);
            }
            // Element data is updated by app.js, redraw will pick up new positions
            redrawP5(p5Instance); 
        }
    }
}

function handleP5MouseReleased() {
    if (isDraggingP5) { isDraggingP5 = false; redrawP5(p5Instance); }
}

function handleP5MouseMoveForDrawing(event) {
    if (!p5Canvas || !p5Instance) return;
    const rect = p5Canvas.elt.getBoundingClientRect();
    const mouseXInCanvas = event.clientX - rect.left;
    const mouseYInCanvas = event.clientY - rect.top;

    if (mouseXInCanvas < 0 || mouseXInCanvas > p5Canvas.width || mouseYInCanvas < 0 || mouseYInCanvas > p5Canvas.height) {
        hoverSnapPointFt = null;
        mousePreviewLineP5 = null;
        if (isInDrawingModeP5) redrawP5(p5Instance); // Redraw to remove hover point if it was visible
        return;
    }
    
    if (isInDrawingModeP5) {
        const lotMouseCoords = p5CanvasToLotCoords(mouseXInCanvas, mouseYInCanvas);
        const snappedXFt = Math.round(lotMouseCoords.x / GRID_SIZE_FT) * GRID_SIZE_FT;
        const snappedYFt = Math.round(lotMouseCoords.y / GRID_SIZE_FT) * GRID_SIZE_FT;
        hoverSnapPointFt = { x: snappedXFt, y: snappedYFt };

        if (currentPolygonPointsFt.length > 0 && !isShapeClosedP5) {
            const lastPointFt = currentPolygonPointsFt[currentPolygonPointsFt.length - 1];
            mousePreviewLineP5 = { // Store in Ft coordinates
                x1Ft: lastPointFt.x, y1Ft: lastPointFt.y,
                x2Ft: hoverSnapPointFt.x, y2Ft: hoverSnapPointFt.y // Use the snapped hover point
            };
        } else {
            mousePreviewLineP5 = null;
        }
        redrawP5(p5Instance);
    } else {
        if (hoverSnapPointFt) { // If previously drawing and now not, clear the point
             hoverSnapPointFt = null;
             redrawP5(p5Instance);
        }
        mousePreviewLineP5 = null; // Also clear preview line if not in drawing mode
    }
}

// --- Drawing Mode API for app.js ---
export function setDrawingModeP5(isDrawing, mode) {
    isInDrawingModeP5 = isDrawing;
    currentDrawingPolygonTypeP5 = isDrawing ? mode : null;
    if (!isDrawing) {
        // currentPolygonPointsP5 = []; // REMOVED
        currentPolygonPointsFt = [];
        mousePreviewLineP5 = null;
        hoverSnapPointFt = null; // Clear hover point when exiting drawing mode
        isShapeClosedP5 = false;
        isShapeValidPreviewP5 = true;
    }
    if (config.onDrawingModeChange) config.onDrawingModeChange(isDrawing, mode);
    redrawP5(p5Instance);
}

export function clearDrawingP5() {
    // currentPolygonPointsP5 = []; // REMOVED
    currentPolygonPointsFt = [];
    mousePreviewLineP5 = null;
    hoverSnapPointFt = null; // Clear hover point
    isShapeClosedP5 = false;
    isShapeValidPreviewP5 = true;
    redrawP5(p5Instance);
}

export function getCurrentLotPolygonP5() { return [...currentPolygonPointsFt]; } // Return copy
export function getCurrentHousePolygonP5() { return [...currentPolygonPointsFt]; } // Return copy

function drawPolygonPreview() {
    if (!p5Instance || currentPolygonPointsFt.length === 0) return;

    // Convert currentPolygonPointsFt to canvas coordinates for drawing
    // These points are already in the correct world feet, snapped.
    // They need to be drawn in the p5 world space, before view transforms are popped.
    // The main draw loop already sets up the correct transform.

    if (isShapeValidPreviewP5) {
        p5Instance.fill(0, 123, 255, 30); // Light blue for valid preview
        p5Instance.stroke(0, 123, 255);
    } else {
        p5Instance.fill(255, 0, 0, 30);   // Light red for invalid preview
        p5Instance.stroke(255, 0, 0);
    }
    p5Instance.strokeWeight(1.5 / currentZoomScaleP5);

    p5Instance.beginShape();
    currentPolygonPointsFt.forEach(pFt => {
        p5Instance.vertex(pFt.x * PIXELS_PER_FOOT_P5, pFt.y * PIXELS_PER_FOOT_P5);
    });
    p5Instance.endShape(isShapeClosedP5 ? p5Instance.CLOSE : undefined);

    // Draw vertices
    p5Instance.fill(0, 123, 255);
    p5Instance.noStroke();
    currentPolygonPointsFt.forEach(pFt => {
        p5Instance.ellipse(pFt.x * PIXELS_PER_FOOT_P5, pFt.y * PIXELS_PER_FOOT_P5, 6 / currentZoomScaleP5, 6 / currentZoomScaleP5);
    });
}

// --- Polygon Utilities ---
function getPolygonBoundsFt(polygonFt) {
    if (!polygonFt || polygonFt.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    polygonFt.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function isLotShapeValidP5(polygon) {
    if (!polygon || polygon.length < 3) return false; // Need at least 3 points for a polygon
    // Basic check for self-intersection (simple version, might need robust library for complex cases)
    // This is a naive check, for complex polygons a robust library (e.g.martinez-polygon-clipping) would be better
    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];
        for (let j = i + 2; j < polygon.length; j++) {
            if ((j + 1) % polygon.length === i) continue; // Adjacent segments
            const p3 = polygon[j];
            const p4 = polygon[(j + 1) % polygon.length];
            if (segmentsIntersect(p1, p2, p3, p4)) return false;
        }
    }
    return true;
}
export function isHouseShapeValidP5(polygon) {
    return isLotShapeValidP5(polygon); // Same validation for now
}

// Helper for segment intersection (from a common algorithm)
function segmentsIntersect(p1, p2, p3, p4) {
    function orientation(p, q, r) {
        const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        if (val === 0) return 0; // Collinear
        return (val > 0) ? 1 : 2; // Clockwise or Counterclockwise
    }
    function onSegment(p, q, r) {
        return (q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
                q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y));
    }
    const o1 = orientation(p1, p2, p3); const o2 = orientation(p1, p2, p4);
    const o3 = orientation(p3, p4, p1); const o4 = orientation(p3, p4, p2);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(p1, p3, p2)) return true; if (o2 === 0 && onSegment(p1, p4, p2)) return true;
    if (o3 === 0 && onSegment(p3, p1, p4)) return true; if (o4 === 0 && onSegment(p3, p2, p4)) return true;
    return false;
}

function isPointInPolygon(point, polygon) {
    // Ray-casting algorithm
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
function rotatePoint(point, center, angleDegrees) {
    const angleRad = p5Instance.radians(angleDegrees);
    const s = Math.sin(angleRad);
    const c = Math.cos(angleRad);
    // Translate point back to origin:
    const px = point.x - center.x;
    const py = point.y - center.y;
    // Rotate point
    const xnew = px * c - py * s;
    const ynew = px * s + py * c;
    // Translate point back:
    return { x: xnew + center.x, y: ynew + center.y };
}

// --- Canvas Interaction: Zoom & Pan ---
export function getP5Canvas() { return p5Canvas ? p5Canvas.elt : null; }

export function p5handleZoom(zoomIn, currentAppScale) {
    const scaleFactor = 1.18; 
    let newScale = zoomIn ? currentAppScale * scaleFactor : currentAppScale / scaleFactor;
    newScale = Math.max(0.1, Math.min(newScale, 15)); // Adjusted min/max zoom
    return newScale;
}

export function p5handlePan(deltaXFt, deltaYFt, currentAppPanOffset) {
    let newPanX = currentAppPanOffset.x + deltaXFt;
    let newPanY = currentAppPanOffset.y + deltaYFt;
    
    const lotCfg = config.lotConfigRef();
    let maxPanX, maxPanY;
    if (lotCfg.isCustomShape && lotCfg.customShapePoints.length > 0) {
        const bounds = getPolygonBoundsFt(lotCfg.customShapePoints);
        maxPanX = bounds.width / 1.5; // Allow panning a bit beyond the custom shape bounds
        maxPanY = bounds.height / 1.5;
    } else {
        maxPanX = lotCfg.width / 1.5;
        maxPanY = lotCfg.depth / 1.5;
    }

    newPanX = Math.max(-maxPanX, Math.min(newPanX, maxPanX));
    newPanY = Math.max(-maxPanY, Math.min(newPanY, maxPanY));
    return { x: newPanX, y: newPanY };
}