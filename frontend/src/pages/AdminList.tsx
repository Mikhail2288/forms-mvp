import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiForm } from '../api';

export default function AdminList() {
    const [forms, setForms] = useState<ApiForm[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadForms();
    }, []);

    const loadForms = async () => {
        try {
            setLoading(true);
            const data = await api.getForms();
            setForms(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
        } finally {
            setLoading(false);
        }
    };

    const copyLink = (formId: string) => {
        // Формируем абсолютную ссылку на публичную форму
        const url = `${window.location.origin}/f/${formId}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('Ссылка скопирована в буфер обмена!');
        });
    };

    if (loading) return <div className="text-center py-10">Загрузка...</div>;
    if (error) return <div className="text-center py-10 text-red-600">Ошибка: {error}</div>;

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Ваши формы</h2>

            {forms.length === 0 ? (
                <div className="bg-white p-8 rounded-lg border border-gray-200 text-center text-gray-500">
                    У вас пока нет созданных форм.
                    <Link to="/admin/create" className="text-blue-600 hover:underline ml-1">Создать первую</Link>
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата создания</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                        </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                        {forms.map((form) => (
                            <tr key={form.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{form.title}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {new Date(form.created_at).toLocaleDateString('ru-RU')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                                    <Link
                                        to={`/admin/responses/${form.id}`}
                                        className="text-green-600 hover:text-green-900 font-medium"
                                    >
                                        Ответы
                                    </Link>
                                    <button
                                        onClick={() => copyLink(form.id)}
                                        className="text-blue-600 hover:text-blue-900 mr-4"
                                    >
                                        Копировать ссылку
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}