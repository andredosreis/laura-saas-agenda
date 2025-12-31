/**
 * SCRIPT DE MIGRAÇÃO - Adicionar TenantId aos dados existentes
 * 
 * Este script:
 * 1. Cria um tenant "Laura" (o primeiro tenant do sistema)
 * 2. Cria um usuário admin para a Laura
 * 3. Adiciona tenantId a todos os documentos existentes
 * 
 * Executar com: node src/migrations/createLauraTenant.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv-flow';
import bcrypt from 'bcryptjs';

// Carregar variáveis de ambiente
dotenv.config();

// Importar modelos
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import Cliente from '../models/Cliente.js';
import Agendamento from '../models/Agendamento.js';
import Pacote from '../models/Pacote.js';
import Schedule from '../models/Schedule.js';
import Conversa from '../models/Conversa.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lauraDB';

// Configurações do tenant Laura
const LAURA_TENANT_CONFIG = {
    nome: 'La Estética Avançada',
    slug: 'la-estetica-avancada',
    branding: {
        logo: null,
        corPrimaria: '#6366f1',
        corSecundaria: '#f59e0b',
        corFundo: '#0f172a',
        corTexto: '#f8fafc',
        fonte: 'Inter',
        darkMode: true
    },
    plano: {
        tipo: 'elite', // Laura tem acesso total (é a dona do sistema!)
        preco: 0, // Grátis para a Laura
        status: 'ativo',
        dataInicio: new Date()
    },
    limites: {
        maxUsuarios: -1, // Ilimitado
        maxClientes: -1,
        maxAgendamentosMes: -1,
        iaAtiva: true,
        whatsappAutomacao: true,
        lembretesWhatsapp: true,
        analytics: true,
        relatorios: true,
        exportPdf: true,
        brandingPersonalizado: true
    },
    configuracoes: {
        timezone: 'Europe/Lisbon',
        idioma: 'pt-PT',
        moedaDisplay: '€'
    },
    whatsapp: {
        provider: 'zapi',
        zapiInstanceId: process.env.ZAPI_INSTANCE_ID,
        zapiToken: process.env.ZAPI_TOKEN
    }
};

// Configurações do usuário Laura
const LAURA_USER_CONFIG = {
    nome: 'Laura',
    email: 'laura@laesteticaavancada.pt', // ALTERE PARA O EMAIL REAL
    password: 'Laura@2024!', // ALTERE PARA UMA SENHA SEGURA
    role: 'admin'
};

async function migrate() {
    console.log('🚀 Iniciando migração para Multi-Tenant...\n');

    try {
        // Conectar ao MongoDB
        console.log('📡 Conectando ao MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado!\n');

        // =============================================
        // PASSO 1: Verificar se já existe tenant Laura
        // =============================================
        console.log('🔍 Verificando se tenant Laura já existe...');
        let tenant = await Tenant.findOne({ slug: LAURA_TENANT_CONFIG.slug });

        if (tenant) {
            console.log(`⚠️  Tenant "${tenant.nome}" já existe (ID: ${tenant._id})`);
            console.log('   Usando tenant existente para a migração.\n');
        } else {
            console.log('📝 Criando tenant Laura...');
            tenant = await Tenant.create(LAURA_TENANT_CONFIG);
            console.log(`✅ Tenant criado: ${tenant.nome} (ID: ${tenant._id})\n`);
        }

        // =============================================
        // PASSO 2: Criar usuário admin Laura
        // =============================================
        console.log('🔍 Verificando se usuário Laura já existe...');
        let user = await User.findOne({ tenantId: tenant._id, email: LAURA_USER_CONFIG.email });

        if (user) {
            console.log(`⚠️  Usuário "${user.nome}" já existe (ID: ${user._id})\n`);
        } else {
            console.log('📝 Criando usuário admin para Laura...');

            const salt = await bcrypt.genSalt(12);
            const passwordHash = await bcrypt.hash(LAURA_USER_CONFIG.password, salt);

            user = await User.create({
                tenantId: tenant._id,
                nome: LAURA_USER_CONFIG.nome,
                email: LAURA_USER_CONFIG.email,
                passwordHash,
                role: 'admin',
                emailVerificado: true,
                permissoes: User.getDefaultPermissions('admin')
            });

            // Atualizar tenant com o criador
            tenant.criadoPor = user._id;
            await tenant.save();

            console.log(`✅ Usuário criado: ${user.nome} (${user.email})`);
            console.log(`   📧 Email: ${LAURA_USER_CONFIG.email}`);
            console.log(`   🔑 Senha: ${LAURA_USER_CONFIG.password}`);
            console.log('   ⚠️  IMPORTANTE: Altere a senha após o primeiro login!\n');
        }

        // =============================================
        // PASSO 3: Migrar documentos existentes
        // =============================================
        console.log('📊 Migrando documentos existentes...\n');

        // Migrar Clientes
        const clientesSemTenant = await Cliente.countDocuments({ tenantId: { $exists: false } });
        if (clientesSemTenant > 0) {
            console.log(`   👥 Clientes sem tenantId: ${clientesSemTenant}`);
            const resultClientes = await Cliente.updateMany(
                { tenantId: { $exists: false } },
                { $set: { tenantId: tenant._id } }
            );
            console.log(`   ✅ Clientes migrados: ${resultClientes.modifiedCount}`);
        } else {
            console.log('   👥 Clientes: Nenhum para migrar');
        }

        // Migrar Agendamentos
        const agendamentosSemTenant = await Agendamento.countDocuments({ tenantId: { $exists: false } });
        if (agendamentosSemTenant > 0) {
            console.log(`   📅 Agendamentos sem tenantId: ${agendamentosSemTenant}`);
            const resultAgendamentos = await Agendamento.updateMany(
                { tenantId: { $exists: false } },
                { $set: { tenantId: tenant._id } }
            );
            console.log(`   ✅ Agendamentos migrados: ${resultAgendamentos.modifiedCount}`);
        } else {
            console.log('   📅 Agendamentos: Nenhum para migrar');
        }

        // Migrar Pacotes
        const pacotesSemTenant = await Pacote.countDocuments({ tenantId: { $exists: false } });
        if (pacotesSemTenant > 0) {
            console.log(`   📦 Pacotes sem tenantId: ${pacotesSemTenant}`);
            const resultPacotes = await Pacote.updateMany(
                { tenantId: { $exists: false } },
                { $set: { tenantId: tenant._id } }
            );
            console.log(`   ✅ Pacotes migrados: ${resultPacotes.modifiedCount}`);
        } else {
            console.log('   📦 Pacotes: Nenhum para migrar');
        }

        // Migrar Schedules
        const schedulesSemTenant = await Schedule.countDocuments({ tenantId: { $exists: false } });
        if (schedulesSemTenant > 0) {
            console.log(`   ⏰ Schedules sem tenantId: ${schedulesSemTenant}`);
            const resultSchedules = await Schedule.updateMany(
                { tenantId: { $exists: false } },
                { $set: { tenantId: tenant._id } }
            );
            console.log(`   ✅ Schedules migrados: ${resultSchedules.modifiedCount}`);
        } else {
            console.log('   ⏰ Schedules: Nenhum para migrar');
        }

        // Migrar Conversas
        const conversasSemTenant = await Conversa.countDocuments({ tenantId: { $exists: false } });
        if (conversasSemTenant > 0) {
            console.log(`   💬 Conversas sem tenantId: ${conversasSemTenant}`);
            const resultConversas = await Conversa.updateMany(
                { tenantId: { $exists: false } },
                { $set: { tenantId: tenant._id } }
            );
            console.log(`   ✅ Conversas migradas: ${resultConversas.modifiedCount}`);
        } else {
            console.log('   💬 Conversas: Nenhum para migrar');
        }

        // =============================================
        // RESUMO
        // =============================================
        console.log('\n' + '='.repeat(60));
        console.log('🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
        console.log('='.repeat(60));
        console.log(`
📊 Resumo:
   - Tenant: ${tenant.nome} (${tenant.slug})
   - Plano: ${tenant.plano.tipo.toUpperCase()}
   - Usuário Admin: ${user.email}
   
🔐 Credenciais de acesso:
   - Email: ${LAURA_USER_CONFIG.email}
   - Senha: ${LAURA_USER_CONFIG.password}
   
⚠️  IMPORTANTE:
   1. Altere a senha após o primeiro login
   2. Configure as variáveis JWT_SECRET e JWT_REFRESH_SECRET no .env
   3. Teste o login em: POST /api/auth/login
`);

    } catch (error) {
        console.error('\n❌ ERRO NA MIGRAÇÃO:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('\n📡 Desconectado do MongoDB.');
    }
}

// Executar migração
migrate()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
