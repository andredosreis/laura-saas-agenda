import express from 'express';
// 1. Importamos as funções específicas que precisamos do controller
import { 
    enviarLembretes24h, 
    processarRespostaWhatsapp 
} from '../controllers/agenteController.js';

const router = express.Router();

// Rota para o agente enviar os lembretes de 24 horas.
// GET /api/agente/enviar-lembretes-24h
router.get('/enviar-lembretes-24h', enviarLembretes24h);

// Rota para receber e processar respostas do WhatsApp (via n8n/webhook)
// POST /api/agente/processar-resposta
router.post('/processar-resposta', processarRespostaWhatsapp);

export default router;