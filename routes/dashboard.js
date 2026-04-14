const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');
const { protect, requireWorkspace } = require('../middleware/auth');

router.use(protect);
router.use(requireWorkspace);

router.get('/summary', ctrl.getSummary);
router.get('/monthly', ctrl.getMonthlyReport);

module.exports = router;
