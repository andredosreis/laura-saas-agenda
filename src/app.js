const express = require('express');
const cors = require('cors');
require('dotenv-flow').config();
const requestLogger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');
const clienteRoutes = require('./routes/clienteRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(errorHandler);
app.use('/api/clientes', clienteRoutes);

//impotar e montar rotas
app.use('/api/clientes', require('./routes/clientes'));

//. .. outras rotas

module.exports = app;

