import { toast } from 'react-toastify';

// Configurações base para todos os toasts
const baseConfig = {
    position: 'top-right',
    autoClose: 4000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    progress: undefined,
};

// Toast de sucesso
export const showSuccess = (message, options = {}) => {
    toast.success(message, {
        ...baseConfig,
        ...options,
        className: 'toast-success-custom',
        icon: '✅',
    });
};

// Toast de erro
export const showError = (message, options = {}) => {
    toast.error(message, {
        ...baseConfig,
        autoClose: 5000, // Erros ficam mais tempo
        ...options,
        className: 'toast-error-custom',
        icon: '❌',
    });
};

// Toast de aviso
export const showWarning = (message, options = {}) => {
    toast.warning(message, {
        ...baseConfig,
        ...options,
        className: 'toast-warning-custom',
        icon: '⚠️',
    });
};

// Toast de informação
export const showInfo = (message, options = {}) => {
    toast.info(message, {
        ...baseConfig,
        ...options,
        className: 'toast-info-custom',
        icon: 'ℹ️',
    });
};

// Toast de loading (retorna ID para poder fechar depois)
export const showLoading = (message = 'Carregando...') => {
    return toast.loading(message, {
        position: 'top-right',
        className: 'toast-loading-custom',
    });
};

// Atualizar toast de loading para sucesso/erro
export const updateToast = (toastId, type, message) => {
    const typeConfig = {
        success: { icon: '✅', className: 'toast-success-custom' },
        error: { icon: '❌', className: 'toast-error-custom' },
        warning: { icon: '⚠️', className: 'toast-warning-custom' },
        info: { icon: 'ℹ️', className: 'toast-info-custom' },
    };

    toast.update(toastId, {
        render: message,
        type: type,
        isLoading: false,
        autoClose: type === 'error' ? 5000 : 4000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        ...typeConfig[type],
    });
};

// Toast de confirmação com ação
export const showConfirmation = (message, onConfirm, onCancel) => {
    toast(
        ({ closeToast }) => (
            <div className="flex flex-col gap-3">
                <p className="text-sm">{message}</p>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={() => {
                            if (onCancel) onCancel();
                            closeToast();
                        }}
                        className="px-3 py-1.5 text-xs rounded-lg bg-slate-600 hover:bg-slate-500 text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            if (onConfirm) onConfirm();
                            closeToast();
                        }}
                        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        ),
        {
            position: 'top-center',
            autoClose: false,
            closeOnClick: false,
            draggable: false,
            className: 'toast-confirmation-custom',
        }
    );
};

// Toast personalizado para WhatsApp
export const showWhatsAppSuccess = (clienteNome) => {
    toast.success(
        <div className="flex items-center gap-2">
            <span className="text-lg">📱</span>
            <span>Lembrete enviado para <strong>{clienteNome}</strong>!</span>
        </div>,
        {
            ...baseConfig,
            className: 'toast-whatsapp-custom',
        }
    );
};

// Exportar objeto com todos os métodos
const toastService = {
    success: showSuccess,
    error: showError,
    warning: showWarning,
    info: showInfo,
    loading: showLoading,
    update: updateToast,
    confirm: showConfirmation,
    whatsapp: showWhatsAppSuccess,
};

export default toastService;
