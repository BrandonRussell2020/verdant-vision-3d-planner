// js/features/data/tree-models-manifest.js
// This file maps tree species to their model paths and default sizes.

export const treeManifest = {
    "sugar_maple": {
        displayName: "Sugar Maple",
        genus: "Acer",
        species: "saccharum",
        models: { // Relative to assets/models/trees/
            // Assuming you want to use the new .glb for summer and keep .gltf for others for now
            // If you have .glb for all, update accordingly.
            spring: "sugar_maple/spring.gltf",
            summer: "sugar_maple/maple_tree_summer.glb", // Using your new GLB model
            fall: "sugar_maple/fall.gltf",
            winter: "sugar_maple/winter.gltf",
        },
        defaultHeightFt: 50, // Typical mature height
        defaultCanopyFt: 35,
        notes: "Brilliant fall color. Source of maple syrup."
    },
    "white_oak": {
        displayName: "White Oak",
        genus: "Quercus",
        species: "alba",
        models: {
            // You'll need to add .glb or .gltf paths here for each season
            // Example:
            // spring: "white_oak/white_oak_spring.glb",
            summer: "white_oak/white_oak_summer.glb", // Assuming you'll add this
            // fall: "white_oak/white_oak_fall.glb",
            // winter: "white_oak/white_oak_winter.glb",
        },
        defaultHeightFt: 70,
        defaultCanopyFt: 60,
        notes: "Majestic, long-lived shade tree. Supports wildlife."
    },
    "generic_deciduous": {
        displayName: "Generic Deciduous",
        models: { // You'll need to provide actual model paths for these
            spring: "generic_deciduous/generic_deciduous_spring.glb",
            summer: "generic_deciduous/generic_deciduous_summer.glb",
            fall: "generic_deciduous/generic_deciduous_fall.glb",
            winter: "generic_deciduous/generic_deciduous_winter.glb",
        },
        defaultHeightFt: 40,
        defaultCanopyFt: 30,
        notes: "A general purpose deciduous tree."
    },
    "generic_evergreen": {
        displayName: "Generic Evergreen",
        models: { // Evergreen might use the same model for all seasons or have subtle variations
            spring: "generic_evergreen/generic_evergreen.glb",
            summer: "generic_evergreen/generic_evergreen.glb",
            fall: "generic_evergreen/generic_evergreen.glb",
            winter: "generic_evergreen/generic_evergreen.glb",
        },
        defaultHeightFt: 45,
        defaultCanopyFt: 20,
        notes: "A general purpose evergreen tree."
    }
    // Add more tree species suitable for Zone 6a as you create/acquire models
};
