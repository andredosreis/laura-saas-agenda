require('dotenv-flow').config();
const express = require('express');
const connectDB = require('./config/db');
const cors = require('cors');
const logger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');



const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(logger);
app.use(errorHandler);
app.use('/api/clientes', require('./routes/clienteRoutes'));

// Routes test
app.get ('/' , (req, res) => {
    res.send('🚀 API Laura SaaS funcionando!');
});

// Connect to MongoDB
// Conectar ao banco e só depois iniciar o servidor
  connectDB().then(() => {
    
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🖥️ Servidor rodando na porta ${PORT}`);
  });
});



