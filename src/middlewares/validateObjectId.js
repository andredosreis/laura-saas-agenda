// src/middlewares/validateObjectId.js
const mongoose = require('mongoose');


// Middleware que valida se req.params.id é um ObjectId válido
module.exports = (req, res, next) => {
  const { id } = req.params;
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  next();
};
