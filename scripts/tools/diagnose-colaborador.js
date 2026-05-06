// Diagnóstico completo de colaborador: simula o que o login faz.
// Uso: node scripts/tools/diagnose-colaborador.js email@do.colaborador
import 'dotenv-flow/config';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Tenant from '../../src/models/Tenant.js';

const emailArg = process.argv[2];
if (!emailArg) {
    console.error('Uso: node scripts/tools/diagnose-colaborador.js email@do.colaborador');
    process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

// 1) BUSCA case-insensitive — mostra TODOS os users com este email em qualquer case
console.log('\n=== 1) Busca case-insensitive (regex) ===');
const allUsers = await User.find({
    email: { $regex: `^${emailArg}$`, $options: 'i' }
}).select('_id email tenantId ativo emailVerificado role createdAt');

console.log(`Total encontrados: ${allUsers.length}`);
for (const u of allUsers) {
    console.log(`  - ${u._id} | email="${u.email}" | tenantId=${u.tenantId} | ativo=${u.ativo}`);
}

// 2) Simulação do login: replica EXACTAMENTE o que authController.login faz
console.log('\n=== 2) Simulação do login (replicando authController) ===');
const emailNormalized = emailArg.toLowerCase();
const user = await User.findOne({ email: emailNormalized }).select('+passwordHash');

if (!user) {
    console.log(`❌ User.findOne({ email: "${emailNormalized}" }) → null → "Credenciais inválidas" (401)`);
    await mongoose.disconnect();
    process.exit(0);
}

console.log(`✅ User encontrado: ${user._id}`);
console.log(`   email actual:    "${user.email}"`);
console.log(`   tenantId:        ${user.tenantId} ${user.tenantId ? '' : '⚠️ NULL'}`);
console.log(`   ativo:           ${user.ativo}`);
console.log(`   isLocked:        ${user.isLocked} ${user.isLocked ? '⚠️ → 423' : ''}`);
console.log(`   loginAttempts:   ${user.loginAttempts}`);
console.log(`   lockUntil:       ${user.lockUntil || '-'}`);

if (!user.ativo) {
    console.log('❌ user.ativo === false → "Conta desativada" (403)');
    await mongoose.disconnect();
    process.exit(0);
}

const tenant = await Tenant.findById(user.tenantId);
console.log(`\n   Tenant.findById(${user.tenantId}):`);
if (!tenant) {
    console.log('   ❌ tenant === null → "Empresa não encontrada ou desativada" (403)');
    await mongoose.disconnect();
    process.exit(0);
}
console.log(`     nome:           ${tenant.nome}`);
console.log(`     ativo:          ${tenant.ativo} ${tenant.ativo ? '' : '⚠️ → 403'}`);
console.log(`     plano.status:   ${tenant.plano?.status}`);

if (!tenant.ativo) {
    console.log('❌ tenant.ativo === false → "Empresa não encontrada ou desativada" (403)');
    await mongoose.disconnect();
    process.exit(0);
}

if (tenant.plano.status === 'cancelado' || tenant.plano.status === 'expirado') {
    console.log(`❌ tenant.plano.status === "${tenant.plano.status}" → "Plano expirado" (403)`);
    await mongoose.disconnect();
    process.exit(0);
}

console.log('\n✅ Login devia passar — não há razão para 403 segundo a lógica do controller');
console.log('   → Se o servidor real dá 403, há discrepância (cache/réplica/outro middleware)');

await mongoose.disconnect();
