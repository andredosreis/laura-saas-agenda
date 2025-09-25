import mongoose from 'mongoose';

const validateObjectId = (req, res, next) => {
  // Verifica se o ID fornecido nos parâmetros da rota é um ObjectId válido do MongoDB
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'O ID fornecido é inválido.' });
  }
  // Se for válido, passa para a próxima função (o controller)
  next();
};

// A correção principal está aqui:
export default validateObjectId;