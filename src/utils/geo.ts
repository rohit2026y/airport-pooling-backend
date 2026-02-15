export interface Point {
    lat: number;
    lng: number;
}

// Haversine formula to calculate distance between two points in km
export const calculateDistance = (p1: Point, p2: Point): number => {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const toRad = (val: number): number => {
    return (val * Math.PI) / 180;
};

// Calculate total distance of a path (ordered list of points)
export const calculatePathDistance = (points: Point[]): number => {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
        totalDistance += calculateDistance(points[i], points[i + 1]);
    }
    return totalDistance;
};
