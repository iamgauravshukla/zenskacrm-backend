const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/meetingController');
const { protect, requireWorkspace } = require('../middleware/auth');

router.use(protect);
router.use(requireWorkspace);

router.post('/', ctrl.createMeeting);
router.get('/', ctrl.getAllMeetings);
router.get('/upcoming', ctrl.getUpcoming);
router.get('/:leadId', ctrl.getMeetingsByLead);
router.put('/:id', ctrl.rescheduleMeeting);
router.patch('/:id/status', ctrl.updateMeetingStatus);

module.exports = router;
