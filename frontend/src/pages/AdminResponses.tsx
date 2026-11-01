import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiForm, ResponseItem, DropoffStat } from '../api';

export default function AdminResponses() {
    const { uuid } = useParams<{ uuid: string }>();
    const [form, setForm] = useState<ApiForm | null>(null);
    const [responses, setResponses] = useState<ResponseItem[]>([]);
    const [stats, setStats] = useState<DropoffStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!uuid) return;

        const loadData = async () => {
            try {
                setLoading(true);
                // Загружаем всё параллельно для скорости
                const [formData, responsesData, statsData] = await Promise.all([
                    api.getFormByUuid(uuid),
                    api.getResponses(uuid),
                    api.getDropoffStats(uuid),
                ]);

                setForm(formData);
                setResponses(responsesData);
                setStats(statsData);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [uuid]);

    if (loading) return <div className="text-center py-10">Загрузка...</div>;
    if (error) return <div className="text-center py-10 text-red-600">Ошибка: {error}</div>;
    if (!form) return <div className="text-center py-10">Форма не найдена</div>;

    return (
        <div className="space-y-8">
            {/* Шапка */}
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/admin" className="text-sm text-blue-600 hover:underline mb-2 inline-block">
                        ← Назад к списку форм
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900">{form.title}</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Всего ответов: {responses.length} | Уникальных полей: {form.fields?.length}
                    </p>
                </div>
            </div>

            {/* Блок 1: Аналитика оттока */}
            <section className="bg-white p-6 rounded-lg border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Аналитика оттока (Дропаут)</h2>
                {stats.length === 0 ? (
                    <p className="text-gray-500 text-sm">Пока нет зафиксированных уходов со страницы.</p>
                ) : (
                    <div className="space-y-3">
                        {stats.map((stat) => {
                            // Вычисляем процент для визуализации (от максимального значения)
                            const maxCount = stats[0].count;
                            const percentage = (stat.count / maxCount) * 100;

                            return (
                                <div key={stat.fieldId} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="font-medium text-gray-700">{stat.fieldLabel}</span>
                                        <span className="text-gray-500">{stat.count} уходов</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div
                                            className="bg-red-500 h-2 rounded-full"
                                            style={{ width: `${percentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Блок 2: Таблица ответов */}
            <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">Полученные ответы</h2>
                </div>

                {responses.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">Ответов пока нет.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                            <tr>
                                {form.fields?.map((field) => (
                                    <th
                                        key={field.id}
                                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                                    >
                                        {field.label}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Дата
                                </th>
                            </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                            {responses.map((response) => (
                                <tr key={response.id} className="hover:bg-gray-50">
                                    {form.fields?.map((field) => {
                                        const val = response.data[field.id];
                                        // Безопасное отображение любого типа данных
                                        const displayValue = val === undefined || val === null
                                            ? '-'
                                            : String(val);

                                        return (
                                            <td key={field.id} className="px-4 py-3 whitespace-nowrap text-gray-700 max-w-xs truncate" title={displayValue}>
                                                {displayValue}
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                                        {new Date(response.created_at).toLocaleString('ru-RU')}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}