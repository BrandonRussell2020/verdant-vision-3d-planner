// js/three-scene.js
// Handles all Three.js related logic for the 3D view

import * as THREE from 'three';
// OrbitControls, GLTFLoader, GLTFExporterConstructor are passed in options from app.js

// --- Module-level Variables ---
let scene, camera, renderer, controls, raycaster, mouse;
let groundPlane, sunlight, ambientLight;
let threeCanvas;

let onElementSelectCallback;
let currentElementsRef; // Function to get elements array
let currentCustomHouseRef; // Function to get customHouse object
let currentLotConfigRef; // Function to get lotConfig object

let GLTFExporterConstructor;
let OrbitControlsConstructor, GLTFLoaderConstructor; 

const modelCache = {}; 
const textureLoader = new THREE.TextureLoader(); 

const PLANT_MODEL_PATH = 'assets/models/plants/';
const TREE_MODEL_PATH = 'assets/models/trees/';
const HOUSE_MODEL_PATH = 'assets/models/other/houses/'; 
const DEFAULT_CANVAS_SIZE_PX_THREE = 600;

let appContextRef = null;
export function setAppContextForThree(context) {
    appContextRef = context;
}

let compassArrowElement3D = null;
const DEFAULT_NORTH_FACING_POSITION = new THREE.Vector3(); 
const DEFAULT_NORTH_FACING_TARGET = new THREE.Vector3(0, 0, 0); 

// --- Initialization ---
export function initThreeScene(container, options) {
    try {
        if (!THREE) throw new Error("Three.js core library not available for 3D scene.");
        
        currentLotConfigRef = options.lotConfigRef; // Store ref to lotConfig getter
        onElementSelectCallback = options.onElementSelect;
        currentElementsRef = options.elementsRef;
        currentCustomHouseRef = options.customHouseRef;

        GLTFExporterConstructor = options.getGLTFExporter;
        OrbitControlsConstructor = options.OrbitControls; GLTFLoaderConstructor = options.GLTFLoader;

        if (!OrbitControlsConstructor) throw new Error("OrbitControls not provided.");
        if (!GLTFLoaderConstructor) throw new Error("GLTFLoader not provided.");
        
        const lotCfg = currentLotConfigRef();
        DEFAULT_NORTH_FACING_POSITION.set(0, (lotCfg.depth || DEFAULT_LOT_DEPTH_FT) * 0.5, (lotCfg.depth || DEFAULT_LOT_DEPTH_FT) * 0.6);


        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xade0fc); 
        scene.fog = new THREE.Fog(0xade0fc, (lotCfg.width || DEFAULT_LOT_WIDTH_FT) * 0.6, (lotCfg.width || DEFAULT_LOT_WIDTH_FT) * 2.8);

        const aspectRatio = (container.clientWidth || DEFAULT_CANVAS_SIZE_PX_THREE) / (container.clientHeight || DEFAULT_CANVAS_SIZE_PX_THREE);
        camera = new THREE.PerspectiveCamera(50, aspectRatio, 0.1, (Math.max(lotCfg.width, lotCfg.depth) || DEFAULT_LOT_WIDTH_FT) * 5);
        
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(container.clientWidth || DEFAULT_CANVAS_SIZE_PX_THREE, container.clientHeight || DEFAULT_CANVAS_SIZE_PX_THREE);
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);
        threeCanvas = renderer.domElement;

        controls = new OrbitControlsConstructor(camera, renderer.domElement);
        controls.enableDamping = true; controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 - 0.03; 
        controls.minDistance = 5; 
        controls.maxDistance = (Math.max(lotCfg.width, lotCfg.depth) || DEFAULT_LOT_WIDTH_FT) * 1.5;
        controls.screenSpacePanning = false;
        
        resetCameraToNorthView(); 

        ambientLight = new THREE.AmbientLight(0xffffff, 0.8); scene.add(ambientLight);
        sunlight = new THREE.DirectionalLight(0xffffff, 2.5); 
        const initialLotWidth = lotCfg.width || DEFAULT_LOT_WIDTH_FT;
        const initialLotDepth = lotCfg.depth || DEFAULT_LOT_DEPTH_FT;
        sunlight.position.set(initialLotWidth * 0.35, initialLotWidth * 0.55, initialLotDepth * 0.25);
        sunlight.castShadow = true; sunlight.shadow.mapSize.width = 2048; sunlight.shadow.mapSize.height = 2048;
        sunlight.shadow.camera.near = 1; 
        sunlight.shadow.camera.far = Math.max(initialLotWidth, initialLotDepth) * 1.8;
        const shadowCamSize = Math.max(initialLotWidth, initialLotDepth) * 0.8;
        sunlight.shadow.camera.left = -shadowCamSize; sunlight.shadow.camera.right = shadowCamSize;
        sunlight.shadow.camera.top = shadowCamSize; sunlight.shadow.camera.bottom = -shadowCamSize;
        sunlight.shadow.bias = -0.0008; 
        scene.add(sunlight); sunlight.target.position.set(0,0,0); scene.add(sunlight.target);

        // Ground plane will be created/updated by updateGroundPlane()
        updateGroundPlane();

        raycaster = new THREE.Raycaster(); mouse = new THREE.Vector2();
        renderer.domElement.addEventListener('click', onMouseClickIn3D, false);
        window.addEventListener('resize', onWindowResize, false); onWindowResize();
        
        compassArrowElement3D = document.getElementById('compassArrow3D');
        if (!compassArrowElement3D) {
            console.warn("3D Compass arrow element ('compassArrow3D') not found in HTML.");
        }

        console.log("Three.js scene initialized successfully.");
    } catch (error) {
        console.error("Error initializing Three.js scene:", error);
        if (container) container.innerHTML = `<div class="text-red-500 p-4 bg-red-100 border border-red-400 rounded"><i class="fas fa-exclamation-triangle mr-2"></i>3D Scene Initialization Error: ${error.message}</div>`;
    }
}


export function updateGroundPlane() {
    if (!scene) return;
    const lotCfg = currentLotConfigRef();

    if (groundPlane) {
        scene.remove(groundPlane);
        groundPlane.geometry.dispose();
        if (Array.isArray(groundPlane.material)) groundPlane.material.forEach(m => m.dispose());
        else groundPlane.material.dispose();
        groundPlane = null;
    }
    
    let groundGeometry;
    if (lotCfg.isCustomShape && lotCfg.customShapePoints && lotCfg.customShapePoints.length >= 3) {
        // Create ground from custom polygon
        const shape = new THREE.Shape();
        // Center the polygon points around (0,0) for THREE.ShapeGeometry
        const bounds = lotCfg.customShapePoints.reduce((acc, p) => ({
            minX: Math.min(acc.minX, p.x), minY: Math.min(acc.minY, p.y),
            maxX: Math.max(acc.maxX, p.x), maxY: Math.max(acc.maxY, p.y)
        }), {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});
        const offsetX = -(bounds.minX + (bounds.maxX - bounds.minX) / 2);
        const offsetY = -(bounds.minY + (bounds.maxY - bounds.minY) / 2);

        shape.moveTo(lotCfg.customShapePoints[0].x + offsetX, lotCfg.customShapePoints[0].y + offsetY);
        for (let i = 1; i < lotCfg.customShapePoints.length; i++) {
            shape.lineTo(lotCfg.customShapePoints[i].x + offsetX, lotCfg.customShapePoints[i].y + offsetY);
        }
        groundGeometry = new THREE.ShapeGeometry(shape);
    } else {
        // Default rectangular ground
        groundGeometry = new THREE.PlaneGeometry(lotCfg.width, lotCfg.depth);
    }

    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x77aa55, roughness: 0.9, metalness: 0.1 });
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    groundPlane.receiveShadow = true;
    groundPlane.name = "ground";
    scene.add(groundPlane);

    // Apply texture
    textureLoader.load('assets/textures/grass_detailed.jpg',
        (texture) => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            const textureWorldWidth = 25; // How many feet wide one repeat of the texture should be
            const repeatX = (lotCfg.isCustomShape ? (Math.max(...lotCfg.customShapePoints.map(p => p.x)) - Math.min(...lotCfg.customShapePoints.map(p => p.x))) : lotCfg.width) / textureWorldWidth;
            const repeatY = (lotCfg.isCustomShape ? (Math.max(...lotCfg.customShapePoints.map(p => p.y)) - Math.min(...lotCfg.customShapePoints.map(p => p.y))) : lotCfg.depth) / textureWorldWidth;
            texture.repeat.set(repeatX, repeatY);
            texture.colorSpace = THREE.SRGBColorSpace;
            groundPlane.material.map = texture; 
            groundPlane.material.needsUpdate = true;
            renderThreeScene();
        },
        undefined, 
        (err) => {
            console.warn("Failed to load ground texture. Using default green.", err);
            renderThreeScene();
        }
    );
    
    // Update fog and camera parameters based on new lot size
    const newLotWidth = lotCfg.isCustomShape ? (Math.max(...lotCfg.customShapePoints.map(p => p.x)) - Math.min(...lotCfg.customShapePoints.map(p => p.x))) : lotCfg.width;
    const newLotDepth = lotCfg.isCustomShape ? (Math.max(...lotCfg.customShapePoints.map(p => p.y)) - Math.min(...lotCfg.customShapePoints.map(p => p.y))) : lotCfg.depth;

    if (scene.fog) {
        scene.fog.near = Math.max(newLotWidth, newLotDepth) * 0.6;
        scene.fog.far = Math.max(newLotWidth, newLotDepth) * 2.8;
    }
    if (camera) {
        camera.far = Math.max(newLotWidth, newLotDepth) * 5;
        camera.updateProjectionMatrix();
    }
    if (controls) {
        controls.maxDistance = Math.max(newLotWidth, newLotDepth) * 1.5;
    }
    if (sunlight && sunlight.shadow) {
        sunlight.shadow.camera.far = Math.max(newLotWidth, newLotDepth) * 1.8;
        const shadowCamSize = Math.max(newLotWidth, newLotDepth) * 0.8;
        sunlight.shadow.camera.left = -shadowCamSize; sunlight.shadow.camera.right = shadowCamSize;
        sunlight.shadow.camera.top = shadowCamSize; sunlight.shadow.camera.bottom = -shadowCamSize;
        sunlight.shadow.camera.updateProjectionMatrix();
    }

    renderThreeScene();
}


export function resetCameraToNorthView() {
    if (camera && controls) {
        const lotCfg = currentLotConfigRef();
        const effectiveDepth = lotCfg.isCustomShape && lotCfg.customShapePoints.length > 0 ? 
                               (Math.max(...lotCfg.customShapePoints.map(p => p.y)) - Math.min(...lotCfg.customShapePoints.map(p => p.y)))
                               : lotCfg.depth;
        DEFAULT_NORTH_FACING_POSITION.set(0, effectiveDepth * 0.5, effectiveDepth * 0.6);

        camera.position.copy(DEFAULT_NORTH_FACING_POSITION);
        controls.target.copy(DEFAULT_NORTH_FACING_TARGET); 
        camera.lookAt(DEFAULT_NORTH_FACING_TARGET); 
        controls.update(); 
        renderThreeScene();
    }
}

function onWindowResize() {
    if (!camera || !renderer || !threeCanvas || !threeCanvas.parentElement) return;
    const container = threeCanvas.parentElement;
    const newWidth = container.clientWidth; const newHeight = container.clientHeight;
    if (newWidth > 0 && newHeight > 0) {
        camera.aspect = newWidth / newHeight; camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight); renderThreeScene();
    }
}

export function renderThreeScene() {
    if (!renderer || !scene || !camera) return;
    try { 
        if (controls) {
            controls.update(); 
            if (compassArrowElement3D) {
                const azimuthalAngle = controls.getAzimuthalAngle();
                compassArrowElement3D.style.transform = `rotate(${-azimuthalAngle}rad)`;
            }
        }
        renderer.render(scene, camera); 
    }
    catch (error) { console.error("Error in Three.js render loop:", error); }
}

export function getThreeCanvas() { return renderer ? renderer.domElement : null; }

function getClickedObjectIn3D(event) {
    event.preventDefault();
    if (!renderer || !renderer.domElement || !camera || !raycaster || !mouse) return null;
    const canvasBounds = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
    mouse.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        let intersectedObject = intersects[0].object;
        // Traverse up to find the group with userData.elementId or userData.customHouseId
        while (intersectedObject.parent && intersectedObject.parent !== scene && 
               !intersectedObject.userData.elementId && !intersectedObject.userData.customHouseId) {
            intersectedObject = intersectedObject.parent;
        }
        if (intersectedObject.userData && (intersectedObject.userData.elementId !== undefined || intersectedObject.userData.customHouseId !== undefined)) {
            return intersectedObject;
        } else if (intersects[0].object.name === "ground") {
            return intersects[0]; // Return the intersection data for ground clicks
        }
    }
    return null;
}

function onMouseClickIn3D(event) {
    if (appContextRef && appContextRef.isDrawing && appContextRef.isDrawing()) return; // Don't select if drawing

    const clickedResult = getClickedObjectIn3D(event);
    if (clickedResult) {
        if (clickedResult.userData && clickedResult.userData.elementId !== undefined) {
            if (onElementSelectCallback) onElementSelectCallback(clickedResult.userData.elementId, '3D');
        } else if (clickedResult.userData && clickedResult.userData.customHouseId !== undefined) {
            if (onElementSelectCallback) onElementSelectCallback(clickedResult.userData.customHouseId, '3D');
        } else if (clickedResult.object && clickedResult.object.name === "ground") {
             if (onElementSelectCallback) onElementSelectCallback(null, '3D'); // Deselect
        }
    } else { if (onElementSelectCallback) onElementSelectCallback(null, '3D'); } // Deselect
}

export function addElementToThree(elementData, currentSeason) {
    if (!scene || !GLTFLoaderConstructor) { return; }
    const lotCfg = currentLotConfigRef();
    try {
        const modelLoaderInstance = new GLTFLoaderConstructor();
        let elementGroup = new THREE.Group();
        
        const lotCenterX = lotCfg.isCustomShape ? 
                            (Math.min(...lotCfg.customShapePoints.map(p => p.x)) + Math.max(...lotCfg.customShapePoints.map(p => p.x))) / 2 
                            : lotCfg.width / 2;
        const lotCenterZ = lotCfg.isCustomShape ?
                            (Math.min(...lotCfg.customShapePoints.map(p => p.y)) + Math.max(...lotCfg.customShapePoints.map(p => p.y))) / 2
                            : lotCfg.depth / 2;

        const threeX = elementData.x + elementData.width / 2 - lotCenterX;
        const threeZ = elementData.y + elementData.depth / 2 - lotCenterZ;
        let threeY = 0; 

        let mainMesh; 

        switch (elementData.type) {
            case 'house': // Default pre-defined house
                threeY = 0; 
                loadAndConfigureHouseModel(elementGroup, elementData, modelLoaderInstance, HOUSE_MODEL_PATH, "house_v1.glb");
                break;
            case 'shed': 
                const shedBodyHeight = elementData.height * 0.7;
                const shedBody = new THREE.Mesh(
                    new THREE.BoxGeometry(elementData.width, shedBodyHeight, elementData.depth),
                    new THREE.MeshStandardMaterial({ color: 0xaf9c81, roughness: 0.85 }) 
                );
                shedBody.position.y = shedBodyHeight / 2;
                elementGroup.add(shedBody);
                const shedRoofPeakHeight = elementData.height * 0.4;
                const shedRoofShape = new THREE.Shape();
                shedRoofShape.moveTo(-elementData.width / 2, shedBodyHeight);
                shedRoofShape.lineTo(elementData.width / 2, shedBodyHeight);
                shedRoofShape.lineTo(0, shedBodyHeight + shedRoofPeakHeight);
                shedRoofShape.lineTo(-elementData.width / 2, shedBodyHeight);
                const shedExtrudeSettings = { depth: elementData.depth, bevelEnabled: false };
                const shedRoofGeometry = new THREE.ExtrudeGeometry(shedRoofShape, shedExtrudeSettings);
                const shedRoofMesh = new THREE.Mesh(shedRoofGeometry, new THREE.MeshStandardMaterial({ color: 0x6b5b4b, roughness: 0.9 })); 
                shedRoofMesh.position.z = -elementData.depth / 2;
                elementGroup.add(shedRoofMesh);
                threeY = 0; 
                break;
            case 'raised_bed': 
                const mulchMaterial = new THREE.MeshStandardMaterial({ color: 0x967969, roughness: 0.9 });
                textureLoader.load('assets/textures/mulch.jpg', (texture) => {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(elementData.width / 2, elementData.depth / 2); 
                    texture.colorSpace = THREE.SRGBColorSpace;
                    mulchMaterial.map = texture; mulchMaterial.needsUpdate = true; renderThreeScene();
                }, undefined, (err) => console.warn("Failed to load mulch texture.", err));
                mainMesh = new THREE.Mesh(new THREE.BoxGeometry(elementData.width, elementData.height, elementData.depth), mulchMaterial); 
                threeY = elementData.height / 2; 
                break;
            case 'inground_row': 
                const dirtMaterial = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.95, side: THREE.DoubleSide });
                textureLoader.load('assets/textures/dirt.png', (texture) => {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(elementData.width / 2, elementData.depth / 2); 
                    texture.colorSpace = THREE.SRGBColorSpace;
                    dirtMaterial.map = texture; dirtMaterial.needsUpdate = true; renderThreeScene();
                }, undefined, (err) => console.warn("Failed to load dirt texture.", err));
                mainMesh = new THREE.Mesh(new THREE.BoxGeometry(elementData.width, elementData.height, elementData.depth), dirtMaterial); 
                threeY = elementData.height / 2; 
                break;
            case 'compost_bin': mainMesh = new THREE.Mesh(new THREE.BoxGeometry(elementData.width, elementData.height, elementData.depth), new THREE.MeshStandardMaterial({ color: 0x604020, roughness: 0.85 })); threeY = elementData.height / 2; break;
            case 'tree':
                threeY = 0; loadAndConfigureTreeModel(elementGroup, elementData, currentSeason, modelLoaderInstance); break;
            case 'plant':
                threeY = 0; loadAndConfigurePlantModel(elementGroup, elementData, modelLoaderInstance); break;
            case 'fence_segment': mainMesh = new THREE.Mesh(new THREE.BoxGeometry(elementData.width, elementData.height, elementData.depth), new THREE.MeshStandardMaterial({color: 0x888888, roughness:0.7})); threeY = elementData.height / 2; break;
            case 'patio': mainMesh = new THREE.Mesh(new THREE.BoxGeometry(elementData.width, elementData.height, elementData.depth), new THREE.MeshStandardMaterial({color: 0xcccccc, roughness:0.6, side:THREE.DoubleSide})); threeY = elementData.height / 2; break;
            case 'path': mainMesh = new THREE.Mesh(new THREE.BoxGeometry(elementData.width, elementData.height, elementData.depth), new THREE.MeshStandardMaterial({color: 0xbbbbbb, roughness:0.7, side:THREE.DoubleSide})); threeY = elementData.height / 2; break;
            case 'sprinkler': mainMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, elementData.height, 8), new THREE.MeshStandardMaterial({color: 0x5555ff, roughness:0.5})); threeY = elementData.height / 2; break;
            case 'rain_barrel': mainMesh = new THREE.Mesh(new THREE.CylinderGeometry(elementData.width/2, elementData.width/2, elementData.height, 16), new THREE.MeshStandardMaterial({color: 0x4060a0, roughness:0.4, metalness: 0.2})); threeY = elementData.height / 2; break;
            case 'bench': mainMesh = new THREE.Mesh(new THREE.BoxGeometry(elementData.width, elementData.height, elementData.depth), new THREE.MeshStandardMaterial({color: 0x964B00, roughness:0.85})); threeY = elementData.height / 2; break;
            case 'fire_pit':
                const pitGeometry = new THREE.CylinderGeometry(elementData.width/2, elementData.width/2 * 0.8, elementData.height, 16, 1, true);
                mainMesh = new THREE.Mesh(pitGeometry, new THREE.MeshStandardMaterial({color: 0x555555, roughness:0.7, side:THREE.DoubleSide})); threeY = elementData.height / 2; break;
            case 'lawn_area':
                mainMesh = new THREE.Mesh(new THREE.PlaneGeometry(elementData.width, elementData.depth), new THREE.MeshStandardMaterial({ color: 0x8BC34A, roughness:0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
                mainMesh.rotation.x = -Math.PI / 2; threeY = elementData.height / 2 + 0.01; break; // Slightly above ground
            default: mainMesh = new THREE.Mesh(new THREE.BoxGeometry(elementData.width || 1, elementData.height || 1, elementData.depth || 1), new THREE.MeshStandardMaterial({ color: 0xff00ff })); // Magenta for unknown
                threeY = (elementData.height || 1) / 2;
        }

        if (mainMesh) elementGroup.add(mainMesh);
        
        elementGroup.position.set(threeX, threeY, threeZ);
        if (elementData.rotation && appContextRef && appContextRef.ROTATABLE_ELEMENT_TYPES && appContextRef.ROTATABLE_ELEMENT_TYPES.includes(elementData.type)) {
            elementGroup.rotation.y = THREE.MathUtils.degToRad(elementData.rotation);
        }

        elementGroup.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
        elementGroup.userData = { elementId: elementData.id, type: elementData.type }; // Store app-level ID
        scene.add(elementGroup); elementData.threeInstance = elementGroup; // Link back to app element
        renderThreeScene();
    } catch (error) { console.error(`Error adding element ID ${elementData.id} (type ${elementData.type}) to 3D scene:`, error); }
}

// --- Custom House 3D ---
export function addCustomHouseToThree(houseData) {
    if (!scene) return;
    // Remove existing custom house if any
    if (houseData.threeInstance) {
        removeCustomHouseFromThree(houseData.threeInstance);
    }
    
    const houseGroup = createCustomHouseMesh(houseData);
    const lotCfg = currentLotConfigRef();
    const lotCenterX = lotCfg.isCustomShape ? (Math.min(...lotCfg.customShapePoints.map(p => p.x)) + Math.max(...lotCfg.customShapePoints.map(p => p.x))) / 2 : lotCfg.width / 2;
    const lotCenterZ = lotCfg.isCustomShape ? (Math.min(...lotCfg.customShapePoints.map(p => p.y)) + Math.max(...lotCfg.customShapePoints.map(p => p.y))) / 2 : lotCfg.depth / 2;

    // Position based on houseData.x, houseData.y which are top-left of its bounding box
    const houseThreeX = houseData.x + houseData.width / 2 - lotCenterX;
    const houseThreeZ = houseData.y + houseData.depth / 2 - lotCenterZ;
    
    houseGroup.position.set(houseThreeX, 0, houseThreeZ); // Base of house at Y=0
    if (houseData.rotation) {
        houseGroup.rotation.y = THREE.MathUtils.degToRad(houseData.rotation);
    }
    
    houseGroup.userData = { customHouseId: houseData.id, type: 'custom_house' };
    scene.add(houseGroup);
    houseData.threeInstance = houseGroup; // Link back
    renderThreeScene();
}

export function updateCustomHouseInThree(houseData) {
    if (!houseData.threeInstance) {
        addCustomHouseToThree(houseData); // If not in scene, add it
        return;
    }
    // Remove old mesh
    removeCustomHouseFromThree(houseData.threeInstance);
    // Create and add new mesh
    addCustomHouseToThree(houseData); // This will re-create and re-position
}

export function removeCustomHouseFromThree(houseThreeInstance) {
    if (houseThreeInstance && houseThreeInstance.parent) {
        scene.remove(houseThreeInstance);
        houseThreeInstance.traverse(object => {
            if (object.isMesh) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
                    else object.material.dispose();
                }
            }
        });
    }
    renderThreeScene();
}


function createCustomHouseMesh(houseData) {
    const houseGroup = new THREE.Group();
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xd3c1a4, roughness: 0.8, side: THREE.DoubleSide }); // Match default house
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5b4b, roughness: 0.9, side: THREE.DoubleSide }); // Match default house

    // Create walls from outline
    const wallShape = new THREE.Shape();
    houseData.outline.forEach((p, i) => {
        if (i === 0) wallShape.moveTo(p.x, p.y);
        else wallShape.lineTo(p.x, p.y);
    });
    const extrudeSettings = {
        depth: houseData.height,
        bevelEnabled: false
    };
    const wallGeometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
    // Center the geometry so rotation is around its visual center
    wallGeometry.center(); 
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.position.y = houseData.height / 2; // Lift so base is at y=0
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    houseGroup.add(wallMesh);

    // Create roof
    if (houseData.roofType === 'flat') {
        const roofGeometry = new THREE.ShapeGeometry(wallShape); // Use the same 2D shape
        roofGeometry.center();
        const flatRoofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
        flatRoofMesh.rotation.x = -Math.PI / 2; // Lay flat
        flatRoofMesh.position.y = houseData.height; // Position on top of walls
        flatRoofMesh.castShadow = true;
        flatRoofMesh.receiveShadow = true;
        houseGroup.add(flatRoofMesh);
    } else if (houseData.roofType === 'gabled') {
        // Gabled roof: more complex, requires finding dominant axis or making assumptions
        // For simplicity, assume a rectangular-ish base and gable along the longer side or a default orientation.
        // This is a simplified gabled roof. A more robust solution would analyze the polygon.
        const bounds = houseData.outline.reduce((acc, p) => ({
            minX: Math.min(acc.minX, p.x), minY: Math.min(acc.minY, p.y),
            maxX: Math.max(acc.maxX, p.x), maxY: Math.max(acc.maxY, p.y)
        }), {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});
        
        const roofWidth = bounds.maxX - bounds.minX;
        const roofDepth = bounds.maxY - bounds.minY;
        const roofPeakHeight = houseData.height * 0.3; // Arbitrary peak height

        const roofShape = new THREE.Shape();
        // Create a triangular prism shape for the gable
        if (roofWidth >= roofDepth) { // Gable along width
            roofShape.moveTo(-roofWidth / 2, 0);
            roofShape.lineTo(roofWidth / 2, 0);
            roofShape.lineTo(0, roofPeakHeight);
            roofShape.lineTo(-roofWidth / 2, 0);
        } else { // Gable along depth
             roofShape.moveTo(0, -roofDepth/2);
             roofShape.lineTo(0, roofDepth/2);
             roofShape.lineTo(roofPeakHeight,0); // This is simplified, assumes center ridge
             roofShape.lineTo(0, -roofDepth/2);
        }
        
        const gableExtrudeSettings = {
            depth: (roofWidth >= roofDepth) ? roofDepth : roofWidth,
            bevelEnabled: false
        };
        const gableGeometry = new THREE.ExtrudeGeometry(roofShape, gableExtrudeSettings);
        gableGeometry.center();
        const gabledRoofMesh = new THREE.Mesh(gableGeometry, roofMaterial);
        
        if (roofWidth >= roofDepth) {
            gabledRoofMesh.rotation.y = Math.PI/2; // Align depth
            gabledRoofMesh.position.z = 0; 
        } else {
            gabledRoofMesh.position.x = 0;
        }
        gabledRoofMesh.position.y = houseData.height + roofPeakHeight/2; // Center of gable on top of walls
        gabledRoofMesh.castShadow = true;
        gabledRoofMesh.receiveShadow = true;
        houseGroup.add(gabledRoofMesh);
    }
    return houseGroup;
}


// --- Model Loading Functions ---
async function loadAndConfigureHouseModel(group, houseData, modelLoaderInstance, modelPathPrefix, modelFileName) {
    const modelPath = `${modelPathPrefix}${modelFileName}`;
    const modelKey = modelPath;

    // Clear previous model from group if any
    while(group.children.length > 0){ 
        const child = group.children[0]; group.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    }
    try {
        let model;
        if (modelCache[modelKey]) {
            model = (await modelCache[modelKey]).clone(true);
        } else {
            modelCache[modelKey] = modelLoaderInstance.loadAsync(modelPath).then(gltf => gltf.scene);
            model = (await modelCache[modelKey]).clone(true);
        }
        
        const targetWidth = houseData.width;   
        const targetDepth = houseData.depth;   
        const targetHeight = houseData.height; 

        const box = new THREE.Box3().setFromObject(model);
        const modelSize = new THREE.Vector3();
        box.getSize(modelSize);

        const scaleX = modelSize.x > 0.001 ? targetWidth / modelSize.x : 1;
        const scaleY = modelSize.y > 0.001 ? targetHeight / modelSize.y : 1;
        const scaleZ = modelSize.z > 0.001 ? targetDepth / modelSize.z : 1;
        
        model.scale.set(scaleX, scaleY, scaleZ);
        
        const scaledBox = new THREE.Box3().setFromObject(model); 
        model.position.x = -(scaledBox.min.x + scaledBox.max.x) / 2; 
        model.position.y = -scaledBox.min.y; 
        model.position.z = -(scaledBox.min.z + scaledBox.max.z) / 2; 

        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) { 
                    if (Array.isArray(child.material)) child.material.forEach(m => { m.needsUpdate = true; });
                    else child.material.needsUpdate = true;
                }
            }
        });
        group.add(model);

    } catch (err) {
        console.error(`Error loading model ${modelPath}:`, err);
        // Fallback to a simple box if GLB fails
        const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const fallbackGeom = new THREE.BoxGeometry(houseData.width, houseData.height, houseData.depth);
        const fallbackMesh = new THREE.Mesh(fallbackGeom, fallbackMaterial);
        fallbackMesh.position.y = houseData.height / 2;
        group.add(fallbackMesh);
    }
    renderThreeScene();
}


async function loadAndConfigurePlantModel(group, plantData, modelLoaderInstance) {
    const modelFileName = plantData.data?.modelFile || "default_plant.glb"; 
    const modelPath = `${PLANT_MODEL_PATH}${modelFileName}`;
    const modelKey = modelPath; 

    while(group.children.length > 0){
        const child = group.children[0]; group.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    }
    try {
        let model;
        if (modelCache[modelKey]) {
            model = (await modelCache[modelKey]).clone(true);
        } else {
            modelCache[modelKey] = modelLoaderInstance.loadAsync(modelPath).then(gltf => gltf.scene);
            model = (await modelCache[modelKey]).clone(true);
        }
        const desiredHeight = plantData.height || 0.5; 
        const box = new THREE.Box3().setFromObject(model);
        const currentHeight = box.max.y - box.min.y;
        let scale = (currentHeight > 0.01) ? desiredHeight / currentHeight : 1;
        model.scale.set(scale, scale, scale);
        const scaledBox = new THREE.Box3().setFromObject(model);
        model.position.y = -scaledBox.min.y; 
        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                 if (child.material) { 
                    if (Array.isArray(child.material)) child.material.forEach(m => m.side = THREE.DoubleSide);
                    else child.material.side = THREE.DoubleSide;
                }
            }
        });
        group.add(model);
    } catch (err) {
        console.error(`Error loading plant model ${modelPath}:`, err);
        const fallbackPlant = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(plantData.width / 2, 0.1), 8, 6),
            new THREE.MeshStandardMaterial({ color: 0x90EE90, roughness: 0.8 })
        );
        fallbackPlant.position.y = plantData.height / 2; 
        group.add(fallbackPlant);
    }
    renderThreeScene();
}

async function loadAndConfigureTreeModel(group, treeData, season, modelLoaderInstance) {
    const species = treeData.data.species || 'generic_deciduous';
    const modelKey = `${species}_${season}`; 
    
    while(group.children.length > 0){ 
        const child = group.children[0]; group.remove(child);
        if (child.traverse) {
            child.traverse(obj => {
                if (obj.isMesh) {
                    if(obj.geometry) obj.geometry.dispose();
                    if(obj.material) {
                        if (Array.isArray(obj.material)) obj.material.forEach(m => { if(m.map) m.map.dispose(); m.dispose(); });
                        else { if(obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
                    }
                }
            });
        }
    }
    try {
        let model;
        if (modelCache[modelKey]) { 
            model = (await modelCache[modelKey]).clone(true);
        } else {
            const treeManifest = appContextRef?.treeManifest ? appContextRef.treeManifest() : {};
            const treeInfo = treeManifest[species];
            const modelFileName = treeInfo?.models?.[season] || `${species.toLowerCase().replace(/\s+/g, '_')}/${season}.glb`;
            const modelPath = `${TREE_MODEL_PATH}${modelFileName}`;
            
            modelCache[modelKey] = modelLoaderInstance.loadAsync(modelPath).then(gltf => gltf.scene);
            model = (await modelCache[modelKey]).clone(true);
        }
        _applyTreeConfiguration(model, treeData);
        group.add(model);
    } catch (err) {
        console.warn(`Error loading tree model for ${species} (${season}). Using fallback. Error:`, err);
        _addFallbackTreeMesh(group, treeData);
    }
    renderThreeScene();
}

function _applyTreeConfiguration(model, treeData) {
    const targetHeight = treeData.height; const targetCanopyWidth = treeData.width;
    const box = new THREE.Box3().setFromObject(model);
    const modelHeight = box.max.y - box.min.y;
    const modelWidth = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    let scaleY = (modelHeight > 0.01) ? targetHeight / modelHeight : 1;
    let scaleXZ = (modelWidth > 0.01) ? targetCanopyWidth / modelWidth : 1;
    model.scale.set(scaleXZ, scaleY, scaleXZ);
    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.y = -scaledBox.min.y; 
    model.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true; child.receiveShadow = true;
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(mat => {mat.depthWrite = true;});
                else { child.material.depthWrite = true;}
            }
        }
    });
}

function _addFallbackTreeMesh(group, treeData) {
    const canopyHeight = treeData.height * 0.6; const trunkHeight = treeData.height * 0.4;
    const canopyRadius = treeData.width / 2; const trunkRadius = canopyRadius / 5;
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(canopyRadius, 12, 8), new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.8 }));
    canopy.position.y = trunkHeight + canopyHeight / 2 - (treeData.height * 0.1);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkRadius * 0.8, trunkRadius, trunkHeight, 8), new THREE.MeshStandardMaterial({color: 0x8B4513, roughness: 0.9}));
    trunk.position.y = trunkHeight / 2;
    group.add(canopy); group.add(trunk);
    group.children.forEach(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
}

export function updateSeasonalAssetsInThree(elements, newSeason) {
    if (!GLTFLoaderConstructor) { return; }
    const modelLoaderInstance = new GLTFLoaderConstructor();
    elements.forEach(el => {
        if (el.isTree && el.threeInstance) {
            el.data.currentSeason = newSeason; // Update season in element data
            loadAndConfigureTreeModel(el.threeInstance, el, newSeason, modelLoaderInstance);
        }
        // Add logic for other seasonal elements if any
    });
    renderThreeScene();
}

export function updateShadows(sunCalcPosition) {
    if (!sunlight || !sunCalcPosition || !scene) return;
    const lotCfg = currentLotConfigRef();
    const R = Math.max(lotCfg.width, lotCfg.depth, DEFAULT_LOT_WIDTH_FT) * 1.3; 
    const phi = sunCalcPosition.azimuth + Math.PI; 
    const theta = Math.PI / 2 - sunCalcPosition.altitude;
    sunlight.position.set(R * Math.sin(theta) * Math.cos(phi), R * Math.cos(theta), R * Math.sin(theta) * Math.sin(phi));
    sunlight.target.position.set(0, 0, 0); // Target the center of the scene
    
    const intensityFactor = Math.max(0.1, Math.sin(sunCalcPosition.altitude)); // Sun is dimmer at horizon
    sunlight.intensity = 0.6 + intensityFactor * 2.2; 
    if (ambientLight) ambientLight.intensity = 0.5 + (1 - intensityFactor) * 0.4; 
    renderThreeScene();
}


export function updateElementRotationInThree(threeObject, rotationDegrees) {
    if (threeObject) {
        threeObject.rotation.y = THREE.MathUtils.degToRad(rotationDegrees);
        renderThreeScene();
    }
}

export function removeElementFromThree(threeObject) {
    if (!threeObject) return;
    if (threeObject.parent) {
        threeObject.parent.remove(threeObject);
    }
    // Dispose of geometries and materials to free memory
    threeObject.traverse(object => {
        if (object.isMesh) {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => {
                        if (material.map) material.map.dispose();
                        material.dispose();
                    });
                } else {
                    if (object.material.map) object.material.map.dispose();
                    object.material.dispose();
                }
            }
        }
    });
    renderThreeScene();
}

export function exportGLTFScene() {
     if (!GLTFExporterConstructor) {
        console.error("GLTFExporter constructor not available."); alert("GLTF Exporter is not available."); return;
    }
    const exporter = new GLTFExporterConstructor();
    const options = { 
        trs: false, // true if positions/rotations/scales are world-space, false if local (usually false for groups)
        onlyVisible: true, 
        binary: false, // true for .glb, false for .gltf
        // includeCustomExtensions: true (if you have any)
    };

    // Create a temporary scene for export to avoid modifying the live scene
    const exportContainerScene = new THREE.Scene();
    
    // Add ground plane clone
    if (groundPlane) {
        const groundClone = groundPlane.clone();
        // GLTF exporter might not handle ShapeGeometry well if it's not triangulated.
        // PlaneGeometry should be fine. For custom shapes, ensure they are exportable.
        exportContainerScene.add(groundClone);
    }

    // Add regular elements
    const elementsToExport = currentElementsRef ? currentElementsRef() : [];
    elementsToExport.forEach(appElement => {
        if (appElement.threeInstance) {
            const clone = appElement.threeInstance.clone(true); // Deep clone
            exportContainerScene.add(clone);
        }
    });

    // Add custom house if it exists
    const customHouseData = currentCustomHouseRef ? currentCustomHouseRef() : null;
    if (customHouseData && customHouseData.threeInstance) {
        const houseClone = customHouseData.threeInstance.clone(true);
        exportContainerScene.add(houseClone);
    }
    
    try {
        exporter.parse(exportContainerScene,
            function (result) {
                const filenameBase = `VerdantVision_Scene_${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
                if (options.binary && result instanceof ArrayBuffer) {
                    saveData(new Blob([result], {type: 'application/octet-stream'}), `${filenameBase}.glb`);
                } else {
                    saveData(new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'}), `${filenameBase}.gltf`);
                }
                alert("Scene exported as " + (options.binary ? ".glb" : ".gltf") + "!");
            },
            function (error) { console.error('Error during GLTF exportation:', error); alert('Failed to export GLTF.'); },
            options
        );
    } catch (e) { console.error('Error calling exporter.parse:', e); alert('Error during GLTF export initiation.'); }
}

function saveData(blob, filename) {
    const link = document.createElement('a'); link.style.display = 'none'; document.body.appendChild(link);
    link.href = URL.createObjectURL(blob); link.download = filename; link.click();
    URL.revokeObjectURL(link.href); document.body.removeChild(link);
}