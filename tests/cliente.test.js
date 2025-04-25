// tests/cliente.test.js
require('./setup');                     // roda beforeAll/afterAll
const request = require('supertest');
const app = require('../src/app');       // nosso Express “puro”

describe('Rota /api/clientes', () => {
  it('deve retornar lista vazia inicialmente', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('deve criar um novo cliente', async () => {
    const payload = {
      nome: 'Test User',
      telefone: '999888777',
      dataNascimento: '1990-01-01'
    };
    const res = await request(app)
      .post('/api/clientes')
      .send(payload);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nome: 'Test User', telefone: '999888777' });
  });
});
