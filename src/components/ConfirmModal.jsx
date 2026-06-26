import React from 'react';
import { createPortal } from 'react-dom';

const ConfirmModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirmar Acción",
    message = "¿Estás seguro de que deseas realizar esta acción?",
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    type = "confirm", // "confirm", "danger", "alert"
    icon = "❓"
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 11000 }}>
            <div className="modal-content alert-modal-content" onClick={e => e.stopPropagation()}>
                <span className="alert-modal-icon">{icon}</span>
                <h3 className="alert-modal-title">{title}</h3>
                <p className="alert-modal-text">{message}</p>

                <div className="alert-modal-actions">
                    {type !== 'alert' && (
                        <button className="alert-modal-btn cancel" onClick={onClose}>
                            {cancelText}
                        </button>
                    )}
                    <button
                        className={`alert-modal-btn ${type === 'danger' ? 'danger' : 'confirm'}`}
                        onClick={() => {
                            if (onConfirm) onConfirm();
                            onClose();
                        }}
                        style={type === 'alert' ? { width: '100%', flex: 'none' } : {}}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmModal;
