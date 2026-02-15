import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export const createUser = async (req: Request, res: Response) => {
    try {
        const { name, email } = req.body;
        const user = await prisma.user.create({
            data: { name, email },
        });
        res.status(201).json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create user' });
    }
};

export const getUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'User ID is required' });
        const user = await prisma.user.findUnique({
            where: { id: id as string },
            include: { bookings: true },
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
};
