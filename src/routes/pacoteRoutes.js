import express from 'express';
import {
  createPacote,
  getAllPacotes,
  getPacote,
  updatePacote,
  deletePacote
} from '../controllers/pacoteController.js';
import validateObjectId from '../middlewares/validateObjectId.js';

const router = express.Router();

// Rotas CRUD para Pacotes
router.get('/', getAllPacotes);
router.post('/', createPacote);
router.get('/:id', validateObjectId, getPacote);
router.put('/:id', validateObjectId, updatePacote);
router.delete('/:id', validateObjectId, deletePacote);

export default router;