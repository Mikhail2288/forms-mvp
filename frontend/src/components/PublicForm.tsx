import React, { useEffect, useState, useRef } from 'react';

type FieldType = 'text' | 'checkbox' | 'select';
interface FormField {
    field_uuid: string;
    type: FieldType;
    label: string;
    is_required: boolean;
    options?: string[];
}
interface FormSchema {
    id: number;
    title: string;
    fields: FormField[];
}

type AnalyticsEvent = 'focus' | 'blur' | 'abandon' | 'submit';

const sendAnalytics = (formUuid: string, sessionId: string, fieldUuid: string | null, eventType: AnalyticsEvent) => {
    const payload = JSON.stringify({ formUuid, sessionId, fieldUuid, eventType });
    const apiUrl = '/api/public/analytics';

    if (eventType === 'abandon' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(apiUrl, blob);
    } else {
        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
        }).catch(console.error);
    }
};

export const PublicForm: React.FC<{ formUuid: string }> = ({ formUuid }) => {
    const [schema, setSchema] = useState<FormSchema | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
    const [isSubmitted, setIsSubmitted] = useState(false);

    const sessionId = useRef<string>(crypto.randomUUID());
    const isSubmittedRef = useRef(false);

    // 🔥 НОВЫЙ REFS: Гарантирует, что abandon уйдет только 1 раз
    const hasAbandonSentRef = useRef(false);

    useEffect(() => {
        const apiUrl = `/api/public/forms/${formUuid}`;

        fetch(apiUrl)
            .then(async (res) => {
                const text = await res.text();
                if (!res.ok) throw new Error(`Сервер вернул ошибку ${res.status}: ${text}`);
                try { return JSON.parse(text); }
                catch { throw new Error(`Сервер вернул не JSON: ${text}`); }
            })
            .then(data => { setSchema(data); setError(null); })
            .catch(err => { console.error("Ошибка загрузки формы:", err); setError(err.message); });

        // --- ТОЧНАЯ АНАЛИТИКА ОТТОКА (БЕЗ ДУБЛЕЙ) ---
        const sendAbandon = (event: Event) => {
            // Если уже отправили форму ИЛИ уже отправили abandon - выходим
            if (isSubmittedRef.current || hasAbandonSentRef.current) return;

            // Блокируем повторную отправку
            hasAbandonSentRef.current = true;

            console.log(`🚪 Отправка abandon (причина: ${event.type})...`);
            sendAnalytics(formUuid, sessionId.current, null, 'abandon');
        };

        // Используем ТОЛЬКО pagehide как основной триггер (он надежнее и не дублируется так часто)
        window.addEventListener('pagehide', sendAbandon);

        // beforeunload оставляем как fallback для очень старых браузеров
        window.addEventListener('beforeunload', sendAbandon);

        return () => {
            window.removeEventListener('pagehide', sendAbandon);
            window.removeEventListener('beforeunload', sendAbandon);
        };
    }, [formUuid]);

    const handleFieldChange = (fieldUuid: string, value: string | boolean) => {
        setAnswers(prev => ({ ...prev, [fieldUuid]: value }));
    };

    // 🔥 ДОБАВИЛИ ЛОГИРОВАНИЕ ВРЕМЕНИ, ЧТОБЫ ПРОВЕРИТЬ "МГНОВЕННЫЙ" BLUR
    const handleFocus = (fieldUuid: string) => {
        console.log(`FOCUS: ${fieldUuid} | Time: ${Date.now()}`);
        sendAnalytics(formUuid, sessionId.current, fieldUuid, 'focus');
    };

    const handleBlur = (fieldUuid: string) => {
        console.log(`BLUR: ${fieldUuid} | Time: ${Date.now()}`);
        sendAnalytics(formUuid, sessionId.current, fieldUuid, 'blur');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!schema) return;

        const missingRequired = schema.fields.filter(f => f.is_required && !answers[f.field_uuid]);
        if (missingRequired.length > 0) {
            alert(`Пожалуйста, заполните обязательные поля: ${missingRequired.map(f => f.label).join(', ')}`);
            return;
        }

        await fetch(`/api/public/forms/${formUuid}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId.current, answers }),
        });

        isSubmittedRef.current = true;
        sendAnalytics(formUuid, sessionId.current, null, 'submit');
        setIsSubmitted(true);
    };

    if (error) {
        return (
            <div className="max-w-2xl mx-auto p-6 bg-red-50 border border-red-200 rounded-lg text-center">
                <h2 className="text-xl font-bold text-red-600 mb-2">Не удалось загрузить форму</h2>
                <p className="text-red-700">{error}</p>
            </div>
        );
    }

    if (!schema) return <div className="p-4 text-center">Загрузка...</div>;
    if (isSubmitted) return <div className="p-8 text-center text-green-600 text-xl">Спасибо! Ваш отклик отправлен.</div>;

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 bg-white shadow-lg rounded-lg space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">{schema.title}</h1>

            {schema.fields.map((field) => (
                <div key={field.field_uuid} className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                        {field.label}
                        {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    {field.type === 'text' && (
                        <input
                            type="text"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            onFocus={() => handleFocus(field.field_uuid)}
                            onBlur={() => handleBlur(field.field_uuid)}
                            onChange={(e) => handleFieldChange(field.field_uuid, e.target.value)}
                            value={(answers[field.field_uuid] as string) || ''}
                        />
                    )}

                    {field.type === 'checkbox' && (
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                onFocus={() => handleFocus(field.field_uuid)}
                                onBlur={() => handleBlur(field.field_uuid)}
                                checked={(answers[field.field_uuid] as boolean) || false}
                                onChange={(e) => handleFieldChange(field.field_uuid, e.target.checked)}
                            />
                            <span className="ml-2 text-sm text-gray-600">Согласен с условиями</span>
                        </div>
                    )}

                    {field.type === 'select' && (
                        <select
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            onFocus={() => handleFocus(field.field_uuid)}
                            onBlur={() => handleBlur(field.field_uuid)}
                            onChange={(e) => handleFieldChange(field.field_uuid, e.target.value)}
                            value={(answers[field.field_uuid] as string) || ''}
                        >
                            <option value="">Выберите вариант</option>
                            {field.options?.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    )}
                </div>
            ))}

            <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
                Отправить отклик
            </button>
        </form>
    );
};