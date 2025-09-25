import express from 'express';
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
router.use((req, res, next) => {
    console.log('Body recebido:', JSON.stringify(req.body, null, 2));
    next();
});

router.post('/zapi-webhook', whatsappController.zapiWebhook);

export default router;