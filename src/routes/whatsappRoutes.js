import express from 'express';
import {
  notificarCliente,
  enviarMensagemDireta,
  notificarAgendamentosAmanha,
  zapiWebhook
} from '../controllers/whatsappController.js';

const router = express.Router();

// Rota para o webhook da Z-API (recebe mensagens dos clientes)
router.post('/webhook', zapiWebhook);

// Rotas manuais/administrativas
router.post('/notificar', notificarCliente);
router.post('/enviar-direta', enviarMensagemDireta);
router.post('/lembretes-amanha', notificarAgendamentosAmanha);

export default router;