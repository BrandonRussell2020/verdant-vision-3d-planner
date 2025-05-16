// js/three-scene.js
// Handles all Three.js related logic for the 3D view

import * as THREE from 'three';
// OrbitControls, GLTFLoader, GLTFExporterConstructor are passed in options from app.js

// --- Module-level Variables ---
let scene, camera, renderer, controls, raycaster, mouse;
let groundPlane, sunlight, ambientLight;
let threeCanvas;

let onElementSelectCallback;
let currentElementsRef;
let GLTFExporterConstructor;
let OrbitControlsConstructor, GLTFLoaderConstructor; // These are passed in initThreeScene

let lotWidthGL, lotDepthGL;

const modelCache = {}; // Cache for loaded GLTF models: { 'path/to/model.glb': Promise<THREE.Group> }
const textureLoader = new THREE.TextureLoader(); 

const PLANT_MODEL_PATH = 'assets/models/plants/';
const TREE_MODEL_PATH = 'assets/models/trees/';
const HOUSE_MODEL_PATH = 'assets/models/other/houses/'; // Path for custom house models
const DEFAULT_CANVAS_SIZE_PX_THREE = 600;

let appContextRef = null;
export function setAppContextForThree(context) {
    appContextRef = context;
}

// --- Compass Elements ---
let compassArrowElement3D = null;

// --- Default Camera Positions ---
const DEFAULT_NORTH_FACING_POSITION = new THREE.Vector3(); 
const DEFAULT_NORTH_FACING_TARGET = new THREE.Vector3(0, 0, 0); 

// --- Initialization ---
export function initThreeScene(container, options) {
    try {
        if (!THREE) throw new Error("Three.js core library not available for 3D scene.");
        lotWidthGL = options.lotWidth; lotDepthGL = options.lotDepth;
        onElementSelectCallback = options.onElementSelect; currentElementsRef = options.elementsRef;
        GLTFExporterConstructor = options.getGLTFExporter;
        OrbitControlsConstructor = options.OrbitControls; GLTFLoaderConstructor = options.GLTFLoader;

        if (!OrbitControlsConstructor) throw new Error("OrbitControls not provided.");
        if (!GLTFLoaderConstructor) throw new Error("GLTFLoader not provided.");

        DEFAULT_NORTH_FACING_POSITION.set(0, lotDepthGL * 0.5, lotDepthGL * 0.6);

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xade0fc);
        scene.fog = new THREE.Fog(0xade0fc, lotWidthGL * 0.6, lotWidthGL * 2.8);

        const aspectRatio = (container.clientWidth || DEFAULT_CANVAS_SIZE_PX_THREE) / (container.clientHeight || DEFAULT_CANVAS_SIZE_PX_THREE);
        camera = new THREE.PerspectiveCamera(50, aspectRatio, 0.1, lotWidthGL * 5);
        
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(container.clientWidth || DEFAULT_CANVAS_SIZE_PX_THREE, container.clientHeight || DEFAULT_CANVAS_SIZE_PX_THREE);
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);
        threeCanvas = renderer.domElement;

        controls = new OrbitControlsConstructor(camera, renderer.domElement);
        controls.enableDamping = true; controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 - 0.03; controls.minDistance = 5; controls.maxDistance = lotWidthGL * 1.5;
        controls.screenSpacePanning = false;
        
        resetCameraToNorthView(); 

        ambientLight = new THREE.AmbientLight(0xffffff, 0.8); scene.add(ambientLight);
        sunlight = new THREE.DirectionalLight(0xffffff, 2.5); 
        sunlight.position.set(lotWidthGL * 0.35, lotWidthGL * 0.55, lotDepthGL * 0.25);
        sunlight.castShadow = true; sunlight.shadow.mapSize.width = 2048; sunlight.shadow.mapSize.height = 2048;
        sunlight.shadow.camera.near = 1; sunlight.shadow.camera.far = lotWidthGL * 1.8;
        const shadowCamSize = Math.max(lotWidthGL, lotDepthGL) * 0.8;
        sunlight.shadow.camera.left = -shadowCamSize; sunlight.shadow.camera.right = shadowCamSize;
        sunlight.shadow.camera.top = shadowCamSize; sunlight.shadow.camera.bottom = -shadowCamSize;
        sunlight.shadow.bias = -0.0008; 
        scene.add(sunlight); sunlight.target.position.set(0,0,0); scene.add(sunlight.target);

        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x77aa55, roughness: 0.9, metalness: 0.1 });
        groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(lotWidthGL, lotDepthGL), groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2; groundPlane.receiveShadow = true; groundPlane.name = "ground";
        scene.add(groundPlane);

        textureLoader.load('assets/textures/grass_detailed.jpg',
            (texture) => {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                const textureImageWidth = 800; const textureImageHeight = 600;
                const textureAspectRatio = textureImageHeight / textureImageWidth;
                const desiredTextureWorldWidth = 25;
                const repeatX = lotWidthGL / desiredTextureWorldWidth;
                const repeatY = lotDepthGL / (desiredTextureWorldWidth * textureAspectRatio);
                texture.repeat.set(repeatX, repeatY);
                texture.colorSpace = THREE.SRGBColorSpace;
                groundPlane.material.map = texture; 
                groundPlane.material.needsUpdate = true;
                renderThreeScene();
            },
            undefined, 
            (err) => {
                console.warn("Failed to load ground texture 'assets/textures/grass_detailed.jpg'. Using default green.", err);
                renderThreeScene();
            }
        );

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

export function resetCameraToNorthView() {
    if (camera && controls) {
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
        while (intersectedObject.parent && intersectedObject.parent !== scene && !intersectedObject.userData.elementId) {
            intersectedObject = intersectedObject.parent;
        }
        if (intersectedObject.userData && intersectedObject.userData.elementId !== undefined) return intersectedObject;
        else if (intersects[0].object.name === "ground") return intersects[0];
    }
    return null;
}

function onMouseClickIn3D(event) {
    const clickedResult = getClickedObjectIn3D(event);
    if (clickedResult) {
        if (clickedResult.userData && clickedResult.userData.elementId !== undefined) {
            if (onElementSelectCallback) onElementSelectCallback(clickedResult.userData.elementId, '3D');
        } else if (clickedResult.object && clickedResult.object.name === "ground") {
             if (onElementSelectCallback) onElementSelectCallback(null, '3D');
        }
    } else { if (onElementSelectCallback) onElementSelectCallback(null, '3D'); }
}

export function addElementToThree(elementData, currentSeason) {
    if (!scene || !GLTFLoaderConstructor) { return; }
    try {
        const modelLoaderInstance = new GLTFLoaderConstructor();
        let elementGroup = new THREE.Group();
        
        const threeX = elementData.x + elementData.width / 2 - lotWidthGL / 2;
        const threeZ = elementData.y + elementData.depth / 2 - lotDepthGL / 2;
        let threeY = 0; 

        let mainMesh; 

        switch (elementData.type) {
            case 'house':
                threeY = 0; // House model origin should be at its base
                loadAndConfigureHouseModel(elementGroup, elementData, modelLoaderInstance);
                break;

            case 'shed': // Keeping procedural shed for now, can be upgraded to GLB like house
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
            // ... (other cases remain the same as verdant_vision_three_scene_v7)
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
        scene.add(elementGroup); elementData.threeInstance = elementGroup; renderThreeScene();
    } catch (error) { console.error(`Error adding element ID ${elementData.id} (type ${elementData.type}) to 3D scene:`, error); }
}

// --- Model Loading Functions ---

async function loadAndConfigureHouseModel(group, houseData, modelLoaderInstance) {
    const modelFileName = "house_v1.glb"; // Your specific house model
    const modelPath = `${HOUSE_MODEL_PATH}${modelFileName}`;
    const modelKey = modelPath;

    while(group.children.length > 0){ // Clear previous (e.g., if re-adding or placeholder)
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
        
        // --- Scaling and Positioning for house_v1.glb ---
        // This part is CRUCIAL and depends heavily on how house_v1.glb was exported from Blender.
        // Target dimensions from app.js: houseData.width, houseData.depth, houseData.height
        
        const targetWidth = houseData.width;   // e.g., 40ft
        const targetDepth = houseData.depth;   // e.g., 50ft
        const targetHeight = houseData.height; // e.g., 15ft (overall height including roof peak)

        const box = new THREE.Box3().setFromObject(model);
        const modelSize = new THREE.Vector3();
        box.getSize(modelSize);

        // Calculate scale factors. Avoid division by zero if modelSize dimension is 0.
        const scaleX = modelSize.x > 0.001 ? targetWidth / modelSize.x : 1;
        const scaleY = modelSize.y > 0.001 ? targetHeight / modelSize.y : 1;
        const scaleZ = modelSize.z > 0.001 ? targetDepth / modelSize.z : 1;
        
        // Option 1: Uniform scaling (if aspect ratio is roughly correct or desired)
        // const scale = Math.min(scaleX, scaleY, scaleZ); // Or choose one dimension to drive scale
        // model.scale.set(scale, scale, scale);

        // Option 2: Non-uniform scaling (to force fit the dimensions - can distort if aspect ratios differ)
        model.scale.set(scaleX, scaleY, scaleZ);
        
        // Adjust position so the model's base (as defined in Blender) is at the group's origin (y=0)
        // And its center aligns with the group's XZ origin.
        const scaledBox = new THREE.Box3().setFromObject(model); // Recalculate box after scaling
        model.position.x = -(scaledBox.min.x + scaledBox.max.x) / 2; // Center X
        model.position.y = -scaledBox.min.y; // Align base to Y=0
        model.position.z = -(scaledBox.min.z + scaledBox.max.z) / 2; // Center Z

        model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) { // Ensure materials are set up for proper rendering
                    if (Array.isArray(child.material)) child.material.forEach(m => { m.needsUpdate = true; });
                    else child.material.needsUpdate = true;
                }
            }
        });
        group.add(model);

    } catch (err) {
        console.error(`Error loading house model ${modelPath}:`, err);
        // Fallback to the procedural house if GLB fails
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xd3c1a4 });
        const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5b4b });
        const houseBodyHeight = houseData.height * 0.7;
        const houseBody = new THREE.Mesh(new THREE.BoxGeometry(houseData.width, houseBodyHeight, houseData.depth), wallMaterial);
        houseBody.position.y = houseBodyHeight / 2;
        group.add(houseBody);
        const roofPeakHeight = houseData.height * 0.4;
        const roofShape = new THREE.Shape();
        roofShape.moveTo(-houseData.width / 2, houseBodyHeight); roofShape.lineTo(houseData.width / 2, houseBodyHeight);
        roofShape.lineTo(0, houseBodyHeight + roofPeakHeight); roofShape.lineTo(-houseData.width / 2, houseBodyHeight);
        const extrudeSettings = { depth: houseData.depth, bevelEnabled: false };
        const roofGeometry = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
        const roofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
        roofMesh.position.z = -houseData.depth / 2;
        group.add(roofMesh);
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
            el.data.currentSeason = newSeason;
            loadAndConfigureTreeModel(el.threeInstance, el, newSeason, modelLoaderInstance);
        }
    });
    renderThreeScene();
}

export function updateShadows(sunCalcPosition) {
    if (!sunlight || !sunCalcPosition || !scene) return;
    const R = Math.max(lotWidthGL, lotDepthGL) * 1.3;
    const phi = sunCalcPosition.azimuth + Math.PI; const theta = Math.PI / 2 - sunCalcPosition.altitude;
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
    const options = { trs: false, onlyVisible: true, binary: false, };
    const exportContainerScene = new THREE.Scene();
    if (groundPlane) exportContainerScene.add(groundPlane.clone());
    const elementsToExport = currentElementsRef ? currentElementsRef() : [];
    elementsToExport.forEach(appElement => {
        if (appElement.threeInstance) exportContainerScene.add(appElement.threeInstance.clone(true));
    });
    try {
        exporter.parse(exportContainerScene,
            function (result) {
                const filenameBase = `VerdantVision_Scene_${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
                if (options.binary && result instanceof ArrayBuffer) saveData(new Blob([result], {type: 'application/octet-stream'}), `${filenameBase}.glb`);
                else saveData(new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'}), `${filenameBase}.gltf`);
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
