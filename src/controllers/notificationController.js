import UserSubscription from '../models/UserSubscription.js';

// ✅ 1. Frontend envia subscription
export const subscribeUser = async (req, res) => {
  try {
    const { subscription, userId } = req.body;

    // Validar
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ 
        error: 'Subscription endpoint é obrigatório' 
      });
    }

    // Buscar subscription existente
    let userSub = await UserSubscription.findOne({ 
      endpoint: subscription.endpoint 
    });

    if (userSub) {
      // Atualizar se já existe
      userSub.active = true;
      userSub.lastSyncAt = new Date();
      await userSub.save();
    } else {
      // Criar nova
      userSub = await UserSubscription.create({
        userId: userId || null,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      });
    }

    console.log('[NotificationController] ✅ Subscription guardada:', userSub._id);

    res.status(201).json({ 
      success: true, 
      message: 'Subscription guardada com sucesso',
      subscriptionId: userSub._id 
    });
  } catch (error) {
    console.error('[NotificationController] ❌ Erro ao guardar subscription:', error);
    res.status(500).json({ error: 'Erro ao guardar subscription' });
  }
};

// ✅ 2. Desinscrever
export const unsubscribeUser = async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint é obrigatório' });
    }

    const result = await UserSubscription.updateOne(
      { endpoint },
      { active: false }
    );

    console.log('[NotificationController] ✅ Subscription desativada');

    res.status(200).json({ 
      success: true, 
      message: 'Desinscrição realizada com sucesso' 
    });
  } catch (error) {
    console.error('[NotificationController] ❌ Erro ao desinscrever:', error);
    res.status(500).json({ error: 'Erro ao desinscrever' });
  }
};

// ✅ 3. Obter status
export const getSubscriptionStatus = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'UserId é obrigatório' });
    }

    const subscription = await UserSubscription.findOne({
      userId,
      active: true,
    });

    res.status(200).json({
      subscribed: !!subscription,
      subscriptionId: subscription?._id,
    });
  } catch (error) {
    console.error('[NotificationController] ❌ Erro ao obter status:', error);
    res.status(500).json({ error: 'Erro ao obter status' });
  }
};