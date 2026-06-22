import mongoose from 'mongoose';

// ⚠️ DIAGNÓSTICO TEMPORÁRIO — Fase 3 do plano de inbox (docs/plano-inbox-completo.md).
// Captura DURÁVEL de payloads @lid (ao contrário dos docker logs, sobrevive a
// restarts/deploys) para descobrir onde o Evolution v2 põe o número real.
// TTL: cada documento auto-expira em 7 dias. Remover o model + a escrita em
// logLidParaFase3 assim que a Fase 3 estiver decidida/implementada.
const lidCaptureSchema = new mongoose.Schema(
  {
    direcao: { type: String, enum: ['entrada', 'saida'] },
    remoteJid: String,
    instance: String,
    payload: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

// Auto-limpeza: expira 7 dias após createdAt.
lidCaptureSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model('LidCapture', lidCaptureSchema);
