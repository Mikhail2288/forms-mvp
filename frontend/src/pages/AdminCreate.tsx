import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiFormField } from '../api';

// Тип для нового поля без ID (ID генерирует бэкенд, но для UI нам нужен временный ключ)
type NewField = Omit<ApiFormField, 'id'> & { tempId: string };

export default function AdminCreate() {
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [fields, setFields] = useState<NewField[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Храним ссылки на DOM-элементы textarea для управления высотой
    const textareaRefs = useRef<Record<string, HTMLTextAreaElement>>({});

    const addField = () => {
        const newField: NewField = {
            tempId: crypto.randomUUID(),
            type: 'text',
            label: '',
            required: false,
            options: [],
            position: fields.length,
        };
        setFields([...fields, newField]);
    };

    const updateField = (tempId: string, updates: Partial<NewField>) => {
        setFields((prev) =>
            prev.map((f) => (f.tempId === tempId ? { ...f, ...updates } : f))
        );
    };

    const removeField = (tempId: string) => {
        setFields((prev) => prev.filter((f) => f.tempId !== tempId));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError('Введите название формы');
            return;
        }
        if (fields.length === 0) {
            setError('Добавьте хотя бы одно поле');
            return;
        }

        // Очищаем данные перед отправкой: убираем пустые строки из вариантов select
        const payload = {
            title,
            fields: fields.map(({ tempId, ...rest }) => {
                if (rest.type === 'select' && rest.options) {
                    // Вот здесь мы фильтруем пустые значения, но НЕ во время ввода!
                    return {
                        ...rest,
                        options: rest.options.filter(opt => opt.trim() !== '')
                    };
                }
                return rest;
            }),
        };

        try {
            setIsSubmitting(true);
            setError(null);
            await api.createForm(payload);
            navigate('/admin');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка при создании формы');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Создание новой формы</h2>

            {error && (
                <div className="mb-4 p-4 bg-red-50 text-red-700 border border-red-200 rounded-md">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Название формы */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Название формы</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Например: Стажировка Backend 2024"
                        required
                    />
                </div>

                {/* Список полей */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium text-gray-900">Поля формы</h3>
                        <button
                            type="button"
                            onClick={addField}
                            className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200 transition"
                        >
                            + Добавить поле
                        </button>
                    </div>

                    {fields.map((field, index) => (
                        <div key={field.tempId} className="p-4 bg-gray-50 border border-gray-200 rounded-md space-y-3">
                            <div className="flex justify-between items-start">
                                <span className="text-xs font-semibold text-gray-500 uppercase">Поле #{index + 1}</span>
                                <button
                                    type="button"
                                    onClick={() => removeField(field.tempId)}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                >
                                    Удалить
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Тип</label>
                                    <select
                                        value={field.type}
                                        onChange={(e) => updateField(field.tempId, { type: e.target.value as NewField['type'] })}
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                    >
                                        <option value="text">Текст</option>
                                        <option value="number">Число</option>
                                        <option value="select">Выпадающий список</option>
                                        <option value="checkbox">Чекбокс</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Название (Label)</label>
                                    <input
                                        type="text"
                                        value={field.label}
                                        onChange={(e) => updateField(field.tempId, { label: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                        placeholder="Например: Ваше имя"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id={`req-${field.tempId}`}
                                    checked={field.required}
                                    onChange={(e) => updateField(field.tempId, { required: e.target.checked })}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor={`req-${field.tempId}`} className="ml-2 text-sm text-gray-700">
                                    Обязательное поле
                                </label>
                            </div>

                            {/* блок: ввод вариантов только для типа 'select' */}
                            {field.type === 'select' && (
                                <div className="pt-2 border-t border-gray-200 mt-2">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Варианты ответа (каждый с новой строки)
                                    </label>
                                    <textarea
                                        ref={(el) => {
                                            if (el) textareaRefs.current[field.tempId] = el;
                                        }}
                                        value={field.options ? field.options.join('\n') : ''}
                                        onChange={(e) => {
                                            const opts = e.target.value.split('\n');
                                            updateField(field.tempId, { options: opts });
                                        }}
                                        onKeyDown={(e) => {
                                            // Гарантируем, что Enter не отправит форму, а только сделает перенос строки
                                            if (e.key === 'Enter') {
                                                e.stopPropagation();
                                            }
                                        }}
                                        onInput={(e) => {
                                            // Авто-расширение высоты
                                            const target = e.target as HTMLTextAreaElement;
                                            target.style.height = 'auto';
                                            target.style.height = `${target.scrollHeight}px`;
                                        }}
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono resize-none overflow-hidden transition-all duration-200"
                                        rows={1}
                                        placeholder="Москва&#10;СПб&#10;Казань"
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Кнопки действий */}
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={() => navigate('/admin')}
                        className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        Отмена
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Сохранение...' : 'Сохранить форму'}
                    </button>
                </div>
            </form>
        </div>
    );
}