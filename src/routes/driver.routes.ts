import { Router } from 'express';
import { createDriver, getDrivers, updateDriverStatus } from '../controllers/driver.controller';

const router = Router();

router.post('/', createDriver);
router.get('/', getDrivers);
router.patch('/:id', updateDriverStatus);

export default router;
