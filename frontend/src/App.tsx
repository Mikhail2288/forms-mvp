import { Routes, Route, Link, useLocation } from 'react-router-dom';
import AdminList from './pages/AdminList';
import AdminCreate from './pages/AdminCreate';
import PublicForm from './pages/PublicForm';
import AdminResponses from './pages/AdminResponses';

function App() {
    const location = useLocation();
    // Проверяем, находимся ли мы в админке
    const isAdminRoute = location.pathname.startsWith('/admin');

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            {/* Навигация рендерится только для админки */}
            {isAdminRoute && (
                <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-blue-600">Career Form MVP</h1>
                    <div className="space-x-4">
                        <Link to="/admin" className="text-gray-600 hover:text-blue-600 font-medium">
                            Список форм
                        </Link>
                        <Link to="/admin/create" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition">
                            Создать форму
                        </Link>
                    </div>
                </nav>
            )}

            <main className={isAdminRoute ? "max-w-5xl mx-auto p-6" : "max-w-2xl mx-auto p-6 mt-10"}>
                <Routes>
                    <Route path="/admin" element={<AdminList />} />
                    <Route path="/admin/create" element={<AdminCreate />} />
                    <Route path="/f/:uuid" element={<PublicForm />} />
                    <Route path="/admin/responses/:uuid" element={<AdminResponses />} />
                    <Route path="*" element={<div className="text-center py-10 text-gray-500">Страница не найдена</div>} />
                </Routes>
            </main>
        </div>
    );
}

export default App;