import mongoose from 'mongoose';

const userSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: String, // ✨ CORREÇÃO: Aceita String (ex: "LAURA") ou ObjectId como string
    required: false,
    index: true, // Adiciona índice para busca rápida
  },
  endpoint: {
    type: String,
    required: [true, 'Endpoint é obrigatório'],
    unique: true,
  },
  keys: {
    auth: {
      type: String,
      required: true,
    },
    p256dh: {
      type: String,
      required: true,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastSyncAt: {
    type: Date,
    default: null,
  },
  active: {
    type: Boolean,
    default: true,
  },
});

export default mongoose.model('UserSubscription', userSubscriptionSchema);
