
import dotenv from 'dotenv-flow';
dotenv.config();

import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';

// Configuração
const SOURCE_DB_NAME = 'lauraDB'; // Banco antigo identificado
const TARGET_DB_NAME = 'laura-saas'; // Novo banco
const TARGET_TENANT_SLUG = 'la-estetica-avancada'; // Slug da Laura

const COLLECTIONS_TO_MIGRATE = [
    'clientes',
    'agendamentos',
    'pacotes',
    'schedules',
    'conversas'
];

async function migrate() {
    console.log('🚀 Iniciando Migração de Dados (Test -> Laura SaaS)...');

    // 1. Conectar ao Cluster (usando driver nativo para flexibilidade de DBs)
    // Remover o nome do banco da URI para conectar na raiz
    const uri = process.env.MONGODB_URI.replace(/\/laura-saas\?/, '/?');
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('📡 Conectado ao Cluster MongoDB.');

        const sourceDb = client.db(SOURCE_DB_NAME);
        const targetDb = client.db(TARGET_DB_NAME);

        // 2. Encontrar o Tenant ID no banco de destino
        const tenant = await targetDb.collection('tenants').findOne({ slug: TARGET_TENANT_SLUG });

        if (!tenant) {
            console.error(`❌ Tenant "${TARGET_TENANT_SLUG}" não encontrado no banco ${TARGET_DB_NAME}.`);
            console.log('👉 Rode "node src/migrations/createLauraTenant.js" primeiro.');
            process.exit(1);
        }

        console.log(`✅ Tenant encontrado: ${tenant.nome} (ID: ${tenant._id})`);
        const tenantId = tenant._id;

        // 3. Migrar cada coleção
        for (const collectionName of COLLECTIONS_TO_MIGRATE) {
            console.log(`\n📦 Migrando coleção: ${collectionName}...`);

            const sourceCollection = sourceDb.collection(collectionName);
            const targetCollection = targetDb.collection(collectionName);

            // Ler documentos antigos
            const documents = await sourceCollection.find({}).toArray();

            if (documents.length === 0) {
                console.log(`   ⚠️  Nenhum documento encontrado em ${collectionName} de origem.`);
                continue;
            }

            console.log(`   📄 Encontrados ${documents.length} documentos.`);

            // Filtrar documentos que já existem no destino (pelo _id) para evitar duplicatas
            const existingIds = new Set(
                (await targetCollection.find({}).project({ _id: 1 }).toArray()).map(d => d._id.toString())
            );

            const docsToInsert = documents
                .filter(doc => !existingIds.has(doc._id.toString()))
                .map(doc => ({
                    ...doc,
                    tenantId: tenantId // 🆕 Adicionar tenantId
                }));

            if (docsToInsert.length > 0) {
                await targetCollection.insertMany(docsToInsert);
                console.log(`   ✅ Inseridos ${docsToInsert.length} documentos com sucesso.`);
            } else {
                console.log(`   ℹ️  Todos os documentos já existiam no destino.`);
            }
        }

        console.log('\n============================================================');
        console.log('🎉 MIGRAÇÃO DE DADOS CONCLUÍDA!');
        console.log('============================================================');

    } catch (error) {
        console.error('❌ Erro fatal na migração:', error);
    } finally {
        await client.close();
        console.log('📡 Desconectado.');
        process.exit(0);
    }
}

migrate();
