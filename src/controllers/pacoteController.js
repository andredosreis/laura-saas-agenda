const Pacote = require('../models/Pacote');

exports.getAllPacotes = async (req, res) => {
  try {
    const pacotes = await Pacote.find();
    res.status(200).json(pacotes);
  } catch (error) {
    console.error('Erro ao buscar pacotes:', error.message);
    res.status(500).json({ error: 'Erro ao buscar pacotes' });
  }
};
// Criar novo pacote
exports.createPacote = async (req, res) => {
    try {
      const novoPacote = new Pacote(req.body); // Recebe dados via JSON
      const salvo = await novoPacote.save();   // Salva no banco
      res.status(201).json(salvo);             // Retorna com status 201 (Created)
    } catch (error) {
      console.error('Erro ao criar pacote:', error.message);
      res.status(400).json({ error: 'Erro ao criar pacote' });
    }
  };
  
  exports.getPacotePorId = async (req, res) => {
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
  
  exports.atualizarPacote = async (req, res) => {
    try {
      const atualizado = await Pacote.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!atualizado) {
        return res.status(404).json({ error: 'Pacote não encontrado' });
      }
      res.status(200).json(atualizado);
    } catch (error) {
      console.error('Erro ao atualizar pacote:', error.message);
      res.status(400).json({ error: 'Erro ao atualizar pacote' });
    }
  };
  

  // Deletar pacote
  exports.deletarPacote = async (req, res) => {
    try {
      const deletado = await Pacote.findByIdAndDelete(req.params.id);
      if (!deletado) {
        return res.status(404).json({ error: 'Pacote não encontrado' });
      }
      res.status(200).json({ mensagem: 'Pacote removido com sucesso.' });
    } catch (error) {
      console.error('Erro ao deletar pacote:', error.message);
      res.status(500).json({ error: 'Erro ao deletar pacote' });
    }
  };
  