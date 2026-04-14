const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teamController');
const { protect, adminOnly } = require('../middleware/auth');

// Public - accept invite (no auth token yet)
router.post('/accept-invite', ctrl.acceptInvite);

router.use(protect);
router.get('/', ctrl.getTeam);
router.post('/member', adminOnly, ctrl.createMember);
router.post('/invite', adminOnly, ctrl.inviteMember);   // kept for backward-compat
router.patch('/:userId/role', adminOnly, ctrl.updateMemberRole);
router.delete('/:userId', adminOnly, ctrl.removeMember);

module.exports = router;
