interface ToastProps {
  visible: boolean;
  message: string;
}

export default function Toast({ visible, message }: ToastProps) {
  if (!visible) return null;
  return (
    <div className="toast-container">
      <div className="toast-bubble">
        <span style={{ fontSize: "14px" }}>⚠️</span>
        <span>{message}</span>
      </div>
    </div>
  );
}
