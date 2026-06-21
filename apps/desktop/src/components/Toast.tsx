interface ToastProps {
  visible: boolean;
  message: string;
  onClick?: () => void;
}

export default function Toast({ visible, message, onClick }: ToastProps) {
  if (!visible) return null;
  return (
    <div className="toast-container">
      <div
        className="toast-bubble"
        onClick={onClick}
        style={onClick ? { cursor: "pointer" } : undefined}
      >
        <span style={{ fontSize: "14px" }}>⚠️</span>
        <span>{message}</span>
      </div>
    </div>
  );
}
