import prisma from '../utils/prisma';
import { Ride, Driver, Booking, DriverStatus, RideStatus } from '@prisma/client';
import { Point, calculateDistance, calculatePathDistance } from '../utils/geo';
import { Prisma } from '@prisma/client';

const MAX_DEVIATION_PERCENT = 0.5; // 50% max deviation allowed
const MAX_SEATS = 4;

export class PoolingService {

    // Main matchmaking function
    async matchRide(bookingId: string, pickup: Point, dropoff: Point): Promise<Ride | null> {
        // 1. Try to find an existing ride
        const existingRide = await this.findExistingRide(pickup, dropoff);
        if (existingRide) {
            return this.addBookingToRide(existingRide.id, bookingId, pickup, dropoff);
        }

        // 2. If no existing ride, create a new one
        return this.createNewRide(bookingId, pickup, dropoff);
    }

    private async findExistingRide(pickup: Point, dropoff: Point): Promise<Ride | null> {
        const rides = await prisma.ride.findMany({
            where: {
                status: RideStatus.SCHEDULED,
            },
            include: {
                bookings: true,
                driver: true,
            },
        });

        for (const ride of rides) {
            // Check capacity
            if (ride.bookings.length >= (ride.driver.capacity || MAX_SEATS)) continue;

            // Check if adding this booking violates deviation constraints
            if (await this.isPathValid(ride, pickup, dropoff)) {
                return ride;
            }
        }
        return null;
    }

    private async isPathValid(
        ride: Ride & { bookings: Booking[] },
        newPickup: Point,
        newDropoff: Point
    ): Promise<boolean> {
        const currentPath = (ride.path as unknown as Point[]) || [];
        const newPath = [...currentPath, newPickup, newDropoff]; // Simplified append for MVP

        // 1. Calculate new total distance
        const newTotalDist = calculatePathDistance(newPath);

        // 2. Check deviation for *each* passenger (existing + new)
        // For existing passengers, we compare new path vs their direct distance
        // For new passenger, we compare new path vs their direct distance
        // NOTE: This is a simplified check. Ideally we check if *their specific segment* in the new path is too long.
        // For MVP: We check if the TOTAL ride distance is within acceptable bounds relative to the sum of direct distances? 
        // OR: We check if the new total distance is not > X% of what it was? 

        // Let's implement the requirement: "Ensure no passenger exceeds detour tolerance"
        // This requires knowing the direct distance for EACH passenger.

        // Check for new passenger:
        const directDistNew = calculateDistance(newPickup, newDropoff);
        // worst case approximation: they travel the whole new path? No, that's too strict.
        // Approximation: The new path length shouldn't be > 1.5x of the SUM of all direct distances? 
        // Better Approximation for MVP: 
        // The total distance of the shared ride should not exceed (Sum of direct distances) * (1 + MAX_DEVIATION_PERCENT)

        let sumDirectDistances = directDistNew;
        for (const booking of ride.bookings) {
            const pickup = booking.pickup as unknown as Point;
            const dropoff = booking.dropoff as unknown as Point;
            sumDirectDistances += calculateDistance(pickup, dropoff);
        }

        const maxAllowedDist = sumDirectDistances * (1 + MAX_DEVIATION_PERCENT);

        return newTotalDist <= maxAllowedDist;
    }


    private async createNewRide(bookingId: string, pickup: Point, dropoff: Point): Promise<Ride | null> {
        // 1. Find potential available drivers
        // We don't lock here yet to avoid long locks
        const candidates = await prisma.driver.findMany({
            where: {
                status: DriverStatus.AVAILABLE,
            },
            take: 5
        });

        for (const candidate of candidates) {
            // 2. Atomic claim attempt
            // We update ONLY IF the status is STILL Available
            const result = await prisma.driver.updateMany({
                where: {
                    id: candidate.id,
                    status: DriverStatus.AVAILABLE
                },
                data: {
                    status: DriverStatus.BUSY
                }
            });

            if (result.count > 0) {
                // Success! We claimed this driver. 
                // Now create the ride and update booking within a transaction to ensure consistency.

                try {
                    return await prisma.$transaction(async (tx) => {
                        const ride = await tx.ride.create({
                            data: {
                                driverId: candidate.id,
                                status: RideStatus.SCHEDULED,
                                path: [pickup, dropoff] as unknown as Prisma.InputJsonValue,
                            },
                        });

                        await tx.booking.update({
                            where: { id: bookingId },
                            data: {
                                rideId: ride.id,
                                status: 'CONFIRMED'
                            },
                        });

                        return ride;
                    });
                } catch (err) {
                    // If transaction fails, we should revert driver status? 
                    // Or let a background job handle 'BUSY but no ride' drivers.
                    // For now, try to revert cleanly.
                    console.error("Transaction failed, reverting driver status", err);
                    await prisma.driver.update({
                        where: { id: candidate.id },
                        data: { status: DriverStatus.AVAILABLE }
                    });
                    return null;
                }
            }
        }

        return null;
    }

    private async addBookingToRide(rideId: string, bookingId: string, pickup: Point, dropoff: Point): Promise<Ride> {
        const ride = await prisma.ride.findUnique({ where: { id: rideId } });
        const currentPath = (ride?.path as unknown as Point[]) || [];
        const newPath = [...currentPath, pickup, dropoff]; // Naive append

        return await prisma.$transaction(async (tx) => {
            await tx.booking.update({
                where: { id: bookingId },
                data: {
                    rideId: rideId,
                    status: 'CONFIRMED'
                }
            });

            return await tx.ride.update({
                where: { id: rideId },
                data: {
                    path: newPath as unknown as Prisma.InputJsonValue
                }
            });
        });
    }
}
