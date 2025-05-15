const express = require('express');
const cors = require('cors');
require('dotenv-flow').config();
const requestLogger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');
const clienteRoutes = require('./routes/clienteRoutes');
const agendamentoRoutes = require('./routes/agendamentoRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(errorHandler);

// Rotas
app.use('/api/clientes', clienteRoutes);
app.use('/api/agendamentos', agendamentoRoutes);

// .. outras rotas se quiser

module.exports = app;
