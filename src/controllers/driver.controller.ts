import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { DriverStatus } from '@prisma/client';

export const createDriver = async (req: Request, res: Response) => {
    try {
        const { name, capacity, currentLocation } = req.body;
        const driver = await prisma.driver.create({
            data: {
                name,
                capacity: capacity || 4,
                currentLocation: currentLocation || { lat: 0, lng: 0 },
                status: DriverStatus.AVAILABLE,
            },
        });
        res.status(201).json(driver);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create driver' });
    }
};

export const getDrivers = async (req: Request, res: Response) => {
    try {
        const drivers = await prisma.driver.findMany();
        res.json(drivers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
};

export const updateDriverStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Driver ID is required' });
        const { status, currentLocation } = req.body;

        const driver = await prisma.driver.update({
            where: { id: id as string },
            data: {
                status: status as DriverStatus,
                currentLocation,
            },
        });
        res.json(driver);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update driver' });
    }
};
