const Pacote = require('../models/Pacote');

exports.getAllPacotes = async (req, res) => {
  try {
    const pacotes = await Pacote.find();
    res.status(200).json(pacotes);
  } catch (error) {
    console.error('Erro ao buscar pacotes:', error.message);
    res.status(500).json({ 
      mensagem: 'Erro ao buscar todos os pacotes',
      datails: error.message
     });
  }
};
// Criar novo pacote
exports.createPacote = async (req, res) => {
    try {
      const novoPacote = new Pacote(req.body);
      const salvo = await novoPacote.save();
      res.status(201).json(salvo);
    } catch (error) {
      console.error('Erro ao criar pacote:', error.message);
      // SUGESTÃO: Melhorar o tratamento de erros de validação e duplicidade, como fizemos para Clientes
      if (error.name === 'ValidationError') {
        const mensagens = Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }));
        return res.status(400).json({
          message: 'Dados inválidos. Verifique os campos e tente novamente.',
          details: mensagens
        });
      }
      // Lembra-te que no teu schema Pacote, o campo 'nome' é 'unique: true'.
      // Precisamos tratar o erro de duplicidade (código 11000).
      if (error.code === 11000 && error.keyValue && error.keyValue.nome) {
        return res.status(400).json({
          message: `O nome de pacote '${error.keyValue.nome}' já existe.`,
          details: [{ field: 'nome', message: `O nome de pacote '${error.keyValue.nome}' já está em uso.` }]
        });
      }
      res.status(500).json({ // Alterado de 400 para 500 para erros não tratados
        message: 'Erro interno ao criar o pacote.', 
        details: error.message 
      });
    }
  };
  
  exports.getPacotePorId = async (req, res) => {
    try {
      const pacote = await Pacote.findById(req.params.id);
      if (!pacote) {
        return res.status(404).json({ message: 'Pacote não encontrado.' }); // Mensagem mais específica
      }
      res.status(200).json(pacote);
    } catch (error) {
      console.error('Erro ao buscar pacote por ID:', error.message); // Log mais específico
      // SUGESTÃO: Tratar CastError para IDs inválidos e status 500 para outros erros
      if (error.name === 'CastError') {
          return res.status(400).json({ message: 'ID do pacote inválido.', details: error.message });
      }
      res.status(500).json({ 
        message: 'Erro interno ao buscar o pacote por ID.', 
        details: error.message 
      });
    }
  };
  
  exports.atualizarPacote = async (req, res) => {
    try {
      const atualizado = await Pacote.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!atualizado) {
        return res.status(404).json({ message: 'Pacote não encontrado para atualização.' }); // Mensagem mais específica
      }
      res.status(200).json(atualizado);
    } catch (error) {
      console.error('Erro ao atualizar pacote:', error.message);
      // SUGESTÃO: Tratamento de erro similar ao createPacote (ValidationError, Duplicidade, CastError)
      if (error.name === 'ValidationError') {
        const mensagens = Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }));
        return res.status(400).json({
          message: 'Dados inválidos na atualização. Verifique os campos.',
          details: mensagens
        });
      }
      if (error.code === 11000 && error.keyValue && error.keyValue.nome) {
        return res.status(400).json({
          message: `Na atualização, o nome de pacote '${error.keyValue.nome}' já existe.`,
          details: [{ field: 'nome', message: `O nome de pacote '${error.keyValue.nome}' já está em uso.` }]
        });
      }
      if (error.name === 'CastError') {
          return res.status(400).json({ message: 'ID do pacote inválido para atualização.', details: error.message });
      }
      res.status(500).json({ 
        message: 'Erro interno ao atualizar o pacote.', 
        details: error.message 
      });
    }
  };
  
  
  //editar pacote
exports.editarPacote = async (req, res) => {
  try {
    const pacote = await Pacote.findById(req.params.id);
    if (!pacote) {
      return res.status(404).json({ error: 'Pacote não encontrado' });
    }
    res.status(200).json(pacote);
  } catch (error) {
    console.error('Erro ao buscar pacote:', error.message);
    res.status(400).json({ error: 'Erro ao buscar pacote' });
  }
};

  // Deletar pacote
  exports.deletarPacote = async (req, res) => {
    try {
      const deletado = await Pacote.findByIdAndDelete(req.params.id);
      if (!deletado) {
        return res.status(404).json({ message: 'Pacote não encontrado para deleção.' }); // Mensagem mais específica
      }
      res.status(200).json({ mensagem: 'Pacote removido com sucesso.' });
    } catch (error) {
      console.error('Erro ao deletar pacote:', error.message);
      // SUGESTÃO: Tratar CastError e usar mensagem mais específica para 500
      if (error.name === 'CastError') {
          return res.status(400).json({ message: 'ID do pacote inválido para deleção.', details: error.message });
      }
      res.status(500).json({ 
        message: 'Erro interno ao deletar o pacote.', 
        details: error.message 
      });
    }
  };