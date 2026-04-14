const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const ctrl = require('../controllers/leadController');
const { protect, adminOnly, requireWorkspace } = require('../middleware/auth');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.csv') cb(null, true);
    else cb(new Error('Only CSV files allowed'));
  },
});

router.use(protect);
router.use(requireWorkspace);

router.get('/', ctrl.getLeads);
router.get('/custom-fields', ctrl.getCustomFields);
router.get('/stage-counts', ctrl.getStageCounts);
router.delete('/all', adminOnly, ctrl.deleteAllLeads);
router.post('/', ctrl.createLead);
router.get('/:id', ctrl.getLead);
router.put('/:id', ctrl.updateLead);
router.delete('/:id', ctrl.deleteLead);
router.patch('/:id/stage', ctrl.updateStage);
router.patch('/:id/assign', ctrl.assignLead);
router.post('/:id/remarks', ctrl.addRemark);
router.delete('/:id/remarks/:remarkId', ctrl.deleteRemark);
router.post('/import/csv', upload.single('file'), ctrl.importCSV);

module.exports = router;
