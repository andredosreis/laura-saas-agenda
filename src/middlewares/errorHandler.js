const errorHandler = (err, req, res, next) => {
  // Define um status de erro padrão se não for especificado
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);

  console.error('❌ Ocorreu um erro:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack, // Não expor o stack em produção
    url: req.originalUrl,
    method: req.method,
  });

  res.json({
    message: err.message,
    // Em ambiente de produção, não é boa prática expor o stack do erro ao cliente
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

// A correção principal está aqui:
export default errorHandler;