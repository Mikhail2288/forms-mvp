import { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiForm, ApiFormField } from '../api';

export default function PublicForm() {
    const { uuid } = useParams<{ uuid: string }>();
    const [form, setForm] = useState<ApiForm | null>(null);
    const [values, setValues] = useState<Record<string, string | boolean | number>>({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Используем ref для хранения ID последнего поля.
    // Это нужно, чтобы слушатель visibilitychange всегда видел актуальное значение
    // без необходимости пересоздавать слушатель при каждом изменении стейта.
    const lastInteractedFieldRef = useRef<string | null>(null);
    const isSubmittedRef = useRef(false);

    useEffect(() => {
        if (!uuid) return;

        api.getFormByUuid(uuid)
            .then((data) => setForm(data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [uuid]);

    // Слушатель ухода со страницы
    useEffect(() => {
        const handleVisibilityChange = () => {
            // Срабатывает при скрытии вкладки или закрытии окна
            if (document.visibilityState === 'hidden') {
                const fieldId = lastInteractedFieldRef.current;
                // Отправляем дропаут только если форма еще не отправлена и есть активное поле
                if (fieldId && !isSubmittedRef.current && uuid) {
                    const url = `/api/forms/${uuid}/dropoff`;
                    const data = JSON.stringify({ fieldId });
                    // sendBeacon требует Blob, FormData или DOMString. Используем Blob для JSON.
                    const blob = new Blob([data], { type: 'application/json' });
                    navigator.sendBeacon(url, blob);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [uuid]);

    const handleFieldChange = (fieldId: string, value: string | boolean | number) => {
        setValues((prev) => ({ ...prev, [fieldId]: value }));
        // Фиксируем поле как последнее активное
        lastInteractedFieldRef.current = fieldId;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!uuid || !form) return;

        try {
            // Отмечаем форму как отправленную ДО запроса, чтобы дропаут не сработал параллельно
            isSubmittedRef.current = true;
            await api.submitResponse(uuid, values);
            setIsSubmitted(true);
        } catch (err) {
            isSubmittedRef.current = false; // Сбрасываем, если произошла ошибка сети
            setError(err instanceof Error ? err.message : 'Ошибка при отправке');
        }
    };

    if (loading) return <div className="text-center py-10">Загрузка формы...</div>;
    if (error) return <div className="text-center py-10 text-red-600">Ошибка: {error}</div>;
    if (!form) return <div className="text-center py-10">Форма не найдена</div>;

    // Экран успеха после отправки
    if (isSubmitted) {
        return (
            <div className="text-center py-20 bg-white rounded-lg shadow-sm border border-gray-200">
                <h2 className="text-2xl font-bold text-green-600 mb-2">Спасибо!</h2>
                <p className="text-gray-600">Ваши ответы успешно отправлены.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h1 className="text-2xl font-bold mb-6 text-gray-900">{form.title}</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
                {form.fields?.map((field) => (
                    <FormFieldRenderer
                        key={field.id}
                        field={field}
                        value={values[field.id]}
                        onChange={handleFieldChange}
                    />
                ))}

                <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 transition"
                >
                    Отправить
                </button>
            </form>
        </div>
    );
}

// Отдельный компонент для рендера поля, чтобы изолировать логику типов
function FormFieldRenderer({
                               field,
                               value,
                               onChange
                           }: {
    field: ApiFormField;
    value: string | boolean | number | undefined;
    onChange: (id: string, val: string | boolean | number) => void;
}) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const target = e.target;
        let newValue: string | boolean | number = target.value;

        if (field.type === 'checkbox') {
            newValue = (target as HTMLInputElement).checked;
        } else if (field.type === 'number') {
            newValue = target.value === '' ? '' : Number(target.value);
        }

        onChange(field.id, newValue);
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {field.type === 'text' && (
                <input
                    type="text"
                    value={(value as string) || ''}
                    onChange={handleChange}
                    required={field.required}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            )}

            {field.type === 'number' && (
                <input
                    type="number"
                    value={(value as number) || ''}
                    onChange={handleChange}
                    required={field.required}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            )}

            {field.type === 'select' && (
                <select
                    value={(value as string) || ''}
                    onChange={handleChange}
                    required={field.required}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                    <option value="" disabled>Выберите вариант</option>
                    {field.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            )}

            {field.type === 'checkbox' && (
                <div className="flex items-center">
                    <input
                        type="checkbox"
                        checked={(value as boolean) || false}
                        onChange={handleChange}
                        required={field.required}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-600">Да</span>
                </div>
            )}
        </div>
    );
}