
import dotenv from 'dotenv-flow';
dotenv.config();
import { MongoClient } from 'mongodb';

async function listDbs() {
    console.log("🔍 Investigando bancos de dados no cluster...");
    // Remover qualquer nome de banco da URI para conectar na raiz
    const uri = process.env.MONGODB_URI.replace(/\/[^/?]+\?/, '/?');

    const client = new MongoClient(uri);
    try {
        await client.connect();
        const admin = client.db().admin();
        const result = await admin.listDatabases();

        console.log("\n📂 Bancos de dados encontrados:");
        console.log("==================================");
        result.databases.forEach(db => {
            console.log(` 🗄️  nome: "${db.name}" \t(Tamanho: ${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
        });
        console.log("==================================");

    } catch (e) {
        console.error("❌ Erro ao listar bancos:", e.message);
        if (e.code === 8000) {
            console.log("⚠️  Seu usuário pode não ter permissão para listar bancos. Verifique no site do MongoDB Atlas.");
        }
    } finally {
        await client.close();
    }
}
listDbs();
