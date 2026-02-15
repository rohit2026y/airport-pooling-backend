import { Router } from 'express';
import { createBooking, getBooking, cancelBooking } from '../controllers/booking.controller';

const router = Router();

router.post('/', createBooking);
router.get('/:id', getBooking);
router.post('/:id/cancel', cancelBooking);

export default router;
