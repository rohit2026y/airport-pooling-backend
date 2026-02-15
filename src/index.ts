import app from './app';
import dotenv from 'dotenv';
import prisma from './utils/prisma';

dotenv.config();

const PORT = process.env.PORT || 3000;

const start = async () => {
    try {
        await prisma.$connect();
        console.log('Connected to database (via Prisma)');

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

start();
