// Middleware para lidar com erros centralizadamente
module.exports = (err, req, res, next) => {
    console.error('Erro detectado:', err.stack);
    res.status(err.status || 500).json({
      error: err.message || 'Erro interno no servidor',
    });
  };
  