
import prisma from '../src/utils/prisma';
import { PoolingService } from '../src/services/pooling.service';
import { Point } from '../src/utils/geo';

const poolingService = new PoolingService();

async function main() {
    console.log('Starting Concurrency Test...');

    // 1. Cleanup
    await prisma.booking.deleteMany();
    await prisma.ride.deleteMany();
    await prisma.driver.deleteMany();
    await prisma.user.deleteMany();

    console.log('Cleaned up DB.');

    // 2. Create Drivers
    const driversData = Array.from({ length: 5 }).map((_, i) => ({
        name: `Driver ${i}`,
        status: 'AVAILABLE' as const,
        capacity: 4
    }));

    await prisma.driver.createMany({ data: driversData });
    console.log('Created 5 Drivers.');

    // 3. Create Users
    const usersData = Array.from({ length: 20 }).map((_, i) => ({
        name: `User ${i}`,
        email: `user${i}@test.com`
    }));

    await prisma.user.createMany({ data: usersData });
    const users = await prisma.user.findMany();
    console.log('Created 20 Users.');

    // 4. Simulate Concurrent Bookings
    // We will force them all to try to create a NEW ride (by using different locations or just relying on race conditions).
    // Actually, let's try to make them all unique routes so they SHOULD claim different drivers.

    const promises = users.map(async (user, i) => {
        const pickup: Point = { lat: 10 + i * 0.01, lng: 10 };
        const dropoff: Point = { lat: 11 + i * 0.01, lng: 11 };

        // Create booking first
        const booking = await prisma.booking.create({
            data: {
                userId: user.id,
                pickup: pickup as any,
                dropoff: dropoff as any,
                price: 100,
                status: 'PENDING'
            }
        });

        return poolingService.matchRide(booking.id, pickup, dropoff);
    });

    console.log('Firing 20 concurrent requests...');
    const results = await Promise.all(promises);

    // 5. Verification
    const rides = await prisma.ride.findMany();
    const busyDrivers = await prisma.driver.count({ where: { status: 'BUSY' } });

    console.log(`Total Rides Created: ${rides.length}`);
    console.log(`Busy Drivers: ${busyDrivers}`);

    if (rides.length > 5) {
        console.error('FAIL: Created more rides than drivers!');
    } else if (rides.length !== busyDrivers) {
        console.error('FAIL: Mismatch between rides and busy drivers!');
    } else {
        console.log('SUCCESS: Driver constraints respected.');
    }

    // Check for double booking of drivers?
    const driverIds = rides.map(r => r.driverId);
    const uniqueDrivers = new Set(driverIds);
    if (driverIds.length !== uniqueDrivers.size) {
        console.error('FAIL: A driver is assigned to multiple rides!');
    } else {
        console.log('SUCCESS: No double booking of drivers.');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
