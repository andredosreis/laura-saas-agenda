import UserSubscription from '../../models/UserSubscription.js';

// ✅ 1. Frontend envia subscription
export const subscribeUser = async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(403).json({
        success: false,
        error: 'Subscrições Push estão disponíveis apenas para utilizadores de uma empresa',
      });
    }

    const { subscription } = req.body;
    const userId = String(req.user.userId);
    const tenantId = req.tenantId;

    // Buscar subscription existente
    let userSub = await UserSubscription.findOne({ 
      endpoint: subscription.endpoint 
    });

    if (userSub) {
      // O endpoint identifica a subscrição do browser. Ao trocar de conta,
      // reassociá-lo explicitamente à identidade autenticada actual.
      userSub.userId = userId;
      userSub.tenantId = tenantId;
      userSub.keys = subscription.keys;
      userSub.active = true;
      userSub.lastSyncAt = new Date();
      await userSub.save();
    } else {
      // Criar nova
      userSub = await UserSubscription.create({
        tenantId,
        userId,
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
    if (!req.tenantId) {
      return res.status(403).json({
        success: false,
        error: 'Subscrições Push estão disponíveis apenas para utilizadores de uma empresa',
      });
    }

    const { endpoint } = req.body;

    const result = await UserSubscription.updateOne(
      { endpoint, tenantId: req.tenantId, userId: String(req.user.userId) },
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
    if (!req.tenantId) {
      return res.status(403).json({
        success: false,
        error: 'Subscrições Push estão disponíveis apenas para utilizadores de uma empresa',
      });
    }

    const subscription = await UserSubscription.findOne({
      tenantId: req.tenantId,
      userId: String(req.user.userId),
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
