// js/features/data/plant-library.js
export const plantLibrary = [
    {
        id: 'tomato_roma', name: 'Tomato (Roma)', type: 'Vegetable',
        spacing: 18, // inches
        depth: 0.25, // planting depth in inches
        daysToMature: 70,
        sun: 'Full Sun (6-8+ hours)', soil: 'Well-drained, pH 6.0-6.8',
        watering: 'Consistent, deep watering',
        companions: ['Basil', 'Carrots', 'Marigolds'],
        avoid: ['Corn', 'Potatoes', 'Fennel'],
        notes: 'Determinate. Good for sauces.',
        matureHeight: 36, // inches
        color: [255, 99, 71, 200] // RGBA for p5.js drawing
    },
    {
        id: 'cucumber_marketmore', name: 'Cucumber (Marketmore)', type: 'Vegetable',
        spacing: 12, // for bush types, 36-60 for vining on trellis
        depth: 0.5,
        daysToMature: 60,
        sun: 'Full Sun', soil: 'Rich, well-drained, pH 6.0-7.0',
        watering: 'Consistent moisture, especially during fruiting',
        companions: ['Beans', 'Corn', 'Radishes', 'Sunflowers'],
        avoid: ['Potatoes', 'Aromatic herbs (e.g., sage)'],
        notes: 'Vining, benefits from trellis. Disease resistant.',
        matureHeight: 72, // inches (vine length)
        color: [60, 179, 113, 200]
    },
    {
        id: 'marigold_french', name: 'Marigold (French)', type: 'Flower',
        spacing: 8,
        depth: 0.25,
        daysToMature: 50, // to flower
        sun: 'Full Sun', soil: 'Adaptable, prefers well-drained',
        watering: 'Allow soil to dry between waterings',
        companions: ['Tomatoes', 'Peppers', 'Most vegetables (deters pests)'],
        avoid: [],
        notes: 'Deters nematodes and other pests. Attracts pollinators.',
        matureHeight: 12, // inches
        color: [255, 165, 0, 200]
    },
    {
        id: 'bean_bush_blue_lake', name: 'Bean (Bush, Blue Lake)', type: 'Vegetable',
        spacing: 4, depth: 1, daysToMature: 55,
        sun: 'Full Sun', soil: 'Well-drained, pH 6.0-7.0',
        watering: 'Regularly, keep soil moist',
        companions: ['Carrots', 'Corn', 'Cucumbers', 'Marigolds'],
        avoid: ['Onions', 'Garlic', 'Fennel'],
        notes: 'Productive bush variety.',
        matureHeight: 24, // inches
        color: [0, 128, 0, 200]
    },
    {
        id: 'lettuce_romaine', name: 'Lettuce (Romaine)', type: 'Leafy Green',
        spacing: 8, depth: 0.25, daysToMature: 65,
        sun: 'Full Sun to Part Shade (afternoon shade in hot weather)',
        soil: 'Moist, well-drained, rich in organic matter, pH 6.0-7.0',
        watering: 'Consistent moisture',
        companions: ['Carrots', 'Radishes', 'Strawberries', 'Cucumbers'],
        avoid: ['Celery', 'Cabbage family (sometimes)'],
        notes: 'Cut-and-come-again harvesting possible.',
        matureHeight: 12, // inches
        color: [152, 251, 152, 200]
    },
    // Add 15+ more Zone 6a plants (peppers, zucchini, carrots, herbs like basil, parsley, cilantro, etc.)
    // Include data for: spacing, planting depth, days to mature, sun, soil, watering, companions, avoid, notes, mature height.
];