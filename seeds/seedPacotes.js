const mongoose = require('mongoose');
const path = require('path');
require('dotenv-flow').config({ path: path.resolve(__dirname, '..') });

const Pacote = require('../src/models/Pacote');

const pacotes = [
  {
    nome: 'Sessão Avulsa de Drenagem Linfática',
    categoria: 'Drenagem Linfática',
    sessoes: 1
  },
  {
    nome: 'Pacote com 5 Sessões de Drenagem Linfática',
    categoria: 'Drenagem Linfática',
    sessoes: 5
  },
  {
    nome: 'Pacote com 10 Sessões de Drenagem Linfática',
    categoria: 'Drenagem Linfática',
    sessoes: 10
  },
  {
    nome: 'Drenagem Linfática Avançada (Pré e Pós-Operatório)',
    categoria: 'Drenagem Linfática',
    sessoes: 10
  },
  {
    nome: 'Massagem Relaxante',
    categoria: 'Massagens Terapêuticas e Estéticas',
    sessoes: 1
  },
  {
    nome: 'SPA Day',
    categoria: 'Experiências Especiais e SPA',
    sessoes: 1
  },
  {
    nome: 'Pedicure Científica',
    categoria: 'Cuidados com os Pés',
    sessoes: 1
  }
  // você pode adicionar mais aqui conforme quiser!
];

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await Pacote.deleteMany(); // limpa os pacotes antigos
    await Pacote.insertMany(pacotes);
    console.log('✅ Pacotes inseridos com sucesso!');
    process.exit();
  } catch (err) {
    console.error('❌ Erro ao inserir pacotes:', err);
    process.exit(1);
  }
};

start();
