import { DateTime } from 'luxon';

const ZONA = 'Europe/Lisbon';

// Dia da semana em PT-PT por índice (0=domingo). Hardcoded de propósito: não
// depende de ICU/locale do container e é determinístico nos testes.
const DIAS_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/**
 * Data absoluta por extenso para lembretes: "sexta-feira, 19/06 às 14:00".
 *
 * Substitui o tempo relativo ("amanhã", "daqui a 2 dias", "em 1 hora") por uma
 * data clara e à prova de timing — se um job disparar com atraso, a mensagem
 * continua correcta.
 *
 * @param {string|Date} dataHora  ISO string ou Date
 * @returns {string}  ex: "sexta-feira, 19/06 às 14:00" (ou '' se inválida)
 */
export function formatarDataLembrete(dataHora) {
  const dt = (typeof dataHora === 'string'
    ? DateTime.fromISO(dataHora)
    : DateTime.fromJSDate(new Date(dataHora))
  ).setZone(ZONA);

  if (!dt.isValid) return '';

  const dia = DIAS_SEMANA[dt.weekday === 7 ? 0 : dt.weekday];
  return `${dia}, ${dt.toFormat("dd/MM 'às' HH:mm")}`;
}
