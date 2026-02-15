import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { calculateDistance, Point } from '../utils/geo';
import { calculatePrice } from '../services/pricing.service';
import { PoolingService } from '../services/pooling.service';

const poolingService = new PoolingService();

export const createBooking = async (req: Request, res: Response) => {
    try {
        const { userId, pickup, dropoff } = req.body;

        // Validate input
        if (!pickup || !dropoff || !pickup.lat || !dropoff.lat) {
            return res.status(400).json({ error: 'Invalid pickup or dropoff coordinates' });
        }

        // Calculate initial price
        const distance = calculateDistance(pickup, dropoff);
        const price = await calculatePrice(distance);

        // Create Booking record (PENDING)
        const booking = await prisma.booking.create({
            data: {
                userId,
                pickup,
                dropoff,
                price,
                status: 'PENDING',
            },
        });

        // Try to match with a ride immediately
        const ride = await poolingService.matchRide(booking.id, pickup as Point, dropoff as Point);

        if (ride) {
            res.status(201).json({
                bookingId: booking.id,
                status: 'CONFIRMED',
                rideId: ride.id,
                price
            });
        } else {
            // If no ride immediately found/created (e.g. no available drivers), keep as PENDING
            res.status(201).json({
                bookingId: booking.id,
                status: 'PENDING',
                message: 'No driver available yet. We are searching.',
                price
            });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create booking' });
    }
};

export const getBooking = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Booking ID is required' });

        const booking = await prisma.booking.findUnique({
            where: { id: id as string },
            include: { ride: true }
        });

        if (!booking) return res.status(404).json({ error: 'Booking not found' });

        res.json(booking);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch booking' });
    }
};

export const cancelBooking = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Booking ID is required' });

        // 1. Check if booking exists and is not already cancelled
        const booking = await prisma.booking.findUnique({
            where: { id: id as string },
            include: { ride: { include: { bookings: true } } }
        });

        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        if (booking.status === 'CANCELLED') return res.status(400).json({ error: 'Booking already cancelled' });

        // 2. Perform cancellation transaction
        await prisma.$transaction(async (tx) => {
            // Update booking status
            await tx.booking.update({
                where: { id: booking.id },
                data: { status: 'CANCELLED' }
            });

            // Handle Ride updates if assigned
            if (booking.ride) {
                // Check if ride becomes empty after this cancellation
                // We count active bookings excluding the current one
                const activeBookingsCount = booking.ride.bookings.filter(b => b.id !== booking.id && b.status !== 'CANCELLED').length;

                if (activeBookingsCount === 0) {
                    // Ride is empty, cancel it and free the driver
                    await tx.ride.update({
                        where: { id: booking.ride.id },
                        data: { status: 'COMPLETED' } // or CANCELLED, assuming COMPLETED for now to just close it
                    });

                    await tx.driver.update({
                        where: { id: booking.ride.driverId },
                        data: { status: 'AVAILABLE' }
                    });
                } else {
                    // Ride still has passengers. 
                    // Ideally we should optimize path (remove pickup/dropoff of this user)
                    // For MVP, we leave path as is, but seat is freed (logic in pooling service checks active bookings count)
                }
            }
        });

        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to cancel booking' });
    }
};
