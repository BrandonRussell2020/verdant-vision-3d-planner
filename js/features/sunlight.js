// js/features/sunlight.js
// Assumes SunCalc.js is loaded globally via CDN

export function calculateSunPosition(date, latitude, longitude) {
    if (typeof SunCalc === 'undefined') {
        console.warn("SunCalc library is not loaded. Sunlight simulation will be inaccurate.");
        // Return a default high-noon position or null
        return { azimuth: 0, altitude: Math.PI / 2 }; // Simplified: sun directly overhead
    }
    try {
        const sunTimes = SunCalc.getTimes(date, latitude, longitude); // For sunrise/sunset info if needed
        const position = SunCalc.getPosition(date, latitude, longitude);
        // position.azimuth: azimuth in radians (direction along the horizon, measured from south to west), e.g. 0 is south, Math.PI * 3/4 is northwest
        // position.altitude: altitude above the horizon in radians
        return position;
    } catch (error) {
        console.error("Error calculating sun position with SunCalc:", error);
        return null;
    }
}