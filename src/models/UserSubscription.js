import mongoose from 'mongoose';

const userSubscriptionSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
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

userSubscriptionSchema.index({ tenantId: 1, userId: 1, active: 1 });

export default mongoose.model('UserSubscription', userSubscriptionSchema);
