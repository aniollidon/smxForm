import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, fileUrl } from '../api';
import QuestionInput from '../components/QuestionInput.jsx';
import { formatGrade } from '../formatGrade.js';

const randomSeed = () => Math.floor(Math.random() * 2 ** 30);

export default function QuizPreview() {
  const { id, slug } = useParams();
  const key = id || slug;
  const [seed, setSeed] = useState(randomSeed);
  const endpoint = `${id ? `/api/teacher/quizzes/${id}` : `/api/teacher/quizzes/by-slug/${slug}`}?seed=${seed}`;
  const { data: quiz, isLoading, error } = useQuery({ queryKey: ['quiz-preview', key, seed], queryFn: () => api(endpoint) });

  if (isLoading) return <p>Carregant…</p>;
  if (error) return <p className="error">{error.message}</p>;

  return (
    <div className="quiz-preview">
      <div className="row between preview-toolbar">
        <Link to={id ? `/t/quiz/${id}` : '/t'}>{id ? '← Torna a l’editor' : '← Torna a les entregues'}</Link>
        <span className="row">
          {quiz.questions.some((q) => q.type === 'CALCULATED') && <button className="secondary" onClick={() => setSeed(randomSeed())}>Nous valors aleatoris</button>}
          <span className="badge">Previsualització</span>
        </span>
      </div>
      <h2>{quiz.title}</h2>
      {quiz.description && <p className="preview-description">{quiz.description}</p>}
      {quiz.questions.map((question, index) => (
        <div className="card stack" key={question.id}>
          <div>
            <b>{index + 1}. {question.text}</b>{' '}
            {question.required && <span className="error">*</span>}{' '}
                <span className="muted">({formatGrade(question.points)} pt)</span>
          </div>
          {question.type !== 'IMAGE_LABEL' && question.imageUrl && <img className="preview-question-image" src={fileUrl(question.imageUrl)} alt="" />}
          <div className="question-response">
            <QuestionInput q={question} value={question.type === 'MCQ' ? [] : undefined} disabled />
          </div>
        </div>
      ))}
      <div className="row preview-submit"><button disabled>Envia l’entrega</button></div>
    </div>
  );
}