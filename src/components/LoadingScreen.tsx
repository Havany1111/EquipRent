interface LoadingScreenProps {
  message: string;
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <div className="loading-screen-card">
        <div className="loading-screen-brand">
          <span className="brand-name">Equip<span>Rent</span></span>
        </div>
        <div className="loading-screen-spinner" aria-hidden="true" />
        <p className="loading-screen-message">{message}</p>
        <span className="loading-screen-caption">Connecting securely to your workspace</span>
      </div>
    </main>
  );
}
