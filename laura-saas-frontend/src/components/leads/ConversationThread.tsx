import { useEffect, useRef } from 'react';
import { MessageSquare, Bot, User, Headset } from 'lucide-react';

export interface ThreadMessage {
  _id: string;
  mensagem: string;
  origem: 'cliente' | 'laura';
  /** Quem produziu o outbound: 'ia' (agente) ou 'humano' (resposta manual no inbox). Ausente em mensagens antigas → tratado como IA. */
  geradoPor?: 'ia' | 'humano' | 'cliente';
  data: string;
}

interface ConversationThreadProps {
  messages: ThreadMessage[];
  isPolling: boolean;
  isDarkMode: boolean;
}

function formatHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function formatDia(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

export function ConversationThread({ messages, isDarkMode }: ConversationThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Scroll fiável até ao fim: mexer no scrollTop do próprio container é mais
  // robusto que scrollIntoView (que falhava a esconder a última mensagem atrás
  // do composer). Re-corre quando muda o nº de mensagens OU a última (id/texto)
  // — cobre o envio otimista + a reconciliação do refetch sem scrollar a cada poll.
  const lastId = messages[messages.length - 1]?._id;
  const lastText = messages[messages.length - 1]?.mensagem;

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastId, lastText]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
          <MessageSquare className={`w-7 h-7 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
        </div>
        <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          Sem mensagens ainda
        </p>
        <p className={`text-xs max-w-xs ${isDarkMode ? 'text-slate-600' : 'text-gray-400'}`}>
          As mensagens trocadas via WhatsApp aparecerão aqui quando o ia-service estiver activo.
        </p>
      </div>
    );
  }

  // Agrupa mensagens por dia
  const grupos: { dia: string; msgs: ThreadMessage[] }[] = [];
  for (const msg of messages) {
    const dia = formatDia(msg.data);
    const last = grupos[grupos.length - 1];
    if (last && last.dia === dia) {
      last.msgs.push(msg);
    } else {
      grupos.push({ dia, msgs: [msg] });
    }
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {grupos.map(({ dia, msgs }) => (
        <div key={dia}>
          {/* Day separator */}
          <div className="flex items-center gap-3 my-3">
            <div className={`flex-1 h-px ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>
              {dia}
            </span>
            <div className={`flex-1 h-px ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
          </div>

          <div className="space-y-2">
            {msgs.map((msg) => {
              const isOutbound = msg.origem === 'laura';
              const isHuman = isOutbound && msg.geradoPor === 'humano';
              return (
                <div key={msg._id} className={`flex items-end gap-2 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar: humano (resposta manual) vs IA vs cliente */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    !isOutbound
                      ? isDarkMode ? 'bg-white/10 text-slate-400' : 'bg-gray-200 text-gray-500'
                      : isHuman
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-indigo-500/20 text-indigo-400'
                  }`}>
                    {!isOutbound
                      ? <User className="w-4 h-4" />
                      : isHuman
                        ? <Headset className="w-4 h-4" />
                        : <Bot className="w-4 h-4" />
                    }
                  </div>
                  {/* Bubble — humano usa verde para se distinguir da IA (indigo) */}
                  <div className={`max-w-xs lg:max-w-sm xl:max-w-md rounded-2xl px-4 py-2.5 text-sm ${
                    !isOutbound
                      ? isDarkMode ? 'bg-slate-700 text-white rounded-bl-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                      : isHuman
                        ? 'bg-emerald-600 text-white rounded-br-sm'
                        : 'bg-indigo-500 text-white rounded-br-sm'
                  }`}>
                    {isOutbound && (
                      <p className={`text-[10px] font-semibold mb-0.5 ${isHuman ? 'text-emerald-100' : 'text-indigo-200'}`}>
                        {isHuman ? '👩 Laura (manual)' : '🤖 IA'}
                      </p>
                    )}
                    <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.mensagem}</p>
                    <p className={`text-xs mt-1 text-right ${
                      !isOutbound ? (isDarkMode ? 'text-slate-500' : 'text-gray-400') : isHuman ? 'text-emerald-200' : 'text-indigo-200'
                    }`}>
                      {formatHora(msg.data)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
