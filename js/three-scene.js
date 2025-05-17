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
const DEFAULT_LOT_WIDTH_FT = 50; 
const DEFAULT_LOT_DEPTH_FT = 100; 

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
        
        currentLotConfigRef = options.lotConfigRef; 
        onElementSelectCallback = options.onElementSelect;
        currentElementsRef = options.elementsRef;
        currentCustomHouseRef = options.customHouseRef;

        GLTFExporterConstructor = options.getGLTFExporter;
        OrbitControlsConstructor = options.OrbitControls; GLTFLoaderConstructor = options.GLTFLoader;

        if (!OrbitControlsConstructor) throw new Error("OrbitControls not provided.");
        if (!GLTFLoaderConstructor) throw new Error("GLTFLoader not provided.");
        
        const lotCfg = currentLotConfigRef ? currentLotConfigRef() : { width: DEFAULT_LOT_WIDTH_FT, depth: DEFAULT_LOT_DEPTH_FT };
        DEFAULT_NORTH_FACING_POSITION.set(0, (lotCfg.depth || DEFAULT_LOT_DEPTH_FT) * 0.5, (lotCfg.depth || DEFAULT_LOT_DEPTH_FT) * 0.6);


        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xade0fc); 
        scene.fog = new THREE.Fog(0xade0fc, (lotCfg.width || DEFAULT_LOT_WIDTH_FT) * 0.6, (lotCfg.width || DEFAULT_LOT_WIDTH_FT) * 2.8);

        const aspectRatio = (container.clientWidth || DEFAULT_CANVAS_SIZE_PX_THREE) / (container.clientHeight || DEFAULT_CANVAS_SIZE_PX_THREE);
        camera = new THREE.PerspectiveCamera(50, aspectRatio, 0.1, (Math.max(lotCfg.width || DEFAULT_LOT_WIDTH_FT, lotCfg.depth || DEFAULT_LOT_DEPTH_FT)) * 5);
        
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
        controls.maxDistance = (Math.max(lotCfg.width || DEFAULT_LOT_WIDTH_FT, lotCfg.depth || DEFAULT_LOT_DEPTH_FT)) * 1.5;
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

        updateGroundPlane();

        raycaster = new THREE.Raycaster(); mouse = new THREE.Vector2();
        renderer.domElement.addEventListener('click', onMouseClickIn3D, false);
        window.addEventListener('resize', onWindowResize, false); 
        onWindowResize(); 
        
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
    if (!scene || !currentLotConfigRef) return;
    const lotCfg = currentLotConfigRef();
    if (!lotCfg) {
      console.warn("Lot config not available for ground plane update.");
      return;
    }

    if (groundPlane) {
        scene.remove(groundPlane);
        groundPlane.geometry.dispose();
        if (Array.isArray(groundPlane.material)) groundPlane.material.forEach(m => { if(m.map) m.map.dispose(); m.dispose(); });
        else { if (groundPlane.material.map) groundPlane.material.map.dispose(); groundPlane.material.dispose(); }
        groundPlane = null;
    }
    
    let groundGeometry;
    let lotActualWidth = lotCfg.width || DEFAULT_LOT_WIDTH_FT;
    let lotActualDepth = lotCfg.depth || DEFAULT_LOT_DEPTH_FT;

    if (lotCfg.isCustomShape && lotCfg.customShapePoints && lotCfg.customShapePoints.length >= 3) {
        const shape = new THREE.Shape();
        const bounds = lotCfg.customShapePoints.reduce((acc, p) => ({
            minX: Math.min(acc.minX, p.x), minY: Math.min(acc.minY, p.y),
            maxX: Math.max(acc.maxX, p.x), maxY: Math.max(acc.maxY, p.y)
        }), {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});
        
        lotActualWidth = bounds.maxX - bounds.minX;
        lotActualDepth = bounds.maxY - bounds.minY;

        const offsetX = -(bounds.minX + lotActualWidth / 2);
        const offsetY = -(bounds.minY + lotActualDepth / 2);

        shape.moveTo(lotCfg.customShapePoints[0].x + offsetX, lotCfg.customShapePoints[0].y + offsetY);
        for (let i = 1; i < lotCfg.customShapePoints.length; i++) {
            shape.lineTo(lotCfg.customShapePoints[i].x + offsetX, lotCfg.customShapePoints[i].y + offsetY);
        }
        groundGeometry = new THREE.ShapeGeometry(shape);
    } else {
        groundGeometry = new THREE.PlaneGeometry(lotActualWidth, lotActualDepth);
    }

    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x77aa55, roughness: 0.9, metalness: 0.1 });
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2; 
    groundPlane.receiveShadow = true;
    groundPlane.name = "ground";
    scene.add(groundPlane);

    textureLoader.load('assets/textures/grass_detailed.jpg',
        (texture) => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            const textureWorldWidth = 25; 
            const repeatX = lotActualWidth / textureWorldWidth;
            const repeatY = lotActualDepth / textureWorldWidth;
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
    
    const newFogNear = Math.max(lotActualWidth, lotActualDepth) * 0.6;
    const newFogFar = Math.max(lotActualWidth, lotActualDepth) * 2.8;
    if (scene.fog) {
        scene.fog.near = newFogNear;
        scene.fog.far = newFogFar;
    }
    if (camera) {
        camera.far = Math.max(lotActualWidth, lotActualDepth) * 5;
        camera.updateProjectionMatrix();
    }
    if (controls) {
        controls.maxDistance = Math.max(lotActualWidth, lotActualDepth) * 1.5;
    }
    if (sunlight && sunlight.shadow) {
        sunlight.shadow.camera.far = Math.max(lotActualWidth, lotActualDepth) * 1.8;
        const shadowCamSize = Math.max(lotActualWidth, lotActualDepth) * 0.8;
        sunlight.shadow.camera.left = -shadowCamSize; sunlight.shadow.camera.right = shadowCamSize;
        sunlight.shadow.camera.top = shadowCamSize; sunlight.shadow.camera.bottom = -shadowCamSize;
        sunlight.shadow.camera.updateProjectionMatrix();
    }

    renderThreeScene();
}


export function resetCameraToNorthView() {
    if (camera && controls && currentLotConfigRef) {
        const lotCfg = currentLotConfigRef();
         let effectiveDepth = lotCfg.depth || DEFAULT_LOT_DEPTH_FT;
        if (lotCfg.isCustomShape && lotCfg.customShapePoints && lotCfg.customShapePoints.length > 0) {
            const bounds = lotCfg.customShapePoints.reduce((acc, p) => ({
                minY: Math.min(acc.minY, p.y), maxY: Math.max(acc.maxY, p.y)
            }), {minY: Infinity, maxY: -Infinity});
            effectiveDepth = bounds.maxY - bounds.minY;
        }
        
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
    const newWidth = container.clientWidth; 
    const newHeight = container.clientHeight;

    if (newWidth > 0 && newHeight > 0) {
        camera.aspect = newWidth / newHeight; 
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight); 
        renderThreeScene();
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
        while (intersectedObject.parent && intersectedObject.parent !== scene && 
               !intersectedObject.userData.elementId && !intersectedObject.userData.customHouseId) {
            intersectedObject = intersectedObject.parent;
        }
        if (intersectedObject.userData && (intersectedObject.userData.elementId !== undefined || intersectedObject.userData.customHouseId !== undefined)) {
            return intersectedObject;
        } else if (intersects[0].object.name === "ground") {
            return intersects[0]; 
        }
    }
    return null;
}

function onMouseClickIn3D(event) {
    if (appContextRef && appContextRef.isDrawing && appContextRef.isDrawing()) return; 

    const clickedResult = getClickedObjectIn3D(event);
    if (clickedResult) {
        if (clickedResult.userData && clickedResult.userData.elementId !== undefined) {
            if (onElementSelectCallback) onElementSelectCallback(clickedResult.userData.elementId, '3D');
        } else if (clickedResult.userData && clickedResult.userData.customHouseId !== undefined) {
            if (onElementSelectCallback) onElementSelectCallback(clickedResult.userData.customHouseId, '3D');
        } else if (clickedResult.object && clickedResult.object.name === "ground") {
             if (onElementSelectCallback) onElementSelectCallback(null, '3D'); 
        }
    } else { if (onElementSelectCallback) onElementSelectCallback(null, '3D'); } 
}

export function addElementToThree(elementData, currentSeason) {
    if (!scene || !GLTFLoaderConstructor || !currentLotConfigRef) { return; }
    const lotCfg = currentLotConfigRef();
    if (!lotCfg) return;

    try {
        const modelLoaderInstance = new GLTFLoaderConstructor();
        let elementGroup = new THREE.Group();
        
        const lotCenterX = lotCfg.isCustomShape && lotCfg.customShapePoints && lotCfg.customShapePoints.length > 0 ? 
                            (Math.min(...lotCfg.customShapePoints.map(p => p.x)) + Math.max(...lotCfg.customShapePoints.map(p => p.x))) / 2 
                            : 0; 
        const lotCenterZ = lotCfg.isCustomShape && lotCfg.customShapePoints && lotCfg.customShapePoints.length > 0 ?
                            (Math.min(...lotCfg.customShapePoints.map(p => p.y)) + Math.max(...lotCfg.customShapePoints.map(p => p.y))) / 2
                            : 0;

        const threeX = elementData.x + elementData.width / 2 - lotCenterX;
        const threeZ = elementData.y + elementData.depth / 2 - lotCenterZ;
        let threeY = 0; 

        let mainMesh; 

        switch (elementData.type) {
            case 'house': 
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
                mainMesh.rotation.x = -Math.PI / 2; threeY = elementData.height / 2 + 0.01; break; 
            default: mainMesh = new THREE.Mesh(new THREE.BoxGeometry(elementData.width || 1, elementData.height || 1, elementData.depth || 1), new THREE.MeshStandardMaterial({ color: 0xff00ff })); 
                threeY = (elementData.height || 1) / 2;
        }

        if (mainMesh) elementGroup.add(mainMesh);
        
        elementGroup.position.set(threeX, threeY, threeZ);
        if (elementData.rotation && appContextRef && appContextRef.ROTATABLE_ELEMENT_TYPES && appContextRef.ROTATABLE_ELEMENT_TYPES.includes(elementData.type)) {
            elementGroup.rotation.y = THREE.MathUtils.degToRad(elementData.rotation);
        }

        elementGroup.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
        elementGroup.userData = { elementId: elementData.id, type: elementData.type }; 
        scene.add(elementGroup); elementData.threeInstance = elementGroup; 
        renderThreeScene();
    } catch (error) { console.error(`Error adding element ID ${elementData.id} (type ${elementData.type}) to 3D scene:`, error); }
}

// --- Custom House 3D ---
export function addCustomHouseToThree(houseData) {
    if (!scene || !currentLotConfigRef) return;
    if (houseData.threeInstance) { // Should be handled by updateCustomHouseInThree's removal
        removeCustomHouseFromThree(houseData.threeInstance);
    }
    
    const houseGroup = createCustomHouseMesh(houseData);
    const lotCfg = currentLotConfigRef();
    if (!lotCfg) return;
    
    const lotCenterX = lotCfg.isCustomShape && lotCfg.customShapePoints && lotCfg.customShapePoints.length > 0 ? 
                        (Math.min(...lotCfg.customShapePoints.map(p => p.x)) + Math.max(...lotCfg.customShapePoints.map(p => p.x))) / 2 
                        : 0;
    const lotCenterZ = lotCfg.isCustomShape && lotCfg.customShapePoints && lotCfg.customShapePoints.length > 0 ?
                        (Math.min(...lotCfg.customShapePoints.map(p => p.y)) + Math.max(...lotCfg.customShapePoints.map(p => p.y))) / 2
                        : 0;

    const houseThreeX = houseData.x + houseData.width / 2 - lotCenterX;
    const houseThreeZ = houseData.y + houseData.depth / 2 - lotCenterZ;
    
    houseGroup.position.set(houseThreeX, 0, houseThreeZ); 
    if (houseData.rotation) {
        houseGroup.rotation.y = THREE.MathUtils.degToRad(houseData.rotation);
    }
    
    houseGroup.userData = { customHouseId: houseData.id, type: 'custom_house' };
    scene.add(houseGroup);
    houseData.threeInstance = houseGroup; 
    renderThreeScene();
}

export function updateCustomHouseInThree(houseData) {
    if (houseData.threeInstance) {
        removeCustomHouseFromThree(houseData.threeInstance); // Dispose old before adding new
        houseData.threeInstance = null; // Clear reference
    }
    addCustomHouseToThree(houseData); 
}

export function removeCustomHouseFromThree(houseThreeInstance) {
    if (houseThreeInstance && houseThreeInstance.parent) {
        scene.remove(houseThreeInstance);
        houseThreeInstance.traverse(object => {
            if (object.isMesh) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(m => { 
                            if(m.map) m.map.dispose(); 
                            m.dispose();
                        });
                    } else {
                        if (object.material.map) object.material.map.dispose(); 
                        object.material.dispose(); 
                    }
                }
            }
        });
    }
    renderThreeScene();
}


function createCustomHouseMesh(houseData) {
    const houseGroup = new THREE.Group();
    
    // Wall Material - uses houseData.wallColor
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color(houseData.wallColor || '#d3c1a4'), 
        roughness: 0.8, 
        side: THREE.DoubleSide 
    });

    // Roof Material - always red MeshBasicMaterial
    const roofMaterialRedBasic = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });


    // --- Walls ---
    const wallFootprintShape = new THREE.Shape();
    if (houseData.outline && houseData.outline.length > 0) {
        houseData.outline.forEach((p, i) => {
            if (i === 0) wallFootprintShape.moveTo(p.x, p.y);
            else wallFootprintShape.lineTo(p.x, p.y);
        });
        if (houseData.outline.length > 2 && 
            (houseData.outline[0].x !== houseData.outline[houseData.outline.length - 1].x || 
             houseData.outline[0].y !== houseData.outline[houseData.outline.length - 1].y)) {
            wallFootprintShape.lineTo(houseData.outline[0].x, houseData.outline[0].y);
        }
    } else { // Fallback if no outline
        const fallbackWidth = houseData.width || 10;
        const fallbackDepth = houseData.depth || 10;
        wallFootprintShape.moveTo(-fallbackWidth/2, -fallbackDepth/2);
        wallFootprintShape.lineTo( fallbackWidth/2, -fallbackDepth/2);
        wallFootprintShape.lineTo( fallbackWidth/2,  fallbackDepth/2);
        wallFootprintShape.lineTo(-fallbackWidth/2,  fallbackDepth/2);
        wallFootprintShape.closePath();
    }

    const extrudeSettings = {
        steps: 1,
        depth: houseData.wallHeight, 
        bevelEnabled: false
    };
    const wallGeometry = new THREE.ExtrudeGeometry(wallFootprintShape, extrudeSettings);
    wallGeometry.rotateX(-Math.PI / 2);
    wallGeometry.center(); 

    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.position.y = houseData.wallHeight / 2; 
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    houseGroup.add(wallMesh);

    // --- Roof ---
    const roofBaseOutline = houseData.outline || [ // Fallback for roof base if main outline was missing
        {x: -houseData.width/2, y: -houseData.depth/2}, {x: houseData.width/2, y: -houseData.depth/2},
        {x: houseData.width/2, y: houseData.depth/2}, {x: -houseData.width/2, y: houseData.depth/2}
    ];

    if (houseData.roofType === 'flat' && roofBaseOutline.length > 0) {
        const flatRoofShape = new THREE.Shape();
        roofBaseOutline.forEach((p, i) => {
            if (i === 0) flatRoofShape.moveTo(p.x, p.y); else flatRoofShape.lineTo(p.x, p.y);
        });
         if (roofBaseOutline.length > 2 && (roofBaseOutline[0].x !== roofBaseOutline[roofBaseOutline.length - 1].x || roofBaseOutline[0].y !== roofBaseOutline[roofBaseOutline.length - 1].y)) {
             flatRoofShape.lineTo(roofBaseOutline[0].x, roofBaseOutline[0].y);
        }
        const roofGeometry = new THREE.ShapeGeometry(flatRoofShape);
        roofGeometry.center(); 
        
        const flatRoofMesh = new THREE.Mesh(roofGeometry, roofMaterialRedBasic);
        flatRoofMesh.rotation.x = -Math.PI / 2; 
        flatRoofMesh.position.y = houseData.wallHeight; 
        flatRoofMesh.castShadow = true;
        houseGroup.add(flatRoofMesh);

    } else if (houseData.roofType === 'gabled' && roofBaseOutline.length > 0) {
        const bounds = roofBaseOutline.reduce((acc, p) => ({
            minX: Math.min(acc.minX, p.x), minY: Math.min(acc.minY, p.y),
            maxX: Math.max(acc.maxX, p.x), maxY: Math.max(acc.maxY, p.y)
        }), {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});
        
        const roofFootprintWidth = bounds.maxX - bounds.minX; 
        const roofFootprintDepth = bounds.maxY - bounds.minY; 
        const roofPeakRelativeHeight = (houseData.roofPeakHeightRatio || 0.3) * Math.min(roofFootprintWidth, roofFootprintDepth);


        const gableProfile = new THREE.Shape();
        let extrusionLength;
        let requiresYRotation = false;
        const gableAlongX = (houseData.gableDirection === 'x_axis') || (!houseData.gableDirection && roofFootprintWidth >= roofFootprintDepth);

        if (gableAlongX) { 
            gableProfile.moveTo(-roofFootprintDepth / 2, 0); 
            gableProfile.lineTo(roofFootprintDepth / 2, 0);  
            gableProfile.lineTo(0, roofPeakRelativeHeight);        
            gableProfile.closePath();
            extrusionLength = roofFootprintWidth; 
            requiresYRotation = true; 
        } else { 
            gableProfile.moveTo(-roofFootprintWidth / 2, 0);
            gableProfile.lineTo(roofFootprintWidth / 2, 0);
            gableProfile.lineTo(0, roofPeakRelativeHeight);
            gableProfile.closePath();
            extrusionLength = roofFootprintDepth; 
        }
        
        const gableExtrudeSettings = { depth: extrusionLength, bevelEnabled: false };
        const gableGeometry = new THREE.ExtrudeGeometry(gableProfile, gableExtrudeSettings);
        
        if (requiresYRotation) gableGeometry.rotateY(Math.PI / 2); 
        gableGeometry.center(); 

        const gabledRoofMesh = new THREE.Mesh(gableGeometry, roofMaterialRedBasic);
        gabledRoofMesh.position.y = houseData.wallHeight + roofPeakRelativeHeight / 2;
        
        gabledRoofMesh.castShadow = true;
        houseGroup.add(gabledRoofMesh);

    } else if (houseData.roofType === 'hipped' && roofBaseOutline.length > 0) {
        const bounds = roofBaseOutline.reduce((acc, p) => ({
            minX: Math.min(acc.minX, p.x), minY: Math.min(acc.minY, p.y),
            maxX: Math.max(acc.maxX, p.x), maxY: Math.max(acc.maxY, p.y)
        }), {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});

        const footprintWidth = bounds.maxX - bounds.minX;
        const footprintDepth = bounds.maxY - bounds.minY;
        const peakHeight = (houseData.hipRoofPeakHeightRatio || 0.3) * Math.min(footprintWidth, footprintDepth); // Relative to wall top

        const vertices = [];
        const indices = [];

        // Base vertices (at wall height, centered footprint)
        const v0 = new THREE.Vector3(bounds.minX, houseData.wallHeight, bounds.minY); // Front-left
        const v1 = new THREE.Vector3(bounds.maxX, houseData.wallHeight, bounds.minY); // Front-right
        const v2 = new THREE.Vector3(bounds.maxX, houseData.wallHeight, bounds.maxY); // Back-right
        const v3 = new THREE.Vector3(bounds.minX, houseData.wallHeight, bounds.maxY); // Back-left

        // Ridge vertices (centered on footprint, at peak height)
        // For a rectangular base, the ridge is shorter than the longer side by the amount the shorter side "cuts in"
        let ridgePoint1, ridgePoint2;
        if (footprintWidth > footprintDepth) { // Ridge along X-axis
            const ridgeLength = footprintWidth - footprintDepth; // Assuming 45-degree hip slope
            ridgePoint1 = new THREE.Vector3(bounds.minX + footprintDepth / 2, houseData.wallHeight + peakHeight, bounds.minY + footprintDepth/2);
            ridgePoint2 = new THREE.Vector3(bounds.maxX - footprintDepth / 2, houseData.wallHeight + peakHeight, bounds.minY + footprintDepth/2);
             // Correction: ridge should be centered along Z
            ridgePoint1.z = bounds.minY + footprintDepth / 2;
            ridgePoint2.z = bounds.minY + footprintDepth / 2;

        } else if (footprintDepth > footprintWidth) { // Ridge along Z-axis
            const ridgeLength = footprintDepth - footprintWidth; // Assuming 45-degree hip slope
            ridgePoint1 = new THREE.Vector3(bounds.minX + footprintWidth/2, houseData.wallHeight + peakHeight, bounds.minY + footprintWidth / 2);
            ridgePoint2 = new THREE.Vector3(bounds.minX + footprintWidth/2, houseData.wallHeight + peakHeight, bounds.maxY - footprintWidth / 2);
            // Correction: ridge should be centered along X
            ridgePoint1.x = bounds.minX + footprintWidth / 2;
            ridgePoint2.x = bounds.minX + footprintWidth / 2;
        } else { // Square base, ridge is a single point
            ridgePoint1 = new THREE.Vector3(bounds.minX + footprintWidth/2, houseData.wallHeight + peakHeight, bounds.minY + footprintDepth/2);
            ridgePoint2 = ridgePoint1.clone();
        }
        
        // Adjust vertex positions to be relative to houseGroup origin (0,0,0)
        // The houseData.outline points are already relative to house center.
        // So v0,v1,v2,v3 need to be based on these relative outline points.
        // And ridgePoint1, ridgePoint2 also relative to this center.

        const basePoints = roofBaseOutline.map(p => new THREE.Vector3(p.x, 0, p.y)); // at Y=0 relative to houseGroup

        // Assuming rectangular outline for simplicity for hipped roof points
        const hFW = footprintWidth / 2; // half footprint width
        const hFD = footprintDepth / 2; // half footprint depth

        vertices.push(
            // Base vertices (Y=0, will be translated up by houseData.wallHeight later)
            -hFW, 0, -hFD, // 0: front-left-base
             hFW, 0, -hFD, // 1: front-right-base
             hFW, 0,  hFD, // 2: back-right-base
            -hFW, 0,  hFD  // 3: back-left-base
        );

        let rP1x, rP1z, rP2x, rP2z;
        if (footprintWidth > footprintDepth) {
            rP1x = -(footprintWidth/2 - footprintDepth/2); rP1z = 0;
            rP2x =  (footprintWidth/2 - footprintDepth/2); rP2z = 0;
        } else if (footprintDepth > footprintWidth) {
            rP1x = 0; rP1z = -(footprintDepth/2 - footprintWidth/2);
            rP2x = 0; rP2z =  (footprintDepth/2 - footprintWidth/2);
        } else { // Square
            rP1x = 0; rP1z = 0;
            rP2x = 0; rP2z = 0;
        }
        vertices.push(
            rP1x, peakHeight, rP1z, // 4: ridge point 1
            rP2x, peakHeight, rP2z  // 5: ridge point 2
        );
        
        // Define faces (indices for the vertices array)
        indices.push(
            0, 4, 1,  1, 4, 5,  1, 5, 2, // Front face (triangle, quad, triangle)
            2, 5, 3,  3, 5, 4,  3, 4, 0  // Back face (triangle, quad, triangle)
        );
        if (footprintWidth > footprintDepth) { // Ridge along X
             indices.length = 0; // Clear and redefine for trapezoids + triangles
             indices.push(
                0, 1, 4, // Front triangle (if ridge shorter than base) -> actually one side of hip
                1, 5, 4, // Connects to ridge
                
                1, 2, 5, // Right side hip (triangle)
                3, 0, 4, // Left side hip (triangle)

                2, 3, 5, // Back trapezoid part 1
                3, 4, 5  // Back trapezoid part 2
             );
             // Corrected for typical hipped roof on rectangle (W > D)
             // Two trapezoids along W, two triangles along D
             indices.length = 0;
             // Front face (trapezoid along W)
             indices.push(0, 1, 5); indices.push(0, 5, 4);
             // Back face (trapezoid along W)
             indices.push(3, 4, 5); indices.push(3, 5, 2);
             // Left end (triangle along D)
             indices.push(0, 4, 3);
             // Right end (triangle along D)
             indices.push(1, 2, 5);

        } else if (footprintDepth > footprintWidth) { // Ridge along Z
             indices.length = 0;
             // Front face (triangle along W)
             indices.push(0, 1, 4);
             // Back face (triangle along W)
             indices.push(3, 2, 5);
             // Left side (trapezoid along D)
             indices.push(0, 4, 5); indices.push(0, 5, 3);
             // Right side (trapezoid along D)
             indices.push(1, 2, 5); indices.push(1, 5, 4);
        } else { // Square base, pyramid
            indices.length = 0;
            indices.push(0,1,4); // Front
            indices.push(1,2,4); // Right
            indices.push(2,3,4); // Back
            indices.push(3,0,4); // Left
        }


        const hipGeometry = new THREE.BufferGeometry();
        hipGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        hipGeometry.setIndex(indices);
        hipGeometry.computeVertexNormals(); // Good for shading if not basic material

        const hipRoofMesh = new THREE.Mesh(hipGeometry, roofMaterialRedBasic);
        hipRoofMesh.position.y = houseData.wallHeight; // Position base of roof at top of walls
        hipRoofMesh.castShadow = true;
        houseGroup.add(hipRoofMesh);
    }
    return houseGroup;
}


// --- Model Loading Functions ---
async function loadAndConfigureHouseModel(group, houseData, modelLoaderInstance, modelPathPrefix, modelFileName) {
    const modelPath = `${modelPathPrefix}${modelFileName}`;
    const modelKey = modelPath;

    while(group.children.length > 0){ 
        const child = group.children[0]; group.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => { if(m.map) m.map.dispose(); m.dispose(); });
            else { if(child.material.map) child.material.map.dispose(); child.material.dispose(); }
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
        const targetHeight = houseData.height; // This is actual model height for default house

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
            if (Array.isArray(child.material)) child.material.forEach(m => { if(m.map) m.map.dispose(); m.dispose(); });
            else { if(child.material.map) child.material.map.dispose(); child.material.dispose(); }
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
            el.data.currentSeason = newSeason; 
            loadAndConfigureTreeModel(el.threeInstance, el, newSeason, modelLoaderInstance);
        }
    });
    renderThreeScene();
}

export function updateShadows(sunCalcPosition) {
    if (!sunlight || !sunCalcPosition || !scene || !currentLotConfigRef) return;
    const lotCfg = currentLotConfigRef();
    if(!lotCfg) return;

    const R = Math.max(lotCfg.width || DEFAULT_LOT_WIDTH_FT, lotCfg.depth || DEFAULT_LOT_DEPTH_FT, DEFAULT_LOT_WIDTH_FT) * 1.3; 
    const phi = sunCalcPosition.azimuth + Math.PI; 
    const theta = Math.PI / 2 - sunCalcPosition.altitude;
    sunlight.position.set(R * Math.sin(theta) * Math.cos(phi), R * Math.cos(theta), R * Math.sin(theta) * Math.sin(phi));
    sunlight.target.position.set(0, 0, 0); 
    
    const intensityFactor = Math.max(0.1, Math.sin(sunCalcPosition.altitude)); 
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
        trs: false, 
        onlyVisible: true, 
        binary: false, 
    };

    const exportContainerScene = new THREE.Scene();
    
    if (groundPlane) {
        const groundClone = groundPlane.clone();
        exportContainerScene.add(groundClone);
    }

    const elementsToExport = currentElementsRef ? currentElementsRef() : [];
    elementsToExport.forEach(appElement => {
        if (appElement.threeInstance) {
            const clone = appElement.threeInstance.clone(true); 
            exportContainerScene.add(clone);
        }
    });

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