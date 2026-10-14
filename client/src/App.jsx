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

function Login() {
  const next = new URLSearchParams(useLocation().search).get('next') || '/';
  const error = new URLSearchParams(useLocation().search).get('error');
  return (
    <main>
      <div className="card stack">
        <h1>smxForm</h1>
        {error && <p className="error">Cal un compte @inspalamos.cat.</p>}
        <a href={`/auth/google?next=${encodeURIComponent(next)}`}>
          <button>Entra amb Google (@inspalamos.cat)</button>
        </a>
      </div>
    </main>
  );
}

function Layout({ user, children }) {
  const qc = useQueryClient();
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    qc.clear();
    window.location.href = '/login';
  };
  return (
    <>
      <header className="top">
        <nav>
          <Link to="/s">Zona alumne</Link>
          {user.role === 'TEACHER' && <Link to="/t">Zona professor</Link>}
        </nav>
        <span>
          {user.email} <button className="secondary" onClick={logout}>Surt</button>
        </span>
      </header>
      <main>{children}</main>
    </>
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
      <Route path="/" element={<Home />} />
      <Route path="/s" element={<Protected><StudentHome /></Protected>} />
      <Route path="/q/:slug" element={<Protected><QuizLanding /></Protected>} />
      <Route path="/attempt/:id" element={<Protected><TakeQuiz /></Protected>} />
      <Route path="/t" element={<Protected teacher><TeacherHome /></Protected>} />
      <Route path="/t/quiz/:id" element={<Protected teacher><QuizEditor /></Protected>} />
      <Route path="/t/quiz/:id/attempts" element={<Protected teacher><Attempts /></Protected>} />
      <Route path="/t/attempt/:id" element={<Protected teacher><AttemptReview /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
