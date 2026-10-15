import React from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import StudentHome from './pages/StudentHome.jsx';
import QuizLanding from './pages/QuizLanding.jsx';
import TakeQuiz from './pages/TakeQuiz.jsx';
import TeacherHome from './pages/TeacherHome.jsx';
import QuizEditor from './pages/QuizEditor.jsx';
import Attempts from './pages/Attempts.jsx';
import AttemptReview from './pages/AttemptReview.jsx';
import QuestionReview from './pages/QuestionReview.jsx';
import PortableFormatDocs from './pages/PortableFormatDocs.jsx';
import QuizPreview from './pages/QuizPreview.jsx';
import ArchitectureArt from './components/ArchitectureArt.jsx';

function Login() {
  const next = new URLSearchParams(useLocation().search).get('next') || '/';
  const error = new URLSearchParams(useLocation().search).get('error');
  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-brand"><span className="brand-mark"><i /><i /><i /><i /></span> palamForm <span className="login-edition">INSTITUT DE PALAMÓS</span></div>
        <div className="login-copy">
          <span className="eyebrow">ESPAI DIGITAL · INSPALAMOS</span>
          <h1>Aprendre.<br /><span>Crear. Avançar.</span></h1>
          <p>Un espai comú per a cada pregunta i cada idea.</p>
        </div>
        <ArchitectureArt />
        <span className="login-coordinate">41.85° N &nbsp; 3.12° E</span>
      </section>
      <section className="login-panel">
        <div className="login-panel-inner">
          <span className="eyebrow">ACCÉS SEGUR</span>
          <h2>Benvingut/da</h2>
          <p className="muted">Entra amb el teu compte del centre per continuar.</p>
          {error && <p className="error">Cal un compte @inspalamos.cat.</p>}
          <a className="button button-primary login-submit" href={`/auth/google?next=${encodeURIComponent(next)}`}>
            Entra amb Google <span aria-hidden="true">↗</span>
          </a>
          {import.meta.env.DEV && <a className="login-note" href="/auth/dev?n=1">Dev: entra com a alumne de prova</a>}
          <p className="login-note">Només comptes @inspalamos.cat</p>
        </div>
        <span className="login-version">palamForm / 01</span>
      </section>
    </main>
  );
}

function Layout({ user, children }) {
  const qc = useQueryClient();
  const location = useLocation();
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    qc.clear();
    window.location.href = '/login';
  };
  return (
    <div className="app-shell">
      <div className="announcement-bar"><span>palamForm</span><span>ENTORN D'APRENENTATGE DIGITAL</span><span className="announcement-status"><i /> OPERATIU</span></div>
      <header className="top app-header">
        <Link className="brand-lockup" to={user.role === 'TEACHER' ? '/t' : '/s'} aria-label="palamForm, inici">
          <span className="brand-mark"><i /><i /><i /><i /></span><span>palam<span>Form</span></span>
        </Link>
        <nav className="app-nav" aria-label="Navegació principal">
          <Link to="/s" className={location.pathname.startsWith('/s') || location.pathname.startsWith('/q') || location.pathname.startsWith('/attempt') ? 'active' : ''}>Alumne</Link>
          {user.role === 'TEACHER' && <Link to="/t" className={location.pathname.startsWith('/t') ? 'active' : ''}>Professorat</Link>}
        </nav>
        <div className="account-nav"><span className="account-email">{user.email}</span><button className="logout-button" onClick={logout}>Surt <span aria-hidden="true">↗</span></button></div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer"><span>Desenvolupat per @aniollidon </span><span>INSTITUT PALAMÓS<span className="footer-coordinate">· 41.85° N</span></span></footer>
    </div>
  );
}

function Protected({ children, teacher }) {
  const location = useLocation();
  const { data: user, isLoading, error } = useQuery({ queryKey: ['me'], queryFn: () => api('/api/me') });
  if (isLoading) return <main>Carregant…</main>;
  if (error || !user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (teacher && user.role !== 'TEACHER') return <Layout user={user}><p className="error">Accés només per a professors.</p></Layout>;
  return <Layout user={user}>{children}</Layout>;
}

function Home() {
  const { data: user, isLoading } = useQuery({ queryKey: ['me'], queryFn: () => api('/api/me'), retry: false });
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'TEACHER' ? '/t' : '/s'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/format" element={<PortableFormatDocs />} />
      <Route path="/" element={<Home />} />
      <Route path="/s" element={<Protected><StudentHome /></Protected>} />
      <Route path="/q/:slug" element={<Protected><QuizLanding /></Protected>} />
      <Route path="/attempt/:id" element={<Protected><TakeQuiz /></Protected>} />
      <Route path="/t" element={<Protected teacher><TeacherHome /></Protected>} />
      <Route path="/t/quiz/:id" element={<Protected teacher><QuizEditor /></Protected>} />
      <Route path="/t/quiz/:id/preview" element={<Protected teacher><QuizPreview /></Protected>} />
      <Route path="/t/quiz/:id/attempts" element={<Protected teacher><Attempts /></Protected>} />
      <Route path="/t/quiz/:id/question/:qid/answers" element={<Protected teacher><QuestionReview /></Protected>} />
      <Route path="/t/attempt/:id" element={<Protected teacher><AttemptReview /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
