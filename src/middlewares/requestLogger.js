const requestLogger = (req, res, next) => {
  const timestamp = new Date().toLocaleTimeString('pt-PT');
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  
  // Log do corpo da requisição apenas se houver um
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
  
  next();
};

// A correção principal: usar "export default"
export default requestLogger;