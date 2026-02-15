import express from 'express';
import cors from 'cors';
import { NextFunction, Request, Response } from 'express';

const app = express();

app.use(cors());
app.use(express.json());

// Health check route
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
});

import userRoutes from './routes/user.routes';
import driverRoutes from './routes/driver.routes';
import bookingRoutes from './routes/booking.routes';

// ...

app.use('/users', userRoutes);
app.use('/drivers', driverRoutes);
app.use('/bookings', bookingRoutes);

// Routes will be added here


// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

export default app;
