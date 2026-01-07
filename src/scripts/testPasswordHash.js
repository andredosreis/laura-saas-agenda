/**
 * Script para testar se o hash de senha está funcionando corretamente
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/laura-saas-agenda';

async function testPasswordHash() {
    console.log('🔐 Testando hash de senha...\n');

    // Teste 1: Hash direto com bcrypt
    console.log('1️⃣ Teste de bcrypt direto:');
    const senha = 'teste123';
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(senha, salt);
    console.log(`   Senha: ${senha}`);
    console.log(`   Salt: ${salt}`);
    console.log(`   Hash: ${hash}`);
    console.log(`   Hash length: ${hash.length}`);

    // Verificar se o hash funciona
    const isMatch = await bcrypt.compare(senha, hash);
    console.log(`   Verificação: ${isMatch ? '✅ PASSOU' : '❌ FALHOU'}\n`);

    // Teste 2: Verificar usuários no banco
    console.log('2️⃣ Verificando usuários no banco de dados...\n');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('   📦 Conectado ao MongoDB\n');

        // Buscar todos os usuários com passwordHash
        const users = await mongoose.connection.db.collection('users').find({}).toArray();

        console.log(`   Total de usuários: ${users.length}\n`);

        for (const user of users) {
            console.log(`   👤 Usuário: ${user.email}`);
            console.log(`      Nome: ${user.nome}`);
            console.log(`      passwordHash presente: ${user.passwordHash ? '✅ SIM' : '❌ NÃO'}`);
            if (user.passwordHash) {
                console.log(`      passwordHash length: ${user.passwordHash.length}`);
                console.log(`      passwordHash começa com: ${user.passwordHash.substring(0, 10)}...`);
            } else {
                console.log(`      ⚠️ PROBLEMA: Usuário sem passwordHash!`);
            }
            console.log('');
        }

        await mongoose.disconnect();
        console.log('   📦 Desconectado do MongoDB');

    } catch (error) {
        console.error('   ❌ Erro ao conectar ao banco:', error.message);
    }
}

testPasswordHash().catch(console.error);
