const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/onboardingController');
const { protect, requireWorkspace } = require('../middleware/auth');

router.use(protect);
router.use(requireWorkspace);

router.get('/', ctrl.getAll);
router.get('/:leadId', ctrl.getByLead);
router.patch('/:id/stage', ctrl.updateStage);
router.post('/:id/notes', ctrl.addNote);

module.exports = router;
