/**
 * Primeiro nome para mensagens dirigidas ao cliente — "Olá Dulce!" e não
 * "Olá Dulce Felicidades Gerra!". Mensagens para a equipa/admin continuam
 * a usar o nome completo (identificação da cliente).
 */
export function primeiroNome(nomeCompleto) {
  return String(nomeCompleto || '').trim().split(/\s+/)[0] || 'Cliente';
}
