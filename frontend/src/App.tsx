import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { PublicForm } from './components/PublicForm';
import { AdminPanel } from './components/AdminPanel';

// Обертка для публичной формы, чтобы брать UUID из URL
const PublicFormPage: React.FC = () => {
    // Берем UUID из URL (например, /form/12345...)
    // Если UUID нет в URL, можно показать форму по умолчанию или ошибку
    const pathParts = window.location.pathname.split('/');
    const formUuid = pathParts[pathParts.length - 1] || '';

    if (!formUuid) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">Форма не найдена</h1>
                    <Link to="/admin" className="text-indigo-600 hover:underline">Перейти в админку</Link>
                </div>
            </div>
        );
    }

    return <PublicForm formUuid={formUuid} />;
};

function App() {
    return (
        <Router>
            <div className="min-h-screen bg-gray-100">
                {/* Простая навигация для удобства тестирования */}
                <nav className="bg-white shadow-sm p-4 mb-8">
                    <div className="max-w-4xl mx-auto flex gap-4">
                        <Link to="/admin" className="text-indigo-600 font-medium hover:text-indigo-800">Админка (Создать форму)</Link>
                        <span className="text-gray-300">|</span>
                        <Link to="/" className="text-gray-600 hover:text-gray-800">Главная</Link>
                    </div>
                </nav>

                <Routes>
                    {/* Маршрут админки по ТЗ */}
                    <Route path="/admin" element={<AdminPanel />} />

                    {/* Маршрут публичной формы по ссылке из админки */}
                    <Route path="/form/:uuid" element={<PublicFormPage />} />

                    {/* Дефолтный маршрут (можно оставить пустым или редирект) */}
                    <Route path="/" element={
                        <div className="max-w-2xl mx-auto p-8 text-center">
                            <h1 className="text-3xl font-bold text-gray-800 mb-4">Сервис кастомных форм отклика</h1>
                            <p className="text-gray-600 mb-6">Перейдите в админку, чтобы создать новую форму для студентов.</p>
                            <Link to="/admin" className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                                Создать форму
                            </Link>
                        </div>
                    } />
                </Routes>
            </div>
        </Router>
    );
}

export default App;