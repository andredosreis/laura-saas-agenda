# Laura SaaS Agenda

Projeto Node.js/Express com frontend em React (Vite) para gerenciar agenda e pacotes de serviços.

## Instalação do Backend

1. Instale as dependências no diretório raiz:
   ```bash
   npm install
   ```
2. Crie um arquivo `.env` definindo as variáveis de ambiente. Exemplo:
   ```ini
   MONGO_URI=mongodb://localhost:27017/laura
   PORT=5000
   ```
   O projeto utiliza `dotenv-flow`, portanto você também pode usar arquivos como `.env.local` ou `.env.test`.
3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

## Banco de Dados e Seeds

Para popular a coleção `Pacotes` execute:
```bash
npm run seed
```
Certifique-se de que a variável `MONGO_URI` esteja configurada e que o MongoDB esteja acessível.

## Testes

Os testes utilizam `jest` e `mongodb-memory-server`. Para executá-los:
```bash
npx jest
```

## Frontend

O frontend encontra-se na pasta `laura-saas-frontend/` e usa Vite. Para executá-lo:
```bash
cd laura-saas-frontend
npm install
npm run dev
```
Crie um arquivo `.env` dentro desta pasta definindo a URL do backend:
```ini
VITE_API_URL=http://localhost:5000
```
