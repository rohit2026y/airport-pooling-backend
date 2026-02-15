import prisma from '../utils/prisma';

export const calculatePrice = async (distanceKm: number): Promise<number> => {
    const BASE_PRICE = 50;
    const PER_KM_PRICE = 12;

    // Simple dynamic pricing based on active demand
    // In a real system, we'd check active bookings vs available drivers
    // For now, let's keep it simple or query stats if needed

    // Example: Check ratio of busy drivers
    const totalDrivers = await prisma.driver.count();
    const busyDrivers = await prisma.driver.count({
        where: { status: 'BUSY' }
    });

    let multiplier = 1.0;
    if (totalDrivers > 0) {
        const utilization = busyDrivers / totalDrivers;
        if (utilization > 0.8) multiplier = 1.5;
        else if (utilization > 0.5) multiplier = 1.2;
    }

    return (BASE_PRICE + (distanceKm * PER_KM_PRICE)) * multiplier;
};
