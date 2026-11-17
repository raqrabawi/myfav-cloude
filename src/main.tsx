import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { EmailVerificationModal } from './components/EmailVerificationModal.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { PasswordRecoveryModal } from './components/PasswordRecoveryModal.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
    <PasswordRecoveryModal />
    <EmailVerificationModal />
  </ErrorBoundary>
);
