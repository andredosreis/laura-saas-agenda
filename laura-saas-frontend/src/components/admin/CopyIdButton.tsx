import type { MouseEvent } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'react-toastify';

interface CopyIdButtonProps {
  id: string;
  label?: string;
}

export function CopyIdButton({ id, label = 'Copiar ID' }: CopyIdButtonProps) {
  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API indisponível');
      }

      await navigator.clipboard.writeText(id);
      toast.success('ID copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className="group -m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] text-dark-400 transition-colors hover:text-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
    >
      <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-transparent transition-colors group-hover:border-white/10 group-hover:bg-white/5">
        <Copy className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
