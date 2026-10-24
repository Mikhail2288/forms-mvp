import React, { useState } from 'react';

export const AdminPanel: React.FC = () => {
    const [title, setTitle] = useState('');
    const [fields, setFields] = useState<any[]>([]);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const addField = () => {
        setFields([...fields, { type: 'text', label: '', is_required: false, options: '' }]);
    };

    const updateField = (index: number, key: string, value: any) => {
        const newFields = [...fields];
        newFields[index][key] = value;
        setFields(newFields);
    };

    const removeField = (index: number) => {
        setFields(fields.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 1. Создаем форму
            const createRes = await fetch('/api/manager/forms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    fields: fields.map(f => ({
                        type: f.type,
                        label: f.label,
                        is_required: f.is_required,
                        options: f.type === 'select' ? f.options.split(',').map((s: string) => s.trim()) : undefined,
                    })),
                }),
            });
            const createData = await createRes.json();

            // 2. Публикуем её
            const publishRes = await fetch(`/api/manager/forms/${createData.id}/publish`, {
                method: 'POST',
            });
            const publishData = await publishRes.json();

            // 3. Формируем публичную ссылку для фронтенда
            setGeneratedLink(`http://localhost:3000/form/${publishData.publicUrl.replace('/form/', '')}`);
        } catch (error) {
            console.error('Ошибка создания формы:', error);
            alert('Не удалось создать форму');
        } finally {
            setLoading(false);
        }
    };

    if (generatedLink) {
        return (
            <div className="max-w-2xl mx-auto p-8 bg-green-50 border border-green-200 rounded-lg text-center">
                <h2 className="text-2xl font-bold text-green-700 mb-4">Форма успешно создана и опубликована! 🎉</h2>
                <p className="text-gray-700 mb-4">Отправьте эту ссылку студентам:</p>
                <a
                    href={generatedLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-white border-2 border-green-500 rounded-md text-blue-600 font-mono text-lg hover:bg-green-50 transition"
                >
                    {generatedLink}
                </a>
                <button
                    onClick={() => { setGeneratedLink(null); setTitle(''); setFields([]); }}
                    className="mt-6 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                    Создать еще одну форму
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-6 bg-white shadow-lg rounded-lg">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Конструктор форм (Админка)</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Название формы</label>
                    <input
                        type="text"
                        required
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Например: Отклик на стажировку Frontend"
                    />
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium text-gray-700">Поля формы</h3>
                        <button
                            type="button"
                            onClick={addField}
                            className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-md text-sm hover:bg-indigo-200"
                        >
                            + Добавить поле
                        </button>
                    </div>

                    {fields.map((field, index) => (
                        <div key={index} className="p-4 bg-gray-50 rounded-md border border-gray-200 space-y-3">
                            <div className="flex gap-3">
                                <select
                                    className="px-3 py-2 border border-gray-300 rounded-md w-1/3"
                                    value={field.type}
                                    onChange={(e) => updateField(index, 'type', e.target.value)}
                                >
                                    <option value="text">Текст</option>
                                    <option value="select">Выпадающий список</option>
                                    <option value="checkbox">Чекбокс</option>
                                </select>
                                <input
                                    type="text"
                                    placeholder="Название поля (например, Email)"
                                    required
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                                    value={field.label}
                                    onChange={(e) => updateField(index, 'label', e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => removeField(index)}
                                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                                >
                                    Удалить
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id={`req-${index}`}
                                    checked={field.is_required}
                                    onChange={(e) => updateField(index, 'is_required', e.target.checked)}
                                    className="h-4 w-4 text-indigo-600 rounded"
                                />
                                <label htmlFor={`req-${index}`} className="text-sm text-gray-700">Обязательное поле</label>
                            </div>

                            {field.type === 'select' && (
                                <input
                                    type="text"
                                    placeholder="Варианты через запятую (например: 1 курс, 2 курс, 3 курс)"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    value={field.options}
                                    onChange={(e) => updateField(index, 'options', e.target.value)}
                                />
                            )}
                        </div>
                    ))}
                </div>

                <button
                    type="submit"
                    disabled={loading || fields.length === 0}
                    className="w-full py-3 px-4 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
                >
                    {loading ? 'Создание и публикация...' : 'Создать и опубликовать форму'}
                </button>
            </form>
        </div>
    );
};