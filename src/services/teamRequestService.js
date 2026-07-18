function canonicalPhone(raw) {
  return String(raw || '').replace(/\D/g, '').replace(/^351/, '');
}

/**
 * Guarda a relação pedido → contacto quando o alerta WhatsApp foi entregue.
 * Best-effort: uma falha de persistência não invalida o alerta já enviado.
 */
export async function registerTeamRequest({
  models,
  tenantId,
  contactType,
  contactId,
  contactName,
  contactPhone,
  reason,
}) {
  if (!models?.PedidoEquipa || !contactId || !contactPhone) return null;
  const fallbackName = `Contacto terminado em ${canonicalPhone(contactPhone).slice(-4)}`;
  return models.PedidoEquipa.create({
    tenantId,
    contactoTipo: contactType,
    contactoId: contactId,
    contactoNome: String(contactName || fallbackName).slice(0, 200),
    contactoTelefone: contactPhone,
    motivo: String(reason || 'Pedido de apoio da equipa.').slice(0, 500),
  });
}
